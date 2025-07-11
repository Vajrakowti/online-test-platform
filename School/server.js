require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require("express-session");
const MongoClient = require('mongodb').MongoClient;
const MongoStore = require('connect-mongo');
const fs = require('fs');

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
    maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE) || 10,
    serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT) || 5000,
    socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT) || 45000,
    family: 4,
    tls: process.env.MONGODB_TLS !== 'false',
    tlsAllowInvalidCertificates: process.env.MONGODB_ALLOW_INVALID_CERTS === 'true',
    tlsAllowInvalidHostnames: process.env.MONGODB_ALLOW_INVALID_HOSTS === 'true',
    retryWrites: true,
    w: 'majority',
    connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT) || 10000
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

// Initialize MongoDB collections
async function initializeCollections() {
    try {
        // Create collections if they don't exist
        await dbo.createCollection('quizzes');
        await dbo.createCollection('attempts');
        await dbo.createCollection('manual_questions');
        await dbo.createCollection('retakes');

        // Create indexes
        await dbo.collection('quizzes').createIndex({ name: 1 }, { unique: true });
        await dbo.collection('attempts').createIndex({ username: 1, quizName: 1 });
        await dbo.collection('manual_questions').createIndex({ quizName: 1 }, { unique: true });
        await dbo.collection('retakes').createIndex({ quizName: 1 });

        // Check if collections are already populated
        const attemptsCount = await dbo.collection('attempts').countDocuments();
        const manualQuestionsCount = await dbo.collection('manual_questions').countDocuments();
        const retakesCount = await dbo.collection('retakes').countDocuments();

        // Only migrate if collections are empty
        if (attemptsCount === 0 && manualQuestionsCount === 0 && retakesCount === 0) {
            // Migrate quizzes if collection is empty
            const quizzesCount = await dbo.collection('quizzes').countDocuments();
            if (quizzesCount === 0) {
                const quizzesPath = path.join(__dirname, 'quizzes.json');
                if (fs.existsSync(quizzesPath)) {
                    try {
                        const fileContent = fs.readFileSync(quizzesPath, 'utf8');
                        if (fileContent.trim()) {
                            const quizzes = JSON.parse(fileContent);
                            if (Array.isArray(quizzes)) {
                                await dbo.collection('quizzes').insertMany(quizzes);
                            }
                        }
                    } catch (err) {
                        console.error('Error parsing quizzes.json:', err);
                    }
                }
            }

            // Migrate attempts
            const attemptsPath = path.join(__dirname, 'attempts');
            if (fs.existsSync(attemptsPath)) {
                const attemptFiles = fs.readdirSync(attemptsPath);
                for (const file of attemptFiles) {
                    if (file.endsWith('.json')) {
                        const username = file.replace('.json', '');
                        const filePath = path.join(attemptsPath, file);
                        try {
                            const fileContent = fs.readFileSync(filePath, 'utf8');
                            if (fileContent.trim()) {
                                const attempts = JSON.parse(fileContent);
                                if (Array.isArray(attempts)) {
                                    await dbo.collection('attempts').updateOne(
                                        { username },
                                        { $set: { attempts } },
                                        { upsert: true }
                                    );
                                }
                            }
                        } catch (err) {
                            console.error(`Error parsing attempts file for ${username}:`, err);
                        }
                    }
                }
            }

            // Migrate manual questions
            const manualQuestionsPath = path.join(__dirname, 'manual-questions');
            if (fs.existsSync(manualQuestionsPath)) {
                const questionFiles = fs.readdirSync(manualQuestionsPath);
                for (const file of questionFiles) {
                    if (file.endsWith('.json')) {
                        const quizName = file.replace('.json', '');
                        const filePath = path.join(manualQuestionsPath, file);
                        try {
                            const fileContent = fs.readFileSync(filePath, 'utf8');
                            if (fileContent.trim()) {
                                const questions = JSON.parse(fileContent);
                                if (Array.isArray(questions)) {
                                    await dbo.collection('manual_questions').updateOne(
                                        { quizName },
                                        { $set: { questions } },
                                        { upsert: true }
                                    );
                                }
                            }
                        } catch (err) {
                            console.error(`Error parsing manual questions file for ${quizName}:`, err);
                        }
                    }
                }
            }

            // Migrate retakes
            const retakesPath = path.join(__dirname, 'retakes');
            if (fs.existsSync(retakesPath)) {
                const retakeFiles = fs.readdirSync(retakesPath);
                for (const file of retakeFiles) {
                    if (file.endsWith('.json')) {
                        const quizName = file.replace('.json', '');
                        const filePath = path.join(retakesPath, file);
                        try {
                            const fileContent = fs.readFileSync(filePath, 'utf8');
                            if (fileContent.trim()) {
                                const retakes = JSON.parse(fileContent);
                                if (Array.isArray(retakes)) {
                                    await dbo.collection('retakes').updateOne(
                                        { quizName },
                                        { $set: { retakes } },
                                        { upsert: true }
                                    );
                                }
                            }
                        } catch (err) {
                            console.error(`Error parsing retakes file for ${quizName}:`, err);
                        }
                    }
                }
            }
            console.log("Initial data migration completed successfully");
        } else {
            console.log("Data already migrated, skipping initial migration");
        }
    } catch (err) {
        console.error('Error initializing collections:', err);
    }
}

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
        secure: process.env.COOKIE_SECURE === 'true',
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
        
        // Initialize collections and migrate data
        initializeCollections().then(() => {
            console.log("Collections initialized and data migrated successfully");
            
            // Initialize retakes watcher after collections are set up
            const adminRoutes = require('./routes/admin');
            const retakesPath = path.join(__dirname, 'retakes');
            
            if (!fs.existsSync(retakesPath)) {
                fs.mkdirSync(retakesPath, { recursive: true });
            }
            
            // Initial sync of all retake files
            fs.readdirSync(retakesPath)
                .filter(file => file.endsWith('.json'))
                .forEach(async file => {
                    const filePath = path.join(retakesPath, file);
                    const quizName = path.basename(file, '.json').replace('_retake', '');
                    
                    try {
                        const retakeUsernames = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        
                        // Get quiz details from quizzes.json
                        const quizzesPath = path.join(__dirname, 'quizzes.json');
                        const quizzes = JSON.parse(fs.readFileSync(quizzesPath, 'utf8'));
                        const quiz = quizzes.find(q => q.name === quizName);
                        
                        if (quiz) {
                            // Update retakes collection
                            await dbo.collection('retakes').updateOne(
                                { quizName },
                                { 
                                    $set: {
                                        quizName,
                                        retakes: retakeUsernames,
                                        quizDetails: {
                                            name: quiz.name,
                                            startTime: quiz.startTime,
                                            endTime: quiz.endTime,
                                            class: quiz.class,
                                            type: quiz.type,
                                            file: quiz.file,
                                            questionsFile: quiz.questionsFile,
                                            isStudentSpecific: true,
                                            allowedStudents: retakeUsernames
                                        },
                                        createdAt: new Date(),
                                        updatedAt: new Date()
                                    }
                                },
                                { upsert: true }
                            );
                            
                            // Update quizzes collection
                            await dbo.collection('quizzes').updateOne(
                                { name: quizName },
                                { 
                                    $set: {
                                        name: quiz.name,
                                        startTime: quiz.startTime,
                                        endTime: quiz.endTime,
                                        class: quiz.class,
                                        type: quiz.type,
                                        file: quiz.file,
                                        questionsFile: quiz.questionsFile,
                                        isStudentSpecific: true,
                                        allowedStudents: retakeUsernames
                                    }
                                },
                                { upsert: true }
                            );
                            
                            console.log(`Synced retake file ${file} to MongoDB`);
                        }
                    } catch (err) {
                        console.error(`Error syncing retake file ${file}:`, err);
                    }
                });
            
            // Set up file watcher for retakes directory
            const watcher = fs.watch(retakesPath, async (eventType, filename) => {
                if (filename && filename.endsWith('.json')) {
                    const filePath = path.join(retakesPath, filename);
                    
                    // Wait a short time to ensure file is fully written
                    setTimeout(async () => {
                        try {
                            if (fs.existsSync(filePath)) {
                                const quizName = path.basename(filename, '.json').replace('_retake', '');
                                const retakeUsernames = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                                
                                // Get quiz details from quizzes.json
                                const quizzesPath = path.join(__dirname, 'quizzes.json');
                                const quizzes = JSON.parse(fs.readFileSync(quizzesPath, 'utf8'));
                                const quiz = quizzes.find(q => q.name === quizName);
                                
                                if (quiz) {
                                    // Update retakes collection
                                    await dbo.collection('retakes').updateOne(
                                        { quizName },
                                        { 
                                            $set: {
                                                quizName,
                                                retakes: retakeUsernames,
                                                quizDetails: {
                                                    name: quiz.name,
                                                    startTime: quiz.startTime,
                                                    endTime: quiz.endTime,
                                                    class: quiz.class,
                                                    type: quiz.type,
                                                    file: quiz.file,
                                                    questionsFile: quiz.questionsFile,
                                                    isStudentSpecific: true,
                                                    allowedStudents: retakeUsernames
                                                },
                                                createdAt: new Date(),
                                                updatedAt: new Date()
                                            }
                                        },
                                        { upsert: true }
                                    );
                                    
                                    // Update quizzes collection
                                    await dbo.collection('quizzes').updateOne(
                                        { name: quizName },
                                        { 
                                            $set: {
                                                name: quiz.name,
                                                startTime: quiz.startTime,
                                                endTime: quiz.endTime,
                                                class: quiz.class,
                                                type: quiz.type,
                                                file: quiz.file,
                                                questionsFile: quiz.questionsFile,
                                                isStudentSpecific: true,
                                                allowedStudents: retakeUsernames
                                            }
                                        },
                                        { upsert: true }
                                    );
                                    
                                    console.log(`Synced retake file ${filename} to MongoDB`);
                                }
                            }
                        } catch (err) {
                            console.error(`Error syncing retake file ${filename}:`, err);
                        }
                    }, 100);
                }
            });
            
            // Handle watcher errors
            watcher.on('error', (err) => {
                console.error('Error watching retakes directory:', err);
            });
            
            console.log('Retakes watcher initialized');
        }).catch(err => {
            console.error("Error during initialization:", err);
        });

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

        // Student Login Page Route
        app.get('/login', (req, res) => {
            res.sendFile(path.join(__dirname, "public", "user_login.html"));
        });

        // Admin Login Page
        app.get('/admin-login', (req, res) => {
            res.sendFile(path.join(__dirname, "public", "admin_login.html"));
        });

        // Admin Login Handler
        app.post('/admin-login', async (req, res) => {
            const q = { 
                Username: req.body.username, 
                Password: req.body.pwd,
                role: 'admin'
            };

            try {
                const result = await dbo.collection("LMS").findOne(q);
                if (!result) {
                    console.log('Admin login failed: Invalid credentials');
                    return res.redirect("/admin-login?error=invalid_credentials");
                }

                // Set session info
                req.session.fname = result.Username;
                req.session.role = 'admin';
                req.session.adminDb = `School_${result.Username}`;
                req.session.securityToken = generateSecureToken();
                req.session.userAgent = req.headers['user-agent'];
                req.session.ipAddress = req.ip || req.connection.remoteAddress;
                req.session.lastAccessed = Date.now();

                // Ensure admin DB exists
                const client = new MongoClient(url);
                await client.connect();
                const db = client.db(req.session.adminDb);
                await db.collection('init').updateOne({init: true}, {$set: {init: true}}, {upsert: true});
                await client.close();

                req.session.save(err => {
                    if (err) {
                        console.error('Session save error:', err);
                        return res.status(500).send('Login failed');
                    }
                    res.redirect("/admin");
                });
            } catch (err) {
                console.error('Admin login error:', err);
                res.status(500).send('Login failed: ' + err.message);
            }
        });

        // Student Login Handler
        app.post('/login', async (req, res) => {
            const username = req.body.username;
            const password = req.body.pwd;
            
            console.log('Login attempt:', { username });
            
            try {
                // First check the database connection
                await dbo.command({ ping: 1 });
                
                // Get all databases
                const admin = dbo.admin();
                const { databases } = await admin.listDatabases();
                
                // Filter for admin-specific databases (School_*)
                const adminDbs = databases
                    .map(db => db.name)
                    .filter(name => name.startsWith('School_'));
                
                console.log('Found admin databases:', adminDbs);
                
                let student = null;
                let adminDb = null;
                
                // Check each admin database for the student
                for (const dbName of adminDbs) {
                    const adminDbClient = new MongoClient(url);
                    await adminDbClient.connect();
                    const currentDb = adminDbClient.db(dbName);
                    
                    // Check user collection for credentials
                    const userRecord = await currentDb.collection("user").findOne({ 
                        Username: username,
                        Password: password
                    });
                    
                    if (userRecord) {
                // Find student record in class collections
                        const collections = await currentDb.listCollections().toArray();
                const classCollections = collections.filter(c => c.name.startsWith('class_'));
                
                        console.log(`Searching for student in ${dbName} collections:`, classCollections.map(c => c.name));
                
                for (const collection of classCollections) {
                            student = await currentDb.collection(collection.name)
                        .findOne({ username: username });
                    if (student) {
                                console.log(`Found student in ${dbName} collection ${collection.name}:`, {
                            name: student.name,
                            class: student.class,
                            username: student.username
                        });
                        break;
                    }
                        }
                        
                        if (student) {
                            adminDb = dbName;
                            await adminDbClient.close();
                            break;
                        }
                    }
                    
                    await adminDbClient.close();
                }
                
                if (!student) {
                    console.log(`No student record found for username: ${username}`);
                    return res.redirect("/login?error=invalid_credentials");
                }

                // Set user info
                req.session.fname = student.name;
                req.session.username = username;
                req.session.class = student.class;
                req.session.role = 'student';
                req.session.photo = student.photo;
                req.session.adminDb = adminDb; // Store the admin database name
                req.session.securityToken = generateSecureToken();
                req.session.userAgent = req.headers['user-agent'];
                req.session.ipAddress = req.ip || req.connection.remoteAddress;
                req.session.lastAccessed = Date.now();
                
                console.log('Session set for student:', {
                    username: req.session.username,
                    class: req.session.class,
                    name: req.session.fname,
                    adminDb: req.session.adminDb
                });
                
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

        // Add global logout route for students
        app.get('/logout', (req, res) => {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Error destroying session:', err);
                }
                res.redirect('/login');
            });
        });

        // Add change password routes
        app.get('/change-password', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'change-password.html'));
        });

        app.post('/api/change-password', async (req, res) => {
            const { username, currentPassword, newPassword } = req.body;
            try {
                console.log('Password change attempt for user:', username);

                // Get all databases
                const admin = dbo.admin();
                const { databases } = await admin.listDatabases();
                const adminDbs = databases
                    .map(db => db.name)
                    .filter(name => name.startsWith('School_'));

                let found = false;
                let updateSuccess = false;
                let errorMsg = 'User not found or incorrect current password';

                for (const dbName of adminDbs) {
                    const adminDbClient = new MongoClient(url);
                    await adminDbClient.connect();
                    const currentDb = adminDbClient.db(dbName);

                    // Check user collection for credentials
                    const user = await currentDb.collection('user').findOne({
                        Username: username,
                        Password: currentPassword
                    });

                    if (user) {
                        found = true;
                        // Find student's class by checking all class collections
                        const collections = await currentDb.listCollections().toArray();
                        const classCollections = collections.filter(c => c.name.startsWith('class_'));
                        let studentClass = null;
                        for (const collection of classCollections) {
                            const student = await currentDb.collection(collection.name)
                                .findOne({ username: username.toLowerCase() });
                            if (student) {
                                studentClass = student.class;
                                break;
                            }
                        }
                        if (!studentClass) {
                            errorMsg = 'Student record not found in class collections';
                            await adminDbClient.close();
                            break;
                        }
                        // Start a session for transaction
                        const session = currentDb.client.startSession();
                        let transactionError = null;
                        try {
                            await session.startTransaction();
                            // Update password in user collection
                            const userResult = await currentDb.collection('user').updateOne(
                                { Username: username },
                                { $set: { Password: newPassword } },
                                { session }
                            );
                            // Update password in class collection
                            const classCollectionName = `class_${studentClass}`;
                            const classResult = await currentDb.collection(classCollectionName).updateOne(
                                { username: username.toLowerCase() },
                                { $set: { password: newPassword } },
                                { session }
                            );
                            if (userResult.modifiedCount === 1 && classResult.modifiedCount === 1) {
                                await session.commitTransaction();
                                updateSuccess = true;
                                errorMsg = '';
                                await adminDbClient.close();
                                break;
                            } else {
                                await session.abortTransaction();
                                errorMsg = 'Failed to update password in one or more collections';
                            }
                        } catch (error) {
                            transactionError = error;
                            await session.abortTransaction();
                            errorMsg = 'An error occurred while changing password';
                        } finally {
                            await session.endSession();
                        }
                        await adminDbClient.close();
                        break;
                    }
                    await adminDbClient.close();
                }
                if (!found) {
                    return res.status(400).json({
                        success: false,
                        message: errorMsg
                    });
                }
                if (updateSuccess) {
                    return res.json({
                        success: true,
                        message: 'Password changed successfully in all collections'
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        message: errorMsg || 'Failed to update password'
                    });
                }
            } catch (error) {
                console.error('Error changing password:', error);
                res.status(500).json({
                    success: false,
                    message: 'An error occurred while changing password'
                });
            }
        });

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