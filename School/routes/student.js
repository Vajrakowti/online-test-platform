const express = require('express');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
const router = express.Router();

// MongoDB connection URL
const url = process.env.MONGODB_URI || "mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles";

const QUIZ_FILE = path.join(__dirname, '../quizzes.json');
const ATTEMPTS_DIR = path.join(__dirname, '../attempts');

// Ensure attempts directory exists
if (!fs.existsSync(ATTEMPTS_DIR)) {
    fs.mkdirSync(ATTEMPTS_DIR);
}

// Route to serve student.html
router.get('/', async (req, res) => {
    if (req.session.fname && req.session.role === 'student') {
        try {
            // Connect to MongoDB using admin-specific database
            const client = new MongoClient(url);
            await client.connect();
            const db = client.db(req.session.adminDb);
            
            // Get all quizzes
            const quizzesCollection = db.collection('quizzes');
            const quizzes = await quizzesCollection.find({}).toArray();
            
            // Get student's attempts
            const attemptsCollection = db.collection('attempts');
            const attempts = await attemptsCollection.find({ 
                studentId: req.session.username 
            }).toArray();
            
            // Create a map of attempted quizzes
            const attemptedQuizzes = new Map();
            attempts.forEach(attempt => {
                attemptedQuizzes.set(attempt.quizName, attempt);
            });
            
            // Separate quizzes into attempted and not attempted
            const attemptedQuizzesList = [];
            const availableQuizzes = [];
            
            quizzes.forEach(quiz => {
                if (attemptedQuizzes.has(quiz.name)) {
                    attemptedQuizzesList.push({
                        ...quiz,
                        attempt: attemptedQuizzes.get(quiz.name)
                    });
                } else {
                    availableQuizzes.push(quiz);
                }
            });
            
            await client.close();
            
        // Read the student.html file and replace the welcome message
            fs.readFile(path.join(__dirname, '../public/student.html'), 'utf8',
                async (err, data) => {
            if (err) {
                        console.error('Error reading student.html:', err);
                        return res.status(500).send('Error loading student dashboard');
            }
            
                    // Replace welcome message
                    let modifiedData = data.replace('Welcome, Student!', `Welcome, ${req.session.fname}!`);
            
                    // Add quizzes data to the page
                    modifiedData = modifiedData.replace(
                        'const quizzes = [];',
                        `const quizzes = ${JSON.stringify(availableQuizzes)};`
                    );
                    
                    // Add attempted quizzes data
                    modifiedData = modifiedData.replace(
                        'const attemptedQuizzes = [];',
                        `const attemptedQuizzes = ${JSON.stringify(attemptedQuizzesList)};`
                    );
                    
                    res.send(modifiedData);
                            }
            );
        } catch (err) {
            console.error('Error loading student dashboard:', err);
            res.status(500).send('Error loading student dashboard');
        }
    } else {
        res.redirect('/login');
    }
});

// API endpoint to get student name
router.get('/api/student/name', (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }
    res.json({ name: req.session.fname });
});

router.get('/info', (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Send back the photo path as stored in session
    res.json({
      name: req.session.fname,
      photo: req.session.photo ? req.session.photo : null
    });
  });


// Route to fetch quiz data
router.get('/quizzes', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }

    try {
        const username = req.session.username;
        const studentClass = req.session.class;
        
        // Connect to MongoDB
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get all quizzes
        const quizzesCollection = db.collection('quizzes');
        const quizzes = await quizzesCollection.find({
            $or: [
                { class: studentClass },
                { $and: [
                    { $or: [{ isStudentSpecific: true }, { class: '999' }] },
                    { allowedStudents: username }
                ]}
            ]
        }).toArray();
        
        // Get student's attempts
        const attemptsCollection = db.collection('attempts');
        const attempts = await attemptsCollection.find({ username }).toArray();
        
        // Get retake quizzes
        const retakesCollection = db.collection('retakes');
        const retakes = await retakesCollection.find({}).toArray();
        
        await client.close();
        
        // Filter quizzes based on attempts and retakes
        const availableQuizzes = quizzes.filter(quiz => {
            // Check if student has attempted this quiz
            const attempt = attempts.find(a => a.quizName === quiz.name);
            
            // Check if student is eligible for retake
            const retake = retakes.find(r => r.quizName === quiz.name);
            const isEligibleForRetake = retake && retake.retakes.includes(username);
            
            // Show quiz if:
            // 1. Student hasn't attempted it yet OR is eligible for retake
            return !attempt || isEligibleForRetake;
        });
        
        res.json(availableQuizzes);
    } catch (err) {
        console.error('Error getting quizzes:', err);
        res.status(500).json({ error: 'Failed to get quizzes' });
    }
});

