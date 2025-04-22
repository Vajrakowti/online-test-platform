const express = require('express');
const path = require('path');
const session = require("express-session");
const MongoClient = require('mongodb').MongoClient;
const MongoStore = require('connect-mongo');

// Create two separate Express apps
const adminApp = express();
const userApp = express();

const url = "mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles";
let dbo;

// MongoDB connection options
const mongoOptions = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4
};

// Set max listeners to prevent memory leak warnings
require('events').EventEmitter.defaultMaxListeners = 30;

// Create MongoDB stores for sessions with proper event handling
const createMongoStore = (collectionName) => {
    const store = MongoStore.create({
        mongoUrl: url,
        mongoOptions: mongoOptions,
        dbName: 'School',
        collectionName: collectionName,
        ttl: 24 * 60 * 60,
        touchAfter: 60,
        stringify: false,
        autoRemove: 'native',
        autoRemoveInterval: 10,
        crypto: {
            secret: false
        }
    });
    
    // Explicitly set max listeners on the store instance
    store.setMaxListeners(30);
    
    return store;
}

// Create separate session configurations for admin and student apps
const createSessionConfig = (name) => ({
    secret: `your-secret-key-here-please-change-this-${name}`,
    resave: false,
    saveUninitialized: true,
    store: createMongoStore(`sessions_${name}`),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: false,
        sameSite: 'lax'
    },
    name: `session.id.${name}`
});

const adminSessionConfig = createSessionConfig('admin');
const userSessionConfig = createSessionConfig('student');

// Generate a unique token for each session 
function generateSecureToken() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15) + 
           Date.now().toString(36);
}

// Common middleware setup function
const setupApp = (app, role) => {
    app.use(express.urlencoded({ extended: false }));
    app.use(express.static(path.join(__dirname, 'public')));
    
    app.use('/student-photos', express.static(path.join(__dirname, 'public', 'student-photos')));
    app.use(express.json());
    
    // Apply session middleware with error handling
    app.use((req, res, next) => {
        session(role === 'admin' ? adminSessionConfig : userSessionConfig)(req, res, (err) => {
            if (err) {
                console.error(`${role} Session error:`, err);
                return res.redirect('/login?error=session_error');
            }
            next();
        });
    });
    
    // Strong anti-session hijacking protection
    app.use((req, res, next) => {
        // Define paths that don't need session protection
        const publicPaths = [
            '/login', 
            '/register', 
            '/', 
            '/change-password',
            '/api/change-password'
        ];
        
        // Allow public paths to pass through
        if (publicPaths.includes(req.path) || req.path.startsWith('/api/change-password')) {
            return next();
        }
        
        // Create security token for new sessions
        if (req.session && !req.session.securityToken) {
            req.session.securityToken = generateSecureToken();
            req.session.userAgent = req.headers['user-agent'];
            req.session.ipAddress = req.ip || req.connection.remoteAddress;
            req.session.lastAccessed = Date.now();
        }
        
        // Skip validation for initial session creation
        if (!req.session.securityToken) {
            return next();
        }
        
        // Validate existing sessions
        const currentUserAgent = req.headers['user-agent'];
        const currentIp = req.ip || req.connection.remoteAddress;
        
        // Multi-factor session validation
        const userAgentValid = req.session.userAgent === currentUserAgent;
        // IP validation can be problematic for users on mobile networks or VPNs
        // const ipValid = req.session.ipAddress === currentIp;
        // Just validate the session hasn't timed out (increased to 2 hours)
        const timeValid = (Date.now() - req.session.lastAccessed) < (120 * 60 * 1000); // 2 hours
        
        // Destroy session if validation fails
        if (!userAgentValid || !timeValid) {
            console.log(`${role} Session validation failed:`, {
                userAgentMatch: userAgentValid,
                timeValid: timeValid
            });
            req.session.destroy(() => {
                return res.redirect('/login?error=session_expired');
            });
            return;
        }
        
        // Update last accessed time
        req.session.lastAccessed = Date.now();
        
        // Set strong cache control headers to prevent caching
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.header('Expires', '-1');
        res.header('Pragma', 'no-cache');
        
        next();
    });
    
    // Role-specific route protection
    app.use((req, res, next) => {
        // Define paths that don't need authorization
        const publicPaths = [
            '/login', 
            '/register', 
            '/', 
            '/change-password',
            '/api/change-password',
            '/logout',
            '/api/check-session'
        ];
        
        // Allow public paths to pass through
        if (publicPaths.includes(req.path) || 
            req.path.startsWith('/api/change-password') ||
            req.path.startsWith('/logout')) {
            return next();
        }
        
        // For API requests
        if (req.path.startsWith('/api/') || req.query.partial) {
            if (!req.session.fname) {
                return res.status(401).json({ error: 'Session expired' });
            }
            
            if (role && req.session.role !== role) {
                return res.status(403).json({ error: 'Unauthorized access' });
            }
            
            return next();
        }
        
        // Check if user is logged in
        if (!req.session.fname) {
            return res.redirect("/login");
        }
        
        // Role-specific access check
        if (role && req.session.role !== role) {
            if (req.session.role === 'admin') {
                return res.redirect("/admin"); 
            } else if (req.session.role === 'student') {
                return res.redirect("/student"); 
            } else {
                // Logout if role is invalid
                req.session.destroy(() => {
                    return res.redirect("/login?error=invalid_role");
                });
                return;
            }
        }
        
        next();
    });
};

