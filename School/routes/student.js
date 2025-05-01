const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const QUIZ_FILE = path.join(__dirname, '../quizzes.json');
const ATTEMPTS_DIR = path.join(__dirname, '../attempts');

// Ensure attempts directory exists
if (!fs.existsSync(ATTEMPTS_DIR)) {
    fs.mkdirSync(ATTEMPTS_DIR);
}

// Route to serve student.html
router.get('/', (req, res) => {
    if (req.session.fname && req.session.role === 'student') {
        // Read the student.html file and replace the welcome message
        fs.readFile(path.join(__dirname, '../public/student.html'), 'utf8', (err, data) => {
            if (err) {
                console.error("Error reading student.html:", err);
                return res.status(500).send("Error loading dashboard");
            }
            
            // Replace the welcome message with the student's name
            let updatedHtml = data.replace(
                '<h2>Welcome, Student</h2>',
                `<h2>Welcome, ${req.session.fname}</h2>`
            );
            
            // Add script to check sessionStorage for completed quizzes
            const sessionStorageCheckScript = `
            <script>
                // Function to check sessionStorage for completed quizzes and update server
                function checkSessionStorageForCompletedQuizzes() {
                    const completedQuizzes = [];
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const key = sessionStorage.key(i);
                        if (key && key.startsWith('quiz_attempt_')) {
                            const quizName = key.replace('quiz_attempt_', '').replace(/_/g, ' ');
                            completedQuizzes.push(quizName);
                        }
                    }
                    return completedQuizzes;
                }
                
                // On page load, send completed quizzes to server
                document.addEventListener('DOMContentLoaded', function() {
                    const recentlyCompletedQuizzes = checkSessionStorageForCompletedQuizzes();
                    if (recentlyCompletedQuizzes.length > 0) {
                        fetch('/student/update-completed-quizzes', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ quizNames: recentlyCompletedQuizzes })
                        })
                        .then(response => response.json())
                        .then(() => {
                            // Reload quizzes display after updating
                            if (window.refreshQuizLists) {
                                window.refreshQuizLists();
                            }
                        })
                        .catch(error => console.error('Error updating completed quizzes:', error));
                    }
                });
            </script>
            `;
            
            // Insert the script before the closing body tag
            updatedHtml = updatedHtml.replace('</body>', sessionStorageCheckScript + '</body>');
            
            res.send(updatedHtml);
        });
    } else {
        res.redirect("/login");
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


// Route to fetch quiz data - UPDATED TO FILTER BY CLASS AND CHECK RETAKE ELIGIBILITY
router.get('/quizzes', (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }

    // Get student's class from session
    const studentClass = req.session.class || '1'; // Default to class 1 if not set
    const studentUsername = req.session.username;
    
    // First get student's attempted quizzes
    const attemptsFile = path.join(ATTEMPTS_DIR, `${studentUsername}.json`);
    let attemptedQuizzes = [];
    
    if (fs.existsSync(attemptsFile)) {
        try {
            attemptedQuizzes = JSON.parse(fs.readFileSync(attemptsFile, 'utf8'))
                .map(attempt => attempt.quizName);
        } catch (err) {
            console.error("Failed to read attempts file:", err);
            // Continue with empty attempts array
        }
    }
    
    // Also check session-stored completions (in case file hasn't been updated yet)
    const sessionCompletedQuizzes = (req.session.completedQuizzes || [])
        .map(quiz => quiz.quizName);
    
    // Combine both sources of completed quizzes
    const completedQuizNames = [...new Set([...attemptedQuizzes, ...sessionCompletedQuizzes])];
    
    // Check all available retake quizzes for this student
    const RETAKE_DIR = path.join(__dirname, '../retakes');
    const retakeQuizzes = [];
    
    if (fs.existsSync(RETAKE_DIR)) {
        try {
            const retakeFiles = fs.readdirSync(RETAKE_DIR);
            for (const retakeFile of retakeFiles) {
                if (retakeFile.endsWith('.json')) {
                    const quizName = retakeFile.replace('.json', '').replace(/_/g, ' ');
                    const retakeFilePath = path.join(RETAKE_DIR, retakeFile);
                    const retakeData = JSON.parse(fs.readFileSync(retakeFilePath, 'utf8'));
                    
                    if (retakeData.includes(studentUsername)) {
                        retakeQuizzes.push(quizName);
                    }
                }
            }
        } catch (err) {
            console.error("Failed to read retake directory:", err);
        }
    }
    
    fs.readFile(QUIZ_FILE, 'utf-8', (err, data) => {
        if (err) {
            console.error("Failed to read quizzes file:", err);
            return res.status(500).json({ error: "Failed to load quizzes." });
        }
        try {
            const quizzes = JSON.parse(data);
            // Filter quizzes by student's class, active time window, and not attempted
            const now = new Date();
            const filteredQuizzes = quizzes.filter(q => {
                // First, check if this is a retake quiz specifically assigned to this student
                if (retakeQuizzes.includes(q.name)) {
                    // Only need to check time window for retake quizzes
                    const [startHour, startMinute] = q.startTime.split(':').map(Number);
                    const [endHour, endMinute] = q.endTime.split(':').map(Number);
                    
                    const quizStart = new Date();
                    quizStart.setHours(startHour, startMinute, 0, 0);
                    
                    const quizEnd = new Date();
                    quizEnd.setHours(endHour, endMinute, 0, 0);
                    
                    return now >= quizStart && now <= quizEnd;
                }
                
                // For student-specific quizzes (class 999), check if specifically assigned to this student
                if (q.isStudentSpecific || q.class === '999') {
                    // Check if in retake list for this quiz
                    const retakeFilePath = path.join(RETAKE_DIR, `${q.name.replace(/\s+/g, '_')}.json`);
                    if (fs.existsSync(retakeFilePath)) {
                        try {
                            const retakeData = JSON.parse(fs.readFileSync(retakeFilePath, 'utf8'));
                            if (retakeData.includes(studentUsername)) {
                                // Check time window
                                const [startHour, startMinute] = q.startTime.split(':').map(Number);
                                const [endHour, endMinute] = q.endTime.split(':').map(Number);
                                
                                const quizStart = new Date();
                                quizStart.setHours(startHour, startMinute, 0, 0);
                                
                                const quizEnd = new Date();
                                quizEnd.setHours(endHour, endMinute, 0, 0);
                                
                                return now >= quizStart && now <= quizEnd;
                            }
                        } catch (err) {
                            console.error("Failed to read retake file:", err);
                        }
                    }
                    return false;
                }
                
                // If not a retake, check normal eligibility
                
                // Skip if already completed 
                if (completedQuizNames.includes(q.name)) {
                    return false;
                }
                
                // Check if quiz is for student's class
                if (q.class !== studentClass) {
                    return false;
                }
                
                // Check if quiz is within active time window
                const [startHour, startMinute] = q.startTime.split(':').map(Number);
                const [endHour, endMinute] = q.endTime.split(':').map(Number);
                
                const quizStart = new Date();
                quizStart.setHours(startHour, startMinute, 0, 0);
                
                const quizEnd = new Date();
                quizEnd.setHours(endHour, endMinute, 0, 0);
                
                return now >= quizStart && now <= quizEnd;
            });
            
            res.json(filteredQuizzes.slice(-10).reverse()); // latest 10
        } catch (parseErr) {
            console.error("Failed to parse quizzes JSON:", parseErr);
            res.status(500).json({ error: "Invalid JSON format." });
        }
    });
});

// New route to update completed quizzes from sessionStorage
router.post('/update-completed-quizzes', (req, res) => {
    if (!req.session.fname || !req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    const { quizNames } = req.body;
    if (!quizNames || !Array.isArray(quizNames)) {
        return res.status(400).json({ error: "Invalid request format" });
    }
    
    const studentUsername = req.session.username;
    const attemptsFile = path.join(ATTEMPTS_DIR, `${studentUsername}.json`);
    
    // First check if these quizzes are already recorded in the attempts file
    let attempts = [];
    let needsUpdate = false;
    
    if (fs.existsSync(attemptsFile)) {
        try {
            attempts = JSON.parse(fs.readFileSync(attemptsFile, 'utf8'));
            
            // For each quiz name from sessionStorage, check if it's already in the attempts
            quizNames.forEach(quizName => {
                if (!attempts.some(attempt => attempt.quizName === quizName)) {
                    // If not found, add a placeholder entry
                    attempts.push({
                        quizName,
                        score: 0,  // We don't know the score
                        totalQuestions: 0,  // We don't know the total
                        attemptedAt: new Date().toISOString(),
                        fromSessionStorage: true  // Mark as recovered from session storage
                    });
                    needsUpdate = true;
                }
            });
            
            // If we added any new entries, save the updated attempts file
            if (needsUpdate) {
                fs.writeFileSync(attemptsFile, JSON.stringify(attempts, null, 2));
            }
            
        } catch (err) {
            console.error("Failed to process attempts file:", err);
        }
    } else {
        // If the attempts file doesn't exist yet, create it with the sessionStorage entries
        const newAttempts = quizNames.map(quizName => ({
            quizName,
            score: 0,
            totalQuestions: 0,
            attemptedAt: new Date().toISOString(),
            fromSessionStorage: true
        }));
        
        try {
            fs.writeFileSync(attemptsFile, JSON.stringify(newAttempts, null, 2));
        } catch (err) {
            console.error("Failed to create attempts file:", err);
        }
    }
    
    res.json({ success: true });
});

// Route to get attempted quizzes for the current student
router.get('/attempts', (req, res) => {
    if (!req.session.fname || !req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }

    const studentUsername = req.session.username; // Use username instead of name
    const attemptsFile = path.join(ATTEMPTS_DIR, `${studentUsername}.json`);
    
    if (!fs.existsSync(attemptsFile)) {
        return res.json([]);
    }
    
    try {
        const attempts = JSON.parse(fs.readFileSync(attemptsFile, 'utf8'));
        res.json(attempts);
    } catch (err) {
        console.error("Failed to read attempts file:", err);
        res.status(500).json({ error: "Failed to load attempts." });
    }
});

// Route to save quiz attempt
router.post('/saveattempt', (req, res) => {
    if (!req.session.fname || !req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }

    const { quizName, score, totalQuestions } = req.body;
    if (!quizName || score === undefined || totalQuestions === undefined) {
        return res.status(400).json({ error: "Missing required data" });
    }

    const studentUsername = req.session.username; // Use username instead of name
    const attemptsFile = path.join(ATTEMPTS_DIR, `${studentUsername}.json`);
    
    // Check if this is a retake
    const RETAKE_DIR = path.join(__dirname, '../retakes');
    const retakeFilePath = path.join(RETAKE_DIR, `${quizName.replace(/\s+/g, '_')}.json`);
    
    let isRetake = false;
    if (fs.existsSync(retakeFilePath)) {
        try {
            const retakeData = JSON.parse(fs.readFileSync(retakeFilePath, 'utf8'));
            
            if (retakeData.includes(studentUsername)) {
                isRetake = true;
                // Remove this student from retake list
                const updatedRetakeData = retakeData.filter(username => username !== studentUsername);
                fs.writeFileSync(retakeFilePath, JSON.stringify(updatedRetakeData, null, 2));
                
                // If no more students in retake list, can delete the file
                if (updatedRetakeData.length === 0) {
                    try {
                        fs.unlinkSync(retakeFilePath);
                    } catch (unlinkErr) {
                        console.error("Error deleting empty retake file:", unlinkErr);
                    }
                }
            }
        } catch (err) {
            console.error("Error checking/updating retake list:", err);
        }
    }
    
    let attempts = [];
    if (fs.existsSync(attemptsFile)) {
        try {
            attempts = JSON.parse(fs.readFileSync(attemptsFile, 'utf8'));
        } catch (err) {
            console.error("Failed to read existing attempts:", err);
        }
    }
    
    // Add the new attempt with timestamp
    attempts.push({
        quizName,
        score,
        totalQuestions,
        attemptedAt: new Date().toISOString(),
        isRetake: isRetake
    });
    
    try {
        fs.writeFileSync(attemptsFile, JSON.stringify(attempts, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error("Failed to save attempt:", err);
        res.status(500).json({ error: "Failed to save attempt" });
    }
});


router.get('/quiz/:quizName', (req, res) => {
    if (!req.session.fname || req.session.role !== 'student') {
        return res.redirect("/login");
    }

    const quizName = decodeURIComponent(req.params.quizName);
    const studentClass = req.session.class || '1';
    const studentUsername = req.session.username;

    // Check for retake eligibility
    const RETAKE_DIR = path.join(__dirname, '../retakes');
    let isRetakeEligible = false;
    
    if (fs.existsSync(RETAKE_DIR)) {
        const retakeFilePath = path.join(RETAKE_DIR, `${quizName.replace(/\s+/g, '_')}.json`);
        if (fs.existsSync(retakeFilePath)) {
            try {
                const retakeData = JSON.parse(fs.readFileSync(retakeFilePath, 'utf8'));
                if (retakeData.includes(studentUsername)) {
                    isRetakeEligible = true;
                }
            } catch (err) {
                console.error("Failed to read retake file:", err);
            }
        }
    }

    fs.readFile(QUIZ_FILE, 'utf-8', (err, data) => {
        if (err) {
            console.error("Failed to read quizzes file:", err);
            return res.status(500).send("Error loading quiz.");
        }

        try {
            const quizzes = JSON.parse(data);
            
            // Find the quiz - either regular class quiz or student-specific quiz
            const quiz = quizzes.find(q => {
                // If it's a normal class quiz
                if (q.name === quizName && q.class === studentClass) {
                    return true;
                }
                
                // If it's a retake quiz (class 999) that student is eligible for
                if (q.name === quizName && (q.isStudentSpecific || q.class === '999') && isRetakeEligible) {
                    return true;
                }
                
                return false;
            });

            if (!quiz) {
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
                            <h2 style="color: #4e73df; margin-bottom: 15px;">Quiz Not Available</h2>
                            <p style="color: #6c757d;">The requested quiz is not available for your class or does not exist.</p>
                            <a href="/student" class="back-btn">Back to Dashboard</a>
                        </div>
                    </body>
                    </html>
                `);
            }

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
        } catch (parseErr) {
            console.error("Failed to parse quizzes JSON:", parseErr);
            res.status(500).send("Error loading quiz data.");
        }
    });
});


// Attempt Result Page (unchanged)
router.get('/result/:quizName', (req, res) => {
    if (!req.session.fname || !req.session.username || req.session.role !== 'student') {
        return res.redirect('/login');
    }

    const quizName = decodeURIComponent(req.params.quizName);
    const studentUsername = req.session.username; // Use username from session
    const attemptsFile = path.join(ATTEMPTS_DIR, `${studentUsername}.json`);
    
    if (!fs.existsSync(attemptsFile)) {
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
    
    try {
        const attempts = JSON.parse(fs.readFileSync(attemptsFile, 'utf8'));
        const attempt = attempts.find(a => a.quizName === quizName);
        
        if (!attempt) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Attempt Not Found</title>
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
                        <h2>Attempt Not Found</h2>
                        <p>No attempt was found for the quiz: ${quizName}</p>
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
        console.error("Failed to read attempts file:", err);
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
router.get('/api/messages', (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    const studentUsername = req.session.username;
    const db = req.app.locals.db;
    
    // Get messages for this student
    db.collection('messages')
        .find({ studentUsername: studentUsername })
        .sort({ timestamp: -1 }) // Sort by newest first
        .toArray()
        .then(messages => {
            res.json(messages);
        })
        .catch(err => {
            console.error('Error fetching messages:', err);
            res.status(500).json({ error: 'Failed to load messages' });
        });
});

// API endpoint to send a new message
router.post('/messages/send', (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    const { issueType, quizName, messageContent } = req.body;
    
    if (!issueType || !quizName || !messageContent) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const db = req.app.locals.db;
    const studentUsername = req.session.username;
    const studentName = req.session.fname;
    const studentClass = req.session.class || '1';
    
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
    
    // Save to database
    db.collection('messages')
        .insertOne(newMessage)
        .then(result => {
            res.json({ 
                success: true, 
                message: 'Message sent successfully',
                id: result.insertedId
            });
        })
        .catch(err => {
            console.error('Error sending message:', err);
            res.status(500).json({ error: 'Failed to send message' });
        });
});

module.exports = router;