// Route to check if a student is eligible for retake
router.get('/check-retake/:quizName', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }

    try {
        const { quizName } = req.params;
        const username = req.session.username;
        
        // Connect to MongoDB
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Check retake eligibility in MongoDB
        const retakesCollection = db.collection('retakes');
        const retake = await retakesCollection.findOne({ quizName });
        
        await client.close();
        
        if (retake && retake.retakes.includes(username)) {
            return res.json({ isEligible: true });
        }
        
        res.json({ isEligible: false });
    } catch (err) {
        console.error('Error checking retake eligibility:', err);
        res.status(500).json({ error: 'Failed to check retake eligibility' });
    }
});

// New route to update completed quizzes from sessionStorage
router.post('/update-completed-quizzes', async (req, res) => {
    if (!req.session.fname || !req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    const { quizNames } = req.body;
    if (!quizNames || !Array.isArray(quizNames)) {
        return res.status(400).json({ error: "Invalid request format" });
    }
    
    try {
        const studentUsername = req.session.username;
        
        // Connect to MongoDB
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get existing attempts
        const attemptsCollection = db.collection('attempts');
        const attempts = await attemptsCollection.findOne({ username: studentUsername }) || { username: studentUsername, attempts: [] };
        
        // Add new attempts
        for (const quizName of quizNames) {
            if (!attempts.attempts.some(a => a.quizName === quizName)) {
                attempts.attempts.push({
                    quizName,
                    timestamp: new Date()
                });
            }
        }
        
        // Update attempts in MongoDB
        await attemptsCollection.updateOne(
            { username: studentUsername },
            { $set: attempts },
            { upsert: true }
        );
        
        await client.close();
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating completed quizzes:', err);
        res.status(500).json({ error: 'Failed to update completed quizzes' });
    }
});

// Route to get attempts for a student
router.get('/attempts', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }

    try {
        const username = req.session.username;
        
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        const attemptsCollection = db.collection('attempts');
        
        // Get all attempts for this student
        const attempts = await attemptsCollection.find({ studentId: username })
            .sort({ attemptedAt: -1 })
            .toArray();
        
        await client.close();
        res.json(attempts);
    } catch (err) {
        console.error('Error getting attempts:', err);
        res.status(500).json({ error: 'Failed to get attempts' });
    }
});

// Route to save quiz attempt
router.post('/save-attempt', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }

    try {
        const { quizName, score, totalQuestions, isRetake, answers } = req.body;
        const username = req.session.username;
        
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        const attemptsCollection = db.collection('attempts');
        
        // Create new attempt document
        const attempt = {
            studentId: username,
            quizName,
            score,
            totalQuestions,
            attemptedAt: new Date(),
            isRetake: isRetake || false,
            fromSessionStorage: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            answers: answers || null
        };
        
        // Save to MongoDB only
        await attemptsCollection.insertOne(attempt);
        await client.close();
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving attempt:', err);
        res.status(500).json({ error: 'Failed to save attempt' });
    }
});

// Route to sync attempts between local storage and MongoDB
router.post('/sync-attempts', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }

    try {
        const username = req.session.username;
        
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        const attemptsCollection = db.collection('attempts');
        
        // Get attempts from MongoDB
        const attempts = await attemptsCollection.find({ studentId: username })
            .sort({ attemptedAt: -1 })
            .toArray();
        
        await client.close();
        res.json({ success: true, attempts });
    } catch (err) {
        console.error('Error syncing attempts:', err);
        res.status(500).json({ error: 'Failed to sync attempts' });
    }
});

// Route to delete attempt
router.post('/delete-attempt', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }

    try {
        const { quizName } = req.body;
        const username = req.session.username;
        
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        const attemptsCollection = db.collection('attempts');
        
        // Delete from MongoDB only
        await attemptsCollection.deleteOne({ 
            studentId: username, 
            quizName: quizName 
        });
        
        await client.close();
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting attempt:', err);
        res.status(500).json({ error: 'Failed to delete attempt' });
    }
});

