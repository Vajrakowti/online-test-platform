const express = require('express');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
const router = express.Router();
const { loadQuizData } = require('./startquiz'); // Import loadQuizData

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
    if (!req.session.username || req.session.role !== 'student') {
        return res.redirect("/login");
    }

    try {
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get current date and time in IST
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + 
                          now.getMinutes().toString().padStart(2, '0');
        
        // Get all quizzes
        const quizzes = await db.collection('quizzes').find().toArray();
        
        // Get attempted quizzes
        const attemptedQuizzes = await db.collection('attempts')
            .find({ studentId: req.session.username })
            .toArray();

        // Create a Set of attempted quiz names for faster lookup
        const attemptedQuizNames = new Set(attemptedQuizzes.map(attempt => attempt.quizName));

        // Filter quizzes for today:
        // 1. Must match today's date exactly
        // 2. Must not have been attempted
        // 3. Current time must be within the quiz's time window
        const todayQuizzes = quizzes.filter(quiz => {
            const quizDate = new Date(quiz.examDate).toISOString().split('T')[0];
            return quizDate === currentDate && 
                   !attemptedQuizNames.has(quiz.name) &&
                   quiz.startTime <= currentTime &&
                   quiz.endTime >= currentTime;
        });

        await client.close();

        res.render('student', {
            username: req.session.username,
            quizzes: todayQuizzes,
            attemptedQuizzes: attemptedQuizzes
        });
    } catch (error) {
        console.error('Error loading student dashboard:', error);
        res.status(500).send('Error loading dashboard');
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
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Find the quiz
        const quiz = await db.collection('quizzes').findOne({ name: quizName });
        
        if (!quiz) {
            await client.close();
            return res.status(404).send('Quiz not found');
        }

        // Check if student has already attempted this quiz
        const hasAttempted = await db.collection('attempts').findOne({ 
            studentId: studentUsername, 
            quizName: quizName 
        });

        if (hasAttempted) {
            await client.close();
            return res.redirect(`/student/result/${encodeURIComponent(quizName)}`);
        }

        // Validate quiz date and time
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + 
                          now.getMinutes().toString().padStart(2, '0');
        
        const quizDate = new Date(quiz.examDate).toISOString().split('T')[0];
        
        // Check if quiz is scheduled for today
        if (quizDate !== currentDate) {
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
                        <p style="color: #6c757d;">This quiz is scheduled for ${new Date(quiz.examDate).toLocaleDateString()}. Please come back on the scheduled date.</p>
                        <a href="/student" class="back-btn">Back to Dashboard</a>
                    </div>
                </body>
                </html>
            `);
        }

        // Check if current time is within quiz time window
        if (currentTime < quiz.startTime || currentTime > quiz.endTime) {
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
                        <p style="color: #6c757d;">This quiz is only available between ${quiz.startTime} and ${quiz.endTime}.</p>
                        <a href="/student" class="back-btn">Back to Dashboard</a>
                    </div>
                </body>
                </html>
            `);
        }

        await client.close();

        // If all validations pass, proceed with quiz start
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
                        
                        <button id="startButton" class="start-btn" onclick="checkQuizTime()" disabled>Next</button>
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
        res.status(500).send('Error loading quiz');
    }
});