// Setup both apps with their respective roles
setupApp(adminApp, 'admin');
setupApp(userApp, 'student');

// MongoDB connection
let mongoClient = null;

MongoClient.connect(url, mongoOptions)
    .then(client => {
        mongoClient = client; // Store the client for proper cleanup later
        dbo = client.db("School");
        console.log("MongoDB connected!");
        
        // Make the database available to all routes
        adminApp.locals.db = dbo;
        userApp.locals.db = dbo;
        
        // Clear any corrupted session data
        try {
            // Clear corrupted admin sessions
            dbo.collection('sessions_admin').deleteMany({
                "session.cookie": { $exists: false }
            }).then(result => {
                console.log("Cleared corrupted admin sessions:", result.deletedCount);
            }).catch(err => {
                console.error("Failed to clear corrupted admin sessions:", err);
            });
            
            // Clear corrupted student sessions
            dbo.collection('sessions_student').deleteMany({
                "session.cookie": { $exists: false }
            }).then(result => {
                console.log("Cleared corrupted student sessions:", result.deletedCount);
            }).catch(err => {
                console.error("Failed to clear corrupted student sessions:", err);
            });
        } catch (err) {
            console.error("Error attempting to clear sessions:", err);
        }

        // Verify the database connection
        dbo.command({ ping: 1 })
            .then(() => console.log("Database ping successful"))
            .catch(err => console.error("Database ping failed:", err));

        // Set up a heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
            if (!dbo) {
                console.log("Database connection lost. Clearing heartbeat.");
                clearInterval(heartbeatInterval);
                return;
            }
            
            dbo.command({ ping: 1 })
                .then(() => console.log("Heartbeat: MongoDB connection is alive"))
                .catch(err => {
                    console.error("Heartbeat: MongoDB connection error:", err);
                    // If connection is lost, try to reconnect
                    if (err.name === 'MongoNetworkError') {
                        reconnectToMongoDB();
                    }
                });
        }, 5 * 60 * 1000); // Every 5 minutes

        // Admin routes (port 7000)
        adminApp.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, "public", "admin_register.html"));
        });

        adminApp.get('/login', (req, res) => {
            res.sendFile(path.join(__dirname, "public", "admin_login.html"));
        });

        adminApp.post('/register', (req, res) => {
            const myobj = { Username: req.body.first_name, Password: req.body.password };
            dbo.collection("LMS").insertOne(myobj)
                .then(() => res.redirect('/login'))
                .catch(err => {
                    console.log(err);
                    res.status(500).send('Registration failed');
                });
        });

        adminApp.post('/login', (req, res) => {
            const q = { Username: req.body.username, Password: req.body.pwd };
            dbo.collection("LMS").find(q).toArray()
                .then(result => {
                    if (result.length === 0) {
                        return res.redirect("/login?error=invalid_credentials");
                    }
                    
                    // Set user info
                    req.session.fname = result[0].Username;
                    req.session.role = 'admin';
                    
                    // Set security attributes
                    req.session.securityToken = generateSecureToken();
                    req.session.userAgent = req.headers['user-agent'];
                    req.session.ipAddress = req.ip || req.connection.remoteAddress;
                    req.session.lastAccessed = Date.now();
                    
                    req.session.save(err => {
                        if (err) {
                            console.error('Session save error:', err);
                            return res.status(500).send('Login failed');
                        }
                        res.redirect("/admin");
                    });
                })
                .catch(err => {
                    console.log(err);
                    res.status(500).send('Login failed');
                });
        });

        adminApp.get("/logout", (req, res) => {
            if (req.session) {
                req.session.destroy(err => {
                    if (err) {
                        console.error('Admin session destruction error:', err);
                    }
                    // Clear any admin session cookie in the browser
                    res.clearCookie('session.id.admin');
                    res.redirect("/login");
                });
            } else {
                res.redirect("/login");
            }
        });

        const adminRoutes = require('./routes/admin');
        
        // Extra middleware to protect admin routes with double validation
        adminApp.use('/admin', (req, res, next) => {
            // First check: active session with admin role
            if (!req.session.fname || req.session.role !== 'admin' || !req.session.securityToken) {
                console.log('Admin access denied:', {
                    hasSession: !!req.session,
                    hasUserName: !!req.session?.fname,
                    userRole: req.session?.role,
                    hasSecurityToken: !!req.session?.securityToken
                });
                return res.redirect('/login');
            }
            
            // Second check: validate browser fingerprint - only check user-agent
            const currentUserAgent = req.headers['user-agent'];
            
            if (req.session.userAgent !== currentUserAgent) {
                console.log('Admin access denied: Browser fingerprint mismatch', {
                    sessionUA: req.session.userAgent?.substring(0, 20),
                    currentUA: currentUserAgent?.substring(0, 20)
                });
                req.session.destroy(() => {
                    return res.redirect('/login?error=security_violation');
                });
                return;
            }
            
            // Set strong no-cache headers on every admin page
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
            
            next();
        }, adminRoutes);

        adminApp.get('/api/check-session', (req, res) => {
            res.json({ authenticated: !!req.session.fname });
        });

        // User routes (port 7001)
        userApp.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, "public", "user_login.html"));
        });

        userApp.get('/login', (req, res) => {
            res.sendFile(path.join(__dirname, "public", "user_login.html"));
        });

        userApp.get('/change-password', (req, res) => {
            res.sendFile(path.join(__dirname, "public", "change-password.html"));
        });

        userApp.post('/api/change-password', async (req, res) => {
            const { username, currentPassword, newPassword } = req.body;
            
            if (!username || !currentPassword || !newPassword) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'All fields are required' 
                });
            }
            
            console.log(`Password change request for username: ${username}`);
            
            try {
                // 1. First find the user by username
                const user = await dbo.collection("user").findOne({ Username: username });
                
                if (!user) {
                    console.log(`User not found: ${username}`);
                    return res.status(404).json({ 
                        success: false, 
                        message: 'Username not found' 
                    });
                }
                
                console.log(`Found user: ${username}, Current password in DB: ${user.Password}`);
                
                // 2. Verify current password
                if (user.Password !== currentPassword) {
                    console.log(`Password verification failed for user: ${username}`);
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Current password is incorrect' 
                    });
                }
                
                // 3. Update the password in user collection
                const result = await dbo.collection("user").updateOne(
                    { Username: username },
                    { $set: { Password: newPassword } }
                );
                
                if (result.matchedCount === 0) {
                    console.log(`No matching user found for update: ${username}`);
                    return res.status(404).json({
                        success: false,
                        message: 'User not found during update'
                    });
                }
                
                // 4. Also update password in the class collection
                // First find which class collection the student belongs to
                const collections = await dbo.listCollections().toArray();
                const classCollections = collections.filter(c => c.name.startsWith('class_'));
                
                let studentUpdated = false;
                
                for (const collection of classCollections) {
                    const classResult = await dbo.collection(collection.name).updateOne(
                        { username: username },
                        { $set: { password: newPassword } }
                    );
                    
                    if (classResult.matchedCount > 0) {
                        console.log(`Updated student password in ${collection.name} collection`);
                        studentUpdated = true;
                        break;
                    }
                }
                
                if (!studentUpdated) {
                    console.log(`WARNING: Could not find student record for username: ${username}`);
                }
                
                // 5. Verify the password was updated in user collection
                const updatedUser = await dbo.collection("user").findOne({ Username: username });
                console.log(`Updated user password: ${updatedUser.Password}`);
                
                if (updatedUser.Password !== newPassword) {
                    console.log(`ERROR: Password verification failed after update for user: ${username}`);
                    return res.status(500).json({
                        success: false,
                        message: 'Password was not updated correctly'
                    });
                }
                
                console.log(`Password successfully updated for user: ${username}`);
                
                res.status(200).json({ 
                    success: true, 
                    message: 'Password changed successfully' 
                });
                
            } catch (error) {
                console.error(`Error changing password for ${username}:`, error);
                res.status(500).json({ 
                    success: false, 
                    message: 'Server error: ' + error.message 
                });
            }
        });

        userApp.post('/login', async (req, res) => {
            const username = req.body.username;
            const password = req.body.pwd;
            
            try {
                // First check the database connection
                await dbo.command({ ping: 1 });
                
                // Check credentials in the user collection
                const userRecord = await dbo.collection("user").findOne({ 
                    Username: username 
                });
                
                if (!userRecord) {
                    console.log(`User not found in database: ${username}`);
                    return res.redirect("/login?error=invalid_credentials");
                }
                
                // Verify password
                if (userRecord.Password !== password) {
                    console.log(`Password mismatch for ${username}`);
                    return res.redirect("/login?error=invalid_credentials");
                }
                
                // Find student record in class collections
                const collections = await dbo.listCollections().toArray();
                const classCollections = collections.filter(c => c.name.startsWith('class_'));
                
                let student = null;
                for (const collection of classCollections) {
                    student = await dbo.collection(collection.name)
                        .findOne({ username: username });
                    if (student) {
                        console.log(`Found student in collection ${collection.name}: ${student.name}`);
                        break;
                    }
                }
                
                if (!student) {
                    console.log(`No student record found for username: ${username}`);
                    return res.status(401).send("Student record not found");
                }

                // Set user info
                req.session.fname = student.name;
                req.session.username = username;
                req.session.class = student.class;
                req.session.role = 'student';
                req.session.photo = student.photo;
                
                // Set security attributes
                req.session.securityToken = generateSecureToken();
                req.session.userAgent = req.headers['user-agent'];
                req.session.ipAddress = req.ip || req.connection.remoteAddress;
                req.session.lastAccessed = Date.now();
                
                req.session.save(err => {
                    if (err) {
                        console.error('Session save error:', err);
                        return res.status(500).send('Login failed');
                    }
                    res.redirect("/student");
                });
            } catch (error) {
                console.error(`Login error for ${username}:`, error);
                res.status(500).send('Login failed: Server error');
            }
        });

        userApp.get("/logout", (req, res) => {
            if (req.session) {
                req.session.destroy(err => {
                    if (err) {
                        console.error('Student session destruction error:', err);
                    }
                    // Clear any student session cookie in the browser
                    res.clearCookie('session.id.student');
                    res.redirect("/login");
                });
            } else {
                res.redirect("/login");
            }
        });

        const studentRoutes = require('./routes/student');
        
        // Extra middleware to protect student routes with double validation
        userApp.use('/student', (req, res, next) => {
            // First check: active session with student role
            if (!req.session.fname || req.session.role !== 'student' || !req.session.securityToken) {
                console.log('Student access denied:', {
                    hasSession: !!req.session,
                    hasUserName: !!req.session?.fname,
                    userRole: req.session?.role,
                    hasSecurityToken: !!req.session?.securityToken
                });
                return res.redirect('/login');
            }
            
            // Second check: validate browser fingerprint - only check user agent
            const currentUserAgent = req.headers['user-agent'];
            
            if (req.session.userAgent !== currentUserAgent) {
                console.log('Student access denied: Browser fingerprint mismatch', {
                    sessionUA: req.session.userAgent?.substring(0, 20),
                    currentUA: currentUserAgent?.substring(0, 20)
                });
                req.session.destroy(() => {
                    return res.redirect('/login?error=security_violation');
                });
                return;
            }
            
            // Set strong no-cache headers on every student page
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
            
            next();
        }, studentRoutes);

        const startQuizRoutes = require('./routes/startquiz');
        
        // Extra middleware to protect quiz routes
        userApp.use('/student/startquiz', (req, res, next) => {
            // First check: active session with student role
            if (!req.session.fname || req.session.role !== 'student' || !req.session.securityToken) {
                console.log('Quiz access denied:', {
                    hasSession: !!req.session,
                    hasUserName: !!req.session?.fname,
                    userRole: req.session?.role,
                    hasSecurityToken: !!req.session?.securityToken
                });
                return res.redirect('/login');
            }
            
            // Second check: validate browser fingerprint - only check user agent
            const currentUserAgent = req.headers['user-agent'];
            
            if (req.session.userAgent !== currentUserAgent) {
                console.log('Quiz access denied: Browser fingerprint mismatch', {
                    sessionUA: req.session.userAgent?.substring(0, 20),
                    currentUA: currentUserAgent?.substring(0, 20)
                });
                req.session.destroy(() => {
                    return res.redirect('/login?error=security_violation');
                });
                return;
            }
            
            // Set strong no-cache headers for quiz pages
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
            
            next();
        }, startQuizRoutes);

        // Start both servers
        adminApp.listen(7000, () => console.log("Admin server running on port 7000"));
        userApp.listen(7001, () => console.log("User server running on port 7001"));
    })
    .catch(err => {
        console.log('Mongo connection failed:', err);
        process.exit(1);
    });

