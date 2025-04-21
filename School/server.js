const express = require('express');
const path = require('path');
const session = require("express-session");
const MongoClient = require('mongodb').MongoClient;
const MongoStore = require('connect-mongo');

// Create two separate Express apps
const adminApp = express();
const userApp = express();


const url = "mongodb://localhost:27017/";
let dbo;

// Enhanced session configuration
const sessionConfig = {
    secret: "your-secret-key-here-please-change-this",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: url,
        dbName: 'School',
        collectionName: 'sessions',
        ttl: 24 * 60 * 60
    }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: 'lax'
    }
};

// Common middleware setup function
const setupApp = (app) => {
    app.use(express.urlencoded({ extended: false }));
    // app.use(express.static('public'));
    app.use(express.static(path.join(__dirname, 'public')));
    

    // In the setupApp function, add this before other middleware:
    app.use('/student-photos', express.static(path.join(__dirname, 'public', 'student-photos')));
    app.use(express.json());
    
    
    app.use(session(sessionConfig));
    
    app.use((req, res, next) => {
        if (req.session.fname) {
            res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            res.header('Expires', '-1');
            res.header('Pragma', 'no-cache');
        }
        next();
    });
    
    app.use((req, res, next) => {
        // Add change-password route to public paths
        if (req.path === '/login' || req.path === '/register' || req.path === '/' || 
            req.path === '/change-password' || req.path.startsWith('/api/change-password')) {
            return next();
        }
        
        if (req.path.startsWith('/api/') || req.query.partial) {
            if (!req.session.fname) {
                return res.status(401).json({ error: 'Session expired' });
            }
            return next();
        }
        
        if (!req.session.fname) {
            return res.redirect("/login");
        }
        
        next();
    });
};

// Setup both apps
setupApp(adminApp);
setupApp(userApp);

// MongoDB connection
MongoClient.connect(url)
    .then(client => {
        dbo = client.db("School");
        console.log("MongoDB connected!");
        
        // Make the database available to all routes
        adminApp.locals.db = dbo;
        userApp.locals.db = dbo;
        
        // Verify the database connection
        dbo.command({ ping: 1 })
            .then(() => console.log("Database ping successful"))
            .catch(err => console.error("Database ping failed:", err));

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
                    req.session.fname = result[0].Username;
                    req.session.role = 'admin';
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
            req.session.destroy(err => {
                if (err) {
                    console.error('Session destruction error:', err);
                }
                res.redirect("/login");
            });
        });

        const adminRoutes = require('./routes/admin');
        adminApp.use('/admin', adminRoutes);

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
            
            // console.log(`Login attempt for username: ${username}`);
            
            try {
                // First check the database connection
                await dbo.command({ ping: 1 });
                // console.log("Database connection confirmed for login");
                
                // Check credentials in the user collection
                const userRecord = await dbo.collection("user").findOne({ 
                    Username: username 
                });
                
                if (!userRecord) {
                    console.log(`User not found in database: ${username}`);
                    return res.redirect("/login?error=invalid_credentials");
                }
                
                // console.log(`User found: ${username}, Database password: ${userRecord.Password}, Entered password: ${password}`);
                
                // Verify password
                if (userRecord.Password !== password) {
                    console.log(`Password mismatch for ${username}`);
                    return res.redirect("/login?error=invalid_credentials");
                }
                
                // console.log(`Password verified for ${username}`);
                
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
    
                req.session.fname = student.name; // Store actual name
                req.session.username = username; // Store username separately
                req.session.class = student.class;
                req.session.role = 'student';
                req.session.photo = student.photo;
                
                // console.log(`Login successful for: ${username} (${student.name})`);
                
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
            req.session.destroy(err => {
                if (err) {
                    console.error('Session destruction error:', err);
                }
                res.redirect("/login");
            });
        });

        const studentRoutes = require('./routes/student');
        userApp.use('/student', studentRoutes);
        const startQuizRoutes = require('./routes/startquiz');
        userApp.use('/student/startquiz', startQuizRoutes);

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
});

process.on('unhandledRejection', err => {
    console.error('Unhandled Rejection:', err);
});