// Attempt Result Page
router.get('/result/:quizName', async (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
        return res.redirect('/login');
    }

    const quizName = decodeURIComponent(req.params.quizName);
    const studentUsername = req.session.username;

    let client;
    try {
        client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);

        const attempt = await db.collection('attempts').findOne({
            studentId: studentUsername,
            quizName: quizName
        });

        if (!attempt) {
            await client.close();
            return res.status(404).send('Quiz attempt not found.');
        }

        const quizConfig = await db.collection('quizzes').findOne({ name: quizName });

        if (!quizConfig) {
            await client.close();
            return res.status(404).send('Quiz configuration not found.');
        }

        // Calculate percentage using totalMarks instead of totalQuestions
        const percentage = (attempt.totalMarks > 0) 
                           ? ((attempt.score / attempt.totalMarks) * 100).toFixed(2)
                           : 0; // Handle division by zero

        await client.close();

        // Render the result page with dynamic data
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Quiz Result</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
                <style>
                    body {
                        font-family: 'Nunito', sans-serif;
                        margin: 0;
                        background-color: #f0f2f5;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }
                    .container {
                        width: 100%;
                        max-width: 900px;
                        padding: 20px;
                    }
                    .card {
                        background-color: white;
                        border-radius: 12px;
                        box-shadow: 0 0.15rem 1.75rem 0 rgba(58, 59, 69, 0.15);
                        display: flex;
                        flex-wrap: wrap; /* Allow wrapping on smaller screens */
                        overflow: hidden;
                    }
                    .card-left {
                        flex: 1; /* Take available space */
                        padding: 40px;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: flex-start;
                        min-width: 300px; /* Ensure a minimum width */
                    }
                    .card-right {
                        flex: 1; /* Take available space */
                        padding: 40px;
                        background-color: #f8f9fc;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        min-width: 300px; /* Ensure a minimum width */
                    }
                    .result-header h2 {
                        color: #4e73df;
                        font-size: 1.8rem;
                        margin-bottom: 10px;
                    }
                    .result-header h1 {
                        color: #5a5c69;
                        font-size: 2.5rem;
                        margin-bottom: 20px;
                        line-height: 1.2;
                    }
                    .divider {
                        width: 80px;
                        height: 4px;
                        background-color: #4e73df;
                        margin-bottom: 25px;
                        border-radius: 2px;
                    }
                    .progress-container {
                        position: relative;
                        width: 160px;
                        height: 160px;
                        margin-bottom: 30px;
                    }
                    .progress-circle {
                        transform: rotate(-90deg);
                    }
                    .progress-circle-bg {
                        stroke: #e6e6e6;
                        stroke-width: 10;
                        fill: none;
                    }
                    .progress-circle-fill {
                        stroke: #1cc88a;
                        stroke-width: 10;
                        stroke-linecap: round;
                        fill: none;
                        transition: stroke-dashoffset 0.5s ease-out;
                        stroke-dasharray: 440; /* 2 * PI * 70 (radius) */
                        stroke-dashoffset: calc(440 - (440 * ${percentage}) / 100);
                    }
                    .progress-text {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        font-size: 2.5rem;
                        font-weight: 700;
                        color: #1cc88a;
                    }
                    .marks-container {
                        text-align: center;
                        margin-bottom: 20px;
                    }
                    .marks-title {
                        font-size: 1.2rem;
                        color: #666;
                        margin-bottom: 10px;
                    }
                    .marks-value {
                        font-size: 3.5rem;
                        font-weight: 700;
                        color: #1cc88a;
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
                                    <span> / ${attempt.totalMarks}</span>
                                </div>
                            </div>
                            <div class="completed-date">
                                Completed on ${new Date(attempt.submittedAt).toLocaleDateString('en-US', { 
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
    const completedQuizzes = Object.keys(req.session.completedQuizzes || {});
    
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

// Route to serve results page (student/result.html)
router.get('/result/:quizName', async (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, '../public/result.html'));
});

// New API endpoint to get detailed quiz result data
router.get('/api/result-data/:quizName', async (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const quizName = req.params.quizName;
    const studentUsername = req.session.username;
    let client;

    try {
        client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);

        const attemptsCollection = db.collection('attempts');
        const quizzesCollection = db.collection('quizzes');

        // 1. Get the student's attempt
        const studentAttempt = await attemptsCollection.findOne({
            quizName: quizName,
            studentId: studentUsername
        });

        if (!studentAttempt) {
            await client.close();
            return res.status(404).json({ error: 'Quiz attempt not found.' });
        }

        // 2. Get the quiz configuration to load full questions
        const quizConfig = await quizzesCollection.findOne({ name: quizName });

        if (!quizConfig) {
            await client.close();
            return res.status(404).json({ error: 'Quiz configuration not found.' });
        }

        // 3. Load all questions and correct answers using loadQuizData
        const fullQuizData = loadQuizData(quizConfig); // This returns { sections: [...] }

        let allQuestionsFlat = [];
        let globalIdxCounter = 0;
        fullQuizData.sections.forEach(section => {
            section.questions.forEach(q => {
                allQuestionsFlat.push({
                    question: q.question,
                    options: q.options,
                    correctAnswers: q.correctAnswers,
                    sectionName: section.name,
                    globalIndex: globalIdxCounter
                });
                globalIdxCounter++;
            });
        });

        // 4. Combine student's answers with full question data
        const questionsWithResults = allQuestionsFlat.map((q, globalIndex) => {
            const studentAnswerRecord = studentAttempt.answers.find(a => a.questionIndex === globalIndex);
            const studentAnswer = studentAnswerRecord ? studentAnswerRecord.submittedAnswer : 'Not Answered';
            const isCorrect = studentAnswerRecord ? studentAnswerRecord.isCorrect : false; // Use the isCorrect from attempt

            return {
                question: q.question,
                options: q.options,
                correctAnswers: q.correctAnswers,
                studentAnswer: studentAnswer,
                isCorrect: isCorrect,
                sectionName: q.sectionName
            };
        });

        res.json({
            success: true,
            quizName: quizName,
            score: studentAttempt.score,
            totalQuestions: studentAttempt.totalQuestions,
            questionsWithResults: questionsWithResults,
            submittedAt: studentAttempt.submittedAt
        });

    } catch (error) {
        console.error('Error fetching result data:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Find and fix the route around line 1185
router.get('/completed-quizzes', (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Convert completedQuizzes object to array of quiz names
    const completedQuizzes = req.session.completedQuizzes || {};
    const completedQuizNames = Object.keys(completedQuizzes).filter(quizName => completedQuizzes[quizName]);
    
    res.json(completedQuizNames);
});

// Update the dashboard route
router.get('/dashboard', async (req, res) => {
    try {
        if (!req.session.username || req.session.role !== 'student') {
            return res.redirect('/login');
        }

        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get all quizzes
        const quizzes = await db.collection('quizzes').find({}).toArray();
        
        // Get completed quizzes from session
        const completedQuizzes = req.session.completedQuizzes || {};
        
        // Process quizzes to add completion status
        const processedQuizzes = quizzes.map(quiz => ({
            ...quiz,
            isCompleted: !!completedQuizzes[quiz.name]
        }));

        // Get student's attempts
        const attempts = await db.collection('attempts')
            .find({ studentId: req.session.username })
            .toArray();

        // Create a map of quiz attempts
        const attemptMap = {};
        attempts.forEach(attempt => {
            attemptMap[attempt.quizName] = {
                score: attempt.score,
                totalQuestions: attempt.totalQuestions,
                submittedAt: attempt.submittedAt
            };
        });

        // Add attempt information to quizzes
        const quizzesWithAttempts = processedQuizzes.map(quiz => ({
            ...quiz,
            attempt: attemptMap[quiz.name] || null
        }));

        await client.close();

        res.render('student/dashboard', {
            username: req.session.username,
            quizzes: quizzesWithAttempts
        });
    } catch (error) {
        console.error('Error loading student dashboard:', error);
        res.status(500).send('Error loading dashboard: ' + error.message);
    }
});

// Add new route for quiz completion page
router.get('/quiz-completion/:quizName', (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
        return res.redirect('/login');
    }

    const quizName = req.params.quizName;
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Quiz Completed</title>
            <style>
                body {
                    font-family: 'Nunito', sans-serif;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    background-color: #f8f9fc;
                }
                .completion-card {
                    background: white;
                    padding: 40px;
                    border-radius: 15px;
                    box-shadow: 0 0.15rem 1.75rem 0 rgba(58, 59, 69, 0.15);
                    text-align: center;
                    max-width: 500px;
                    width: 90%;
                }
                .completion-icon {
                    font-size: 64px;
                    color: #1cc88a;
                    margin-bottom: 20px;
                }
                h1 {
                    color: #4e73df;
                    margin-bottom: 20px;
                    font-size: 28px;
                }
                p {
                    color: #5a5c69;
                    margin-bottom: 30px;
                    font-size: 16px;
                    line-height: 1.6;
                }
                .button-container {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                }
                .btn {
                    padding: 12px 25px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    text-decoration: none;
                }
                .btn-primary {
                    background-color: #4e73df;
                    color: white;
                }
                .btn-secondary {
                    background-color: #858796;
                    color: white;
                }
                .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        </head>
        <body>
            <div class="completion-card">
                <div class="completion-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h1>Quiz Completed Successfully!</h1>
                <p>Thank you for completing the quiz. Your answers have been submitted successfully. You can now view your results in the dashboard.</p>
                <div class="button-container">
                    <a href="/student" class="btn btn-primary">Go to Dashboard</a>
                    <a href="/student/result/${encodeURIComponent(quizName)}" class="btn btn-secondary">View Results</a>
                </div>
            </div>
            <script>
                // Prevent going back to quiz
                window.history.pushState(null, '', window.location.href);
                window.onpopstate = function() {
                    window.history.pushState(null, '', window.location.href);
                    window.location.replace('/student');
                };
            </script>
        </body>
        </html>
    `);
});

module.exports = router;