process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
    // Don't exit process on MongoDB connection errors
    if (!err.message.includes('MongoDB') && !err.message.includes('mongo')) {
        process.exit(1);
    }
});

process.on('unhandledRejection', err => {
    console.error('Unhandled Rejection:', err);
    // Don't exit process on MongoDB connection errors
    if (err && !err.message.includes('MongoDB') && !err.message.includes('mongo')) {
        process.exit(1);
    }
});

// Add error handlers at the end of the file
process.on('exit', () => {
    if (mongoClient) {
        console.log('Process exiting, closing MongoDB connection');
        mongoClient.close().catch(err => {
            console.error('Error closing MongoDB connection on exit:', err);
        });
    }
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, closing connections and exiting');
    if (mongoClient) {
        mongoClient.close().catch(err => {
            console.error('Error closing MongoDB connection on SIGINT:', err);
        });
    }
    process.exit(0);
});

// Reconnect function
function reconnectToMongoDB() {
    console.log('Attempting to reconnect to MongoDB...');
    
    if (mongoClient) {
        try {
            mongoClient.close().catch(err => {
                console.error('Error closing previous MongoDB connection:', err);
            });
        } catch (err) {
            console.error('Error during client.close():', err);
        }
    }
    
    MongoClient.connect(url, mongoOptions)
        .then(client => {
            mongoClient = client;
            dbo = client.db("School");
            console.log("Successfully reconnected to MongoDB!");
            
            // Update the database reference
            adminApp.locals.db = dbo;
            userApp.locals.db = dbo;
        })
        .catch(err => {
            console.error('Failed to reconnect to MongoDB:', err);
            // Try again after a delay
            setTimeout(reconnectToMongoDB, 10000);
        });
}