router.get('/quiz/:quizName', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.redirect("/login");
    }

    const quizName = decodeURIComponent(req.params.quizName);
    const studentClass = req.session.class || '1';
    const studentUsername = req.session.username;

    try {
        // Connect to MongoDB
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Find the quiz in the admin's database
        const quiz = await db.collection('quizzes').findOne({ name: quizName });
        
        if (!quiz) {
            await client.close();
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Quiz Not Found</title>
                    <style>
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            padding: 20px;
                            background-color: #f8f9fa;
                            text-align: center;
                }
                        .error-container {
                            background: white;
                            padding: 30px;
                            border-radius: 12px;
                            max-width: 500px;
                            margin: 50px auto;
                            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                        }
                        .back-btn {
                            display: inline-block;
                            margin-top: 20px;
                            padding: 10px 24px;
                            background-color: #4e73df;
                            color: white;
                            text-decoration: none;
                            border-radius: 6px;
                            font-weight: 500;
                            transition: all 0.3s;
                        }
                        .back-btn:hover {
                            background-color: #3a5ec0;
                            transform: translateY(-2px);
                            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <h2 style="color: #4e73df; margin-bottom: 15px;">Quiz Not Found</h2>
                        <p style="color: #6c757d;">The requested quiz does not exist in your admin's database.</p>
                        <a href="/student" class="back-btn">Back to Dashboard</a>
                    </div>
                </body>
                </html>
            `);
        }

        // Check if student has already attempted this quiz
        const hasAttempted = await db.collection('attempts').findOne({ 
            username: studentUsername, 
            quizName: quizName 
        });

        if (hasAttempted) {
            await client.close();
            return res.redirect(`/student/result/${encodeURIComponent(quizName)}`);
                }
                
        // Check if quiz is available for student's class
        if (quiz.class !== studentClass && !quiz.isStudentSpecific) {
            await client.close();
            return res.status(403).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                    <title>Quiz Not Available</title>
                        <style>
                            body {
                                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                padding: 20px;
                                background-color: #f8f9fa;
                                text-align: center;
                            }
                            .error-container {
                                background: white;
                                padding: 30px;
                                border-radius: 12px;
                                max-width: 500px;
                                margin: 50px auto;
                                box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                            }
                            .back-btn {
                                display: inline-block;
                                margin-top: 20px;
                                padding: 10px 24px;
                                background-color: #4e73df;
                                color: white;
                                text-decoration: none;
                                border-radius: 6px;
                                font-weight: 500;
                                transition: all 0.3s;
                            }
                            .back-btn:hover {
                                background-color: #3a5ec0;
                                transform: translateY(-2px);
                                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                            }
                        </style>
                    </head>
                    <body>
                        <div class="error-container">
                            <h2 style="color: #4e73df; margin-bottom: 15px;">Quiz Not Available</h2>
                        <p style="color: #6c757d;">This quiz is not available for your class.</p>
                            <a href="/student" class="back-btn">Back to Dashboard</a>
                        </div>
                    </body>
                    </html>
                `);
            }

        await client.close();

        // Send the quiz page with the data
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${quiz.name} - Start Quiz</title>
                    <style>
                        :root {
                            --primary: #4e73df;
                            --primary-dark: #3a5ec0;
                            --secondary: #f8f9fc;
                            --success: #1cc88a;
                            --danger: #e74a3b;
                            --warning: #f6c23e;
                            --light: #f8f9fa;
                            --dark: #5a5c69;
                        }
                        body {
                            font-family: 'Nunito', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background-color: #f8f9fc;
                            margin: 0;
                            padding: 0;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            color: #5a5c69;
                        }
                        .quiz-card {
                            background: white;
                            border-radius: 15px;
                            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
                            width: 90%;
                            max-width: 800px;
                            overflow: hidden;
                            margin: 30px 0;
                        }
                        .quiz-header {
                            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
                            color: white;
                            padding: 25px 30px;
                            text-align: center;
                        }
                        .quiz-header h2 {
                            margin: 0;
                            font-size: 1.8rem;
                            font-weight: 700;
                        }
                        .class-badge {
                            display: inline-block;
                            background-color: rgba(255,255,255,0.2);
                            padding: 4px 12px;
                            border-radius: 20px;
                            font-size: 0.9rem;
                            margin-left: 10px;
                            font-weight: 600;
                        }
                        .quiz-body {
                            padding: 30px;
                        }
                        .details-section {
                            display: grid;
                            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                            gap: 20px;
                            margin-bottom: 30px;
                            background: var(--secondary);
                            padding: 20px;
                            border-radius: 10px;
                        }
                        .detail-item {
                            display: flex;
                            flex-direction: column;
                        }
                        .detail-label {
                            font-size: 0.85rem;
                            color: var(--dark);
                            font-weight: 600;
                            margin-bottom: 5px;
                            opacity: 0.8;
                        }
                        .detail-value {
                            font-size: 1.1rem;
                            font-weight: 700;
                            color: var(--primary-dark);
                        }
                        .instructions-section {
                            margin-bottom: 30px;
                        }
                        .instructions-section h3 {
                            color: var(--primary);
                            border-bottom: 2px solid var(--secondary);
                            padding-bottom: 10px;
                            margin-top: 0;
                        }
                        .instructions-list {
                            padding-left: 20px;
                        }
                        .instructions-list li {
                            margin-bottom: 12px;
                            line-height: 1.5;
                        }
                        .attempted {
                            color: var(--success);
                            font-weight: bold;
                        }
                        .not-attempted {
                            color: var(--danger);
                            font-weight: bold;
                        }
                        .checkbox-container {
                            display: flex;
                            align-items: center;
                            margin: 25px 0;
                            padding: 15px;
                            background: var(--secondary);
                            border-radius: 8px;
                        }
                        .checkbox-container input {
                            width: 20px;
                            height: 20px;
                            margin-right: 15px;
                            accent-color: var(--primary);
                        }
                        .checkbox-container label {
                            font-weight: 600;
                            cursor: pointer;
                        }
                        .start-btn {
                            display: block;
                            width: 100%;
                            padding: 14px;
                            background-color: var(--primary);
                            color: white;
                            border: none;
                            border-radius: 8px;
                            font-size: 1.1rem;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s;
                        }
                        .start-btn:hover:not(:disabled) {
                            background-color: var(--primary-dark);
                            transform: translateY(-2px);
                            box-shadow: 0 4px 12px rgba(78, 115, 223, 0.3);
                        }
                        .start-btn:disabled {
                            background-color: #cccccc;
                            cursor: not-allowed;
                            transform: none;
                            box-shadow: none;
                        }
                        .modal {
                            display: none;
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            background-color: rgba(0,0,0,0.5);
                            z-index: 1000;
                            justify-content: center;
                            align-items: center;
                        }
                        .modal-content {
                            background-color: white;
                            padding: 30px;
                            border-radius: 12px;
                            max-width: 400px;
                            text-align: center;
                            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                        }
                        .modal h3 {
                            color: var(--primary);
                            margin-top: 0;
                        }
                        .modal-btn {
                            padding: 10px 24px;
                            background-color: var(--primary);
                            color: white;
                            border: none;
                            border-radius: 6px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s;
                        }
                        .modal-btn:hover {
                            background-color: var(--primary-dark);
                            transform: translateY(-2px);
                            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                        }
                        @media (max-width: 600px) {
                            .quiz-body {
                                padding: 20px;
                            }
                            .details-section {
                                grid-template-columns: 1fr;
                            }
                        }
                    </style>
                    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
                </head>
                <body>
                    <div class="quiz-card">
                        <div class="quiz-header">
                            <h2>${quiz.name}</h2>
                        </div>
                        
                        <div class="quiz-body">
                            <div class="details-section">
                                <div class="detail-item">
                                    <span class="detail-label">Start Time</span>
                                    <span class="detail-value">${quiz.startTime}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">End Time</span>
                                    <span class="detail-value">${quiz.endTime}</span>
                                </div>
                            </div>
                            
                            <div class="instructions-section">
                                <h3>Exam Instructions</h3>
                                <ol class="instructions-list">
                                    <li>The quiz consists of multiple-choice questions.</li>
                                    <li>Use the <strong>Next</strong> and <strong>Previous</strong> buttons to navigate between questions.</li>
                                    <li>The side panel shows all questions - <span class="attempted">green</span> for attempted, <span class="not-attempted">red</span> for not attempted.</li>
                                    <li>You can click on any question number in the side panel to jump to that question.</li>
                                    <li>Do not switch tabs or windows during the exam - you have only <strong>2 tab changes</strong> allowed.</li>
                                    <li>After 2 tab changes, your exam will be automatically submitted.</li>
                                    <li>The exam will automatically submit when the time expires.</li>
                                    <li>Once submitted, you cannot retake the exam.</li>
                                    <li>Do not refresh the page during the exam.</li>
                                    <li>Make sure you have a stable internet connection before starting.</li>
                                </ol>
                            </div>
                            
                            <div class="checkbox-container">
                                <input type="checkbox" id="agreeCheckbox" onchange="toggleStartButton()">
                                <label for="agreeCheckbox">I have read and understood all the instructions</label>
                            </div>
                            
                            <button id="startButton" class="start-btn" onclick="checkQuizTime()" disabled>Start Quiz</button>
                        </div>
                    </div>
                    
                    <!-- Modal for time validation messages -->
                    <div id="timeModal" class="modal">
                        <div class="modal-content">
                            <h3 id="modalMessage"></h3>
                            <button class="modal-btn" onclick="document.getElementById('timeModal').style.display='none'">OK</button>
                        </div>
                    </div>

                    <script>
                        function toggleStartButton() {
                            const checkbox = document.getElementById('agreeCheckbox');
                            const startButton = document.getElementById('startButton');
                            startButton.disabled = !checkbox.checked;
                        }
                        
                        function checkQuizTime() {
                            const now = new Date();
                            const currentHours = now.getHours();
                            const currentMinutes = now.getMinutes();
                            
                            const startTime = "${quiz.startTime}".split(':');
                            const endTime = "${quiz.endTime}".split(':');
                            
                            const startHour = parseInt(startTime[0]);
                            const startMinute = parseInt(startTime[1]);
                            const endHour = parseInt(endTime[0]);
                            const endMinute = parseInt(endTime[1]);
                            
                            // Create Date objects for comparison
                            const quizStart = new Date();
                            quizStart.setHours(startHour, startMinute, 0, 0);
                            
                            const quizEnd = new Date();
                            quizEnd.setHours(endHour, endMinute, 0, 0);
                            
                            if (now < quizStart) {
                                // Quiz hasn't started yet
                                showModal(\`Exam will start at ${quiz.startTime}\`);
                            } else if (now > quizEnd) {
                                // Quiz has ended
                                showModal(\`Exam is over. It ended at ${quiz.endTime}\`);
                            } else {
                                // Quiz is active - proceed to start
                                window.location.href='/student/startquiz/${encodeURIComponent(quiz.name)}';
                            }
                        }
                        
                        function showModal(message) {
                            const modal = document.getElementById('timeModal');
                            document.getElementById('modalMessage').textContent = message;
                            modal.style.display = 'flex';
                        }
                    </script>
                </body>
                </html>
            `);
    } catch (err) {
        console.error('Error processing quiz request:', err);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        padding: 20px;
                        background-color: #f8f9fa;
                        text-align: center;
                    }
                    .error-container {
                        background: white;
                        padding: 30px;
                        border-radius: 12px;
                        max-width: 500px;
                        margin: 50px auto;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                    }
                    .back-btn {
                        display: inline-block;
                        margin-top: 20px;
                        padding: 10px 24px;
                        background-color: #4e73df;
                        color: white;
                        text-decoration: none;
                        border-radius: 6px;
                        font-weight: 500;
                        transition: all 0.3s;
                    }
                    .back-btn:hover {
                        background-color: #3a5ec0;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h2 style="color: #4e73df; margin-bottom: 15px;">Error</h2>
                    <p style="color: #6c757d;">There was a problem loading the quiz. Please try again later.</p>
                    <a href="/student" class="back-btn">Back to Dashboard</a>
                </div>
            </body>
            </html>
        `);
    }
});


// Attempt Result Page
router.get('/result/:quizName', async (req, res) => {
    if (!req.session.fname || !req.session.username || req.session.role !== 'student') {
        return res.redirect('/login');
    }

    const quizName = decodeURIComponent(req.params.quizName);
    const studentUsername = req.session.username;

    try {
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        const attemptsCollection = db.collection('attempts');
        
        // Get the latest attempt for this quiz
        const attempt = await attemptsCollection.findOne(
            { 
                studentId: studentUsername,
                quizName: quizName
            },
            { sort: { attemptedAt: -1 } }
        );

        await client.close();
        
        if (!attempt) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>No Attempts Found</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            padding: 20px;
                            background-color: #f4f4f4;
                            text-align: center;
                        }
                        .error-container {
                            background: white;
                            padding: 30px;
                            border-radius: 8px;
                            max-width: 500px;
                            margin: 50px auto;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        }
                        .back-btn {
                            display: inline-block;
                            margin-top: 20px;
                            padding: 10px 20px;
                            background-color: #6c757d;
                            color: white;
                            text-decoration: none;
                            border-radius: 4px;
                        }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <h2>No Attempt Found</h2>
                        <p>No quiz attempts were found for your account.</p>
                        <a href="/student" class="back-btn">Back to Dashboard</a>
                    </div>
                </body>
                </html>
            `);
        }

        const percentage = Math.round((attempt.score / attempt.totalQuestions) * 100);
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Quiz Result - ${quizName}</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        padding: 20px;
                        background-color: #f8f9fa;
                        margin: 0;
                        color: #333;
                    }
                    .container {
                        max-width: 800px;
                        margin: 40px auto;
                        padding: 0 20px;
                    }
                    .card {
                        background: white;
                        border-radius: 12px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.08);
                        overflow: hidden;
                        display: flex;
                    }
                    .card-left {
                        flex: 1;
                        padding: 40px;
                        border-right: 1px solid #eee;
                    }
                    .card-right {
                        width: 250px;
                        padding: 40px;
                        background: #f9f9f9;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                    }
                    .result-header {
                        margin-bottom: 30px;
                    }
                    .result-header h2 {
                        font-size: 18px;
                        color: #666;
                        margin: 0;
                        font-weight: 500;
                    }
                    .result-header h1 {
                        font-size: 28px;
                        margin: 5px 0 0;
                        color: #2c3e50;
                    }
                    .divider {
                        height: 1px;
                        background: linear-gradient(to right,rgb(0, 0, 0),rgb(0, 0, 0));
                        margin: 20px 0;
                        border-radius: 3px;
                    }
                    .progress-container {
                        position: relative;
                        width: 150px;
                        height: 150px;
                        margin: 20px 0;
                    }
                    .progress-circle {
                        width: 100%;
                        height: 100%;
                    }
                    .progress-circle-bg {
                        fill: none;
                        stroke: #eee;
                        stroke-width: 8;
                    }
                    .progress-circle-fill {
                        fill: none;
                        stroke: #4CAF50;
                        stroke-width: 8;
                        stroke-linecap: round;
                        stroke-dasharray: 440;
                        stroke-dashoffset: calc(440 - (440 * ${percentage}) / 100);
                        transform: rotate(-90deg);
                        transform-origin: 50% 50%;
                        animation: progress 1.5s ease-out forwards;
                    }
                    .progress-text {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        font-size: 28px;
                        font-weight: bold;
                        color: #4CAF50;
                    }
                    .marks-container {
                        text-align: center;
                        margin-top: 10px;
                    }
                    .marks-title {
                        font-size: 20px;
                        color: #666;
                        margin-bottom: 5px;
                        font-weight : bold;
                    }
                    .marks-value {
                        font-size: 22px;
                        font-weight: bold;
                    }
                    .marks-value span:first-child {
                        color: #4CAF50;
                        font-size: 50px;
                    }
                    .marks-value span:last-child {
                        color: #666;
                        font-weight: normal;
                    }
                    .completed-date {
                        margin-top: 30px;
                        font-size: 14px;
                        color: #888;
                        text-align: center;
                    }
                    .back-button {
                        display: inline-block;
                        margin-top: 30px;
                        padding: 12px 25px;
                        background-color:rgb(0, 153, 255);
                        color: white;
                        text-decoration: none;
                        border-radius: 6px;
                        font-weight: 500;
                        transition: all 0.3s;
                        border: none;
                        cursor: pointer;
                    }
                    .back-button:hover {
                        background-color: #6c757d;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                    }
                    @keyframes progress {
                        from {
                            stroke-dashoffset: 440;
                        }
                        to {
                            stroke-dashoffset: calc(440 - (440 * ${percentage}) / 100);
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="card">
                        <div class="card-left">
                            <div class="result-header">
                                <h2>Result</h2>
                                <h1>Test Name: ${quizName}</h1>
                            </div>
                            <div class="divider"></div>
                            <p>You have successfully completed the quiz. Here's your performance summary:</p>
                            <a href="/student" class="back-button">Back to Dashboard</a>
                        </div>
                        <div class="card-right">
                            <div class="progress-container">
                                <svg class="progress-circle" viewBox="0 0 160 160">
                                    <circle class="progress-circle-bg" cx="80" cy="80" r="70"></circle>
                                    <circle class="progress-circle-fill" cx="80" cy="80" r="70"></circle>
                                </svg>
                                <div class="progress-text">${percentage}%</div>
                            </div>
                            <div class="marks-container">
                                <div class="marks-title">Marks</div>
                                <div class="marks-value">
                                    <span>${attempt.score}</span>
                                    <span> / ${attempt.totalQuestions}</span>
                                </div>
                            </div>
                            <div class="completed-date">
                                Completed on ${new Date(attempt.attemptedAt).toLocaleDateString('en-US', { 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error("Failed to read attempts:", err);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        background-color: #f4f4f4;
                        text-align: center;
                    }
                    .error-container {
                        background: white;
                        padding: 30px;
                        border-radius: 8px;
                        max-width: 500px;
                        margin: 50px auto;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .back-btn {
                        display: inline-block;
                        margin-top: 20px;
                        padding: 10px 20px;
                        background-color: #6c757d;
                        color: white;
                        text-decoration: none;
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h2>Error Loading Results</h2>
                    <p>Failed to load your quiz results. Please try again later.</p>
                    <p>Error details: ${err.message}</p>
                    <a href="/student" class="back-btn">Back to Dashboard</a>
                </div>
            </body>
            </html>
        `);
    }
});

// Add endpoint to check completed quizzes from session
router.get('/check-completed-quizzes', (req, res) => {
    if (!req.session.fname || !req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    // Return completed quizzes from session if available
    const completedQuizzes = (req.session.completedQuizzes || [])
        .map(quiz => quiz.quizName);
    
    res.json(completedQuizzes);
});

// Student messages routes
router.get('/messages', (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.redirect('/login');
    }
    
    res.sendFile(path.join(__dirname, '../public/student-messages.html'));
});

// API endpoint to get messages for a student
router.get('/api/messages', async (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    try {
        const studentUsername = req.session.username;
        
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get messages for this student
        const messages = await db.collection('messages')
            .find({ studentUsername: studentUsername })
            .sort({ timestamp: -1 }) // Sort by newest first
            .toArray();
            
        await client.close();
        res.json(messages);
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// API endpoint to send a new message
router.post('/messages/send', async (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    const { issueType, quizName, messageContent } = req.body;
    
    if (!issueType || !quizName || !messageContent) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        const studentUsername = req.session.username;
        const studentName = req.session.fname;
        const studentClass = req.session.class || '1';
        
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Create new message
        const newMessage = {
            studentUsername,
            studentName,
            class: studentClass,
            issueType,
            quizName,
            messageContent,
            timestamp: new Date(),
            read: false,
            replies: []
        };
        
        // Save to admin-specific database
        const result = await db.collection('messages').insertOne(newMessage);
        await client.close();
        
        res.json({ 
            success: true, 
            message: 'Message sent successfully',
            id: result.insertedId
        });
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Add logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/login');
    });
});

// Route to get manual questions for a quiz
router.get('/manual-questions/:quizName', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const quizName = req.params.quizName;
        
        // First try to get from MongoDB
        const db = req.app.locals.db;
        const manualQuestionsCollection = db.collection('manual_questions');
        
        const quiz = await manualQuestionsCollection.findOne({ quizName });
        if (quiz) {
            return res.json(quiz.questions);
        }
        
        // If not found in MongoDB, try local file
        const manualQuestionsPath = path.join(__dirname, '../manual-questions', `${quizName}.json`);
        if (fs.existsSync(manualQuestionsPath)) {
            const questions = JSON.parse(fs.readFileSync(manualQuestionsPath, 'utf8'));
            // Save to MongoDB for future use
            await manualQuestionsCollection.insertOne({
                quizName,
                questions,
                createdAt: new Date()
            });
            return res.json(questions);
        }
        
        // If no questions found
        res.status(404).json({ error: "Questions not found" });
    } catch (err) {
        console.error('Error getting manual questions:', err);
        res.status(500).json({ error: 'Failed to get manual questions' });
    }
});

module.exports = router;