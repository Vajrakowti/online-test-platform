require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require("express-session");
const MongoClient = require('mongodb').MongoClient;
const MongoStore = require('connect-mongo');

// Create a single Express app
const app = express();

// Import routes
const adminRoutes = require('./routes/admin');
const studentRoutes = require('./routes/student');
const startQuizRoutes = require('./routes/startquiz');

// Use environment variables for MongoDB connection
const url = process.env.MONGODB_URI || "mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/School?retryWrites=true&w=majority&tls=true&tlsAllowInvalidHostnames=true";
let dbo;
let mongoClient = null;

// MongoDB connection options
const mongoOptions = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4,
    tls: true,
    tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: true,
    retryWrites: true,
    w: 'majority',
    connectTimeoutMS: 10000
};

// Set max listeners to prevent memory leak warnings
require('events').EventEmitter.defaultMaxListeners = 30;

// Create MongoDB store for sessions
const store = MongoStore.create({
    mongoUrl: url,
    mongoOptions: mongoOptions,
    dbName: 'School',
    collectionName: 'sessions',
    ttl: 24 * 60 * 60,
    touchAfter: 60,
    stringify: false,
    autoRemove: 'native',
    autoRemoveInterval: 10,
    crypto: {
        secret: false
    }
});

// Generate a unique token for each session 
function generateSecureToken() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15) + 
           Date.now().toString(36);
}

// Setup the app
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/student-photos', express.static(path.join(__dirname, 'public', 'student-photos')));
app.use(express.json());

// Apply session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here-please-change-this',
    resave: false,
    saveUninitialized: true,
    store: store,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
    },
    rolling: true,
    unset: 'destroy'
}));

// Session validation middleware
app.use((req, res, next) => {
    // Define paths that don't need session validation
    const publicPaths = [
        '/login',
        '/admin-login',
        '/',
        '/change-password',
        '/api/change-password'
    ];
    
    // Allow public paths to pass through
    if (publicPaths.includes(req.path) || req.path.startsWith('/api/change-password')) {
        return next();
    }
    
    // For authenticated routes, ensure session exists
    if (!req.session) {
        return res.redirect('/login');
    }
    
    // Initialize security token if not present
    if (!req.session.securityToken) {
        req.session.securityToken = generateSecureToken();
        req.session.userAgent = req.headers['user-agent'];
        req.session.ipAddress = req.ip || req.connection.remoteAddress;
        req.session.lastAccessed = Date.now();
    }
    
    // Validate session
    const currentUserAgent = req.headers['user-agent'];
    const timeValid = (Date.now() - req.session.lastAccessed) < (120 * 60 * 1000); // 2 hours
    
    if (req.session.userAgent !== currentUserAgent || !timeValid) {
        console.log('Session validation failed:', {
            userAgentMatch: req.session.userAgent === currentUserAgent,
            timeValid: timeValid
        });
        
        req.session.destroy(err => {
            if (err) {
                console.error('Session destruction error:', err);
            }
            res.redirect('/login?error=session_expired');
        });
        return;
    }
    
    // Update last accessed time
    req.session.lastAccessed = Date.now();
    
    // Set cache control headers
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    
    next();
});

// MongoDB connection
MongoClient.connect(url, mongoOptions)
    .then(client => {
        mongoClient = client;
        dbo = client.db("School");
        console.log("MongoDB connected!");
        
        // Make the database available to all routes
        app.locals.db = dbo;
        
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

        // Main route - Student Login
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, "public", "user_login.html"));
        });

        // Admin Login Page
        app.get('/admin-login', (req, res) => {
            res.sendFile(path.join(__dirname, "public", "admin_login.html"));
        });

        // Admin Login Handler
        app.post('/admin-login', (req, res) => {
            const q = { 
                Username: req.body.username, 
                Password: req.body.pwd,
                role: 'admin'
            };
            
            console.log('Attempting to login admin:', { username: req.body.username });
            
            dbo.collection("LMS").findOne(q)
                .then(result => {
                    if (!result) {
                        console.log('Admin login failed: Invalid credentials');
                        return res.redirect("/admin-login?error=invalid_credentials");
                    }
                    
                    console.log('Admin login successful:', { username: result.Username });
                    
                    // Initialize session if it doesn't exist
                    if (!req.session) {
                        req.session = {};
                    }
                    
                    // Set user info
                    req.session.fname = result.Username;
                    req.session.role = 'admin';
                    
                    // Generate and set security token
                    req.session.securityToken = generateSecureToken();
                    req.session.userAgent = req.headers['user-agent'];
                    req.session.ipAddress = req.ip || req.connection.remoteAddress;
                    req.session.lastAccessed = Date.now();
                    
                    // Save session before redirecting
                    req.session.save(err => {
                        if (err) {
                            console.error('Session save error:', err);
                            return res.status(500).send('Login failed');
                        }
                        res.redirect("/admin");
                    });
                })
                .catch(err => {
                    console.error('Admin login error:', err);
                    res.status(500).send('Login failed: ' + err.message);
                });
        });

        // Student Login Handler
        app.post('/login', async (req, res) => {
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

        // Admin Dashboard Route
        app.get('/admin', (req, res) => {
            if (!req.session.fname || req.session.role !== 'admin') {
                return res.redirect('/admin-login');
            }
            res.sendFile(path.join(__dirname, "public", "admin.html"));
        });

        // Student Dashboard Route
        app.get('/student', (req, res) => {
            if (!req.session.fname || req.session.role !== 'student') {
                return res.redirect('/login');
            }
            res.sendFile(path.join(__dirname, "public", "student.html"));
        });

        // Mount admin routes
        app.use('/admin', (req, res, next) => {
            if (!req.session.fname || req.session.role !== 'admin') {
                return res.redirect('/admin-login');
            }
            next();
        }, adminRoutes);

        // Mount student routes
        app.use('/student', (req, res, next) => {
            if (!req.session.fname || req.session.role !== 'student') {
                return res.redirect('/login');
            }
            next();
        }, studentRoutes);

        // Mount quiz routes
        app.use('/student/startquiz', (req, res, next) => {
            if (!req.session.fname || req.session.role !== 'student') {
                return res.redirect('/login');
            }
            next();
        }, startQuizRoutes);

        // Start the server
        app.listen(3000, () => console.log("Server running on port 3000"));
    })
    .catch(err => {
        console.log('Mongo connection failed:', err);
        process.exit(1);
    });

// Add error handlers for graceful shutdown
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
            app.locals.db = dbo;
        })
        .catch(err => {
            console.error('Failed to reconnect to MongoDB:', err);
            // Try again after a delay
            setTimeout(reconnectToMongoDB, 10000);
        });
}

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