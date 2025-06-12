const express = require('express');
const path = require('path');
const xlsx = require('xlsx');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const router = express.Router();
const EXCEL_DIR = path.join(__dirname, '../uploads');
const QUIZ_JSON_PATH = path.join(__dirname, '../quizzes.json');
const MANUAL_QUESTIONS_DIR = path.join(__dirname, '../manual-questions');
const ATTEMPTS_DIR = path.join(__dirname, '../attempts');

// MongoDB connection URL
const url = process.env.MONGODB_URI || "mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles";

// Ensure directories exist
if (!fs.existsSync(EXCEL_DIR)) {
    fs.mkdirSync(EXCEL_DIR, { recursive: true, mode: 0o777 });
}
if (!fs.existsSync(MANUAL_QUESTIONS_DIR)) {
    fs.mkdirSync(MANUAL_QUESTIONS_DIR, { recursive: true, mode: 0o777 });
}
if (!fs.existsSync(ATTEMPTS_DIR)) {
    fs.mkdirSync(ATTEMPTS_DIR, { recursive: true, mode: 0o777 });
}

function loadQuizData(quiz) {
    if (quiz.type === 'excel') {
        // Load Excel quiz sections
        const sections = [];
        
        for (const section of quiz.sections) {
            const excelFilePath = path.join(EXCEL_DIR, section.file);
            console.log('Attempting to load Excel file from:', excelFilePath);
            
            // Check if the file exists before attempting to read it
            if (!fs.existsSync(excelFilePath)) {
                console.error(`Excel file not found at path: ${excelFilePath}`);
                throw new Error(`Excel file not found for section ${section.name}: ${section.file}. Please contact the administrator.`);
            }
            
            try {
                console.log(`Attempting to read workbook: ${excelFilePath}`);
                const workbook = xlsx.readFile(excelFilePath);
                console.log(`Successfully read workbook: ${excelFilePath}`);
                const sheetName = workbook.SheetNames[0];
                console.log(`Processing sheet: ${sheetName}`);
                const sheet = workbook.Sheets[sheetName];
                const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                console.log(`Extracted ${rows.length} rows from sheet.`);
                
                // Remove header row
                const dataRows = rows.slice(1);
                console.log(`Processing ${dataRows.length} data rows.`);
                
                // Map each row to [question, option1, option2, option3, option4, correctAnswers]
                const mappedRows = dataRows.map(row => {
                    // Defensive: ensure at least 6 columns
                    if (!row || row.length < 6) return null;
                    const [question, option1, option2, option3, option4, answerCol, secondAnswerCol] = row;
                    let correctAnswers = [];
                    
                    // Map A/B/C/D to the correct option value for the first answer
                    switch ((answerCol || '').toString().trim().toUpperCase()) {
                        case 'A':
                            correctAnswers.push(option1);
                            break;
                        case 'B':
                            correctAnswers.push(option2);
                            break;
                        case 'C':
                            correctAnswers.push(option3);
                            break;
                        case 'D':
                            correctAnswers.push(option4);
                            break;
                    }
                    
                    // If there's a second answer column, process it
                    if (secondAnswerCol) {
                        switch ((secondAnswerCol || '').toString().trim().toUpperCase()) {
                            case 'A':
                                correctAnswers.push(option1);
                                break;
                            case 'B':
                                correctAnswers.push(option2);
                                break;
                            case 'C':
                                correctAnswers.push(option3);
                                break;
                            case 'D':
                                correctAnswers.push(option4);
                                break;
                        }
                    }
                    
                    return {
                        question,
                        options: [option1, option2, option3, option4],
                        correctAnswers
                    };
                }).filter(Boolean); // Remove null entries
                
                sections.push({
                    name: section.name,
                    questions: mappedRows
                });
                console.log(`Successfully loaded ${mappedRows.length} questions for section: ${section.name}`);
            } catch (error) {
                console.error(`Error loading section ${section.name}:`, error);
                throw new Error(`Error loading section ${section.name}: ${error.message}`);
            }
        }
        
        return { sections: sections }; // Return an object with sections property
    } else if (quiz.type === 'manual') {
        // For manual quizzes, questions are stored directly in the quiz object
        if (!quiz.questions || !Array.isArray(quiz.questions)) {
            throw new Error('Invalid quiz format: questions not found');
        }
        
        // Convert to the same format as Excel data and wrap in a single section
        const formattedQuestions = quiz.questions.map(q => ({
            question: q.question,
            options: q.options,
            correctAnswers: [q.options[q.correctAnswer]], // Assuming single correct answer for manual
            questionImage: q.questionImage || null,
            optionImages: q.optionImages || [null, null, null, null]
        }));
        
        return {
            sections: [{
                name: 'Questions', // Default section name for manual quizzes
                questions: shuffleArray(formattedQuestions)
            }]
        }; // Return an object with sections property
    }
    throw new Error('Invalid quiz type');
}

// Function to shuffle array using Fisher-Yates algorithm
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function getISTNow() {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function calculateDuration(quizConfig) {
    const [startH, startM] = quizConfig.startTime.split(':').map(Number);
    const [endH, endM] = quizConfig.endTime.split(':').map(Number);
    
    // Get current IST time
    const now = getISTNow();
    // Create Date objects for today with the quiz times in IST
    const quizStartTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        startH,
        startM
    );
    const quizEndTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        endH,
        endM
    );

    // Calculate remaining duration in seconds
    let durationSec = Math.max(0, Math.floor((quizEndTime - now) / 1000));
    
    // If quiz hasn't started yet, show full duration
    if (now < quizStartTime) {
        durationSec = Math.floor((quizEndTime - quizStartTime) / 1000);
    }

    // If duration is 0 or negative (quiz already ended)
    if (durationSec <= 0) {
        throw new Error("This quiz has already ended");
    }

    return durationSec;
}

// Check if quiz has been attempted
async function hasAttemptedQuiz(username, quizName, db, adminDb) {
    try {
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const adminDatabase = client.db(adminDb);
        const attemptsCollection = adminDatabase.collection('attempts');
        
        const attempts = await attemptsCollection.findOne({ studentId: username, quizName });
        await client.close();
        return !!attempts;
    } catch (err) {
        console.error("Error checking quiz attempts:", err);
        return false;
    }
}

router.get('/:quizName', async (req, res) => {
    const quizName = req.params.quizName;
    try {
        // Check if user is logged in as a student
        if (!req.session.username || req.session.role !== 'student') {
            return res.redirect('/login');
        }
        
        const studentUsername = req.session.username;
        
        // Connect to MongoDB
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Check if quiz has been attempted
        const hasAttempted = await hasAttemptedQuiz(
            studentUsername, 
            quizName, 
            db,
            req.session.adminDb
        );
        if (hasAttempted) {
            await client.close();
            return res.redirect('/student/result/' + encodeURIComponent(quizName));
        }

        const quizzesCollection = db.collection('quizzes');
        const quiz = await quizzesCollection.findOne({ name: quizName });

        if (!quiz) {
            await client.close();
            return res.status(404).send('Quiz not found.');
        }

        // Check if quiz has started and calculate duration
        const now = getISTNow();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        
        if (!quiz.startTime || !quiz.endTime) {
            throw new Error("Quiz start or end time is not defined.");
        }

        if (quiz.startTime <= currentTime) {
            try {
                calculateDuration(quiz);
            } catch (err) {
                await client.close();
                return res.status(400).send(err.message);
            }
        } else {
            await client.close();
            return res.status(400).send("This quiz has not started yet.");
        }

        await client.close();
        res.sendFile(path.join(__dirname, "../public/quiz-start.html"));
    } catch (error) {
        console.error('Error loading quiz for student:', error);
        res.status(500).send('Error loading quiz: ' + error.message);
    }
});

// Add new route for the actual quiz page
router.get('/quiz/:quizName', async (req, res) => {
    const quizName = req.params.quizName;
    try {
        if (!req.session.username || req.session.role !== 'student') {
            return res.redirect('/login');
        }
        
        res.sendFile(path.join(__dirname, "../public/quiz.html"));
    } catch (error) {
        console.error('Error loading quiz page:', error);
        res.status(500).send('Error loading quiz page: ' + error.message);
    }
});

// Add new route for quiz results
router.get('/results/:quizName', async (req, res) => {
    const quizName = req.params.quizName;
    try {
        if (!req.session.username || req.session.role !== 'student') {
            return res.redirect('/login');
        }

        // Check if quiz was completed in this session
        if (!req.session.completedQuizzes || !req.session.completedQuizzes[quizName]) {
            return res.redirect('/student');
        }
        
        res.sendFile(path.join(__dirname, "../public/quiz-results.html"));
    } catch (error) {
        console.error('Error loading results page:', error);
        res.status(500).send('Error loading results page: ' + error.message);
    }
});

// New API endpoint to get quiz data for student view
router.get('/api/quiz-data/:quizName', async (req, res) => {
    const quizName = req.params.quizName;
    try {
        if (!req.session.username || req.session.role !== 'student') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const studentUsername = req.session.username;

        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        const quiz = await db.collection('quizzes').findOne({ name: quizName });

        if (!quiz) {
            await client.close();
            return res.status(404).json({ error: 'Quiz not found.' });
        }

        const now = getISTNow();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        
        if (!quiz.startTime || !quiz.endTime) {
            throw new Error("Quiz start or end time is not defined.");
        }

        let durationFormatted = "";
        if (quiz.startTime <= currentTime) {
            try {
                durationFormatted = calculateDuration(quiz);
            } catch (err) {
                await client.close();
                return res.status(400).json({ error: err.message });
            }
        } else {
            await client.close();
            return res.status(400).json({ error: "This quiz has not started yet." });
        }

        const processedQuizData = loadQuizData(quiz); // This now returns { sections: [...] }

        let totalQuestions = 0;
        if (processedQuizData.sections) {
            totalQuestions = processedQuizData.sections.reduce((sum, section) => sum + section.questions.length, 0);
        }

        await client.close();

        res.json({
            quiz: quiz,
            quizData: processedQuizData,
            duration: durationFormatted,
            totalQuestions: totalQuestions
        });

    } catch (error) {
        console.error('Error loading quiz data for API:', error);
        res.status(500).json({ error: 'Error loading quiz data', details: error.message });
    }
});

router.post('/submit-quiz', async (req, res) => {
    if (!req.session.username || req.session.role !== 'student') {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { quizName, answers } = req.body;
    const studentUsername = req.session.username;
    let client;
    try {
        client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        const quizzesCollection = db.collection('quizzes');
        const attemptsCollection = db.collection('attempts');

        const quizConfig = await quizzesCollection.findOne({ name: quizName });

        if (!quizConfig) {
            return res.status(404).json({ success: false, message: 'Quiz not found.' });
        }

        const fullQuizData = loadQuizData(quizConfig);

        let score = 0;
        let totalQuestions = 0;
        const studentAnswers = [];

        const correctAnswersMap = new Map();
        let globalIdxCounter = 0;
        fullQuizData.sections.forEach(section => {
            section.questions.forEach(q => {
                correctAnswersMap.set(globalIdxCounter, q.correctAnswers);
                totalQuestions++;
                globalIdxCounter++;
            });
        });

        answers.forEach(submittedAnswer => {
            const questionGlobalIndex = submittedAnswer.questionIndex;
            const submittedOption = submittedAnswer.answer;
            const correctOptions = correctAnswersMap.get(questionGlobalIndex);

            if (correctOptions && correctOptions.includes(submittedOption)) {
                score++;
            }
            studentAnswers.push({
                questionIndex: questionGlobalIndex,
                submittedAnswer: submittedOption,
                isCorrect: correctOptions && correctOptions.includes(submittedOption)
            });
        });

        const attempt = {
            quizName: quizName,
            studentId: studentUsername,
            score: score,
            totalQuestions: totalQuestions,
            answers: studentAnswers,
            submittedAt: getISTNow()
        };

        await attemptsCollection.insertOne(attempt);

        // Store quiz completion in session
        req.session.completedQuizzes = req.session.completedQuizzes || {};
        req.session.completedQuizzes[quizName] = true;

        // Return success response with redirect URL
        res.json({ 
            success: true, 
            message: 'Quiz submitted successfully',
            redirectUrl: `/student/startquiz/results/${quizName}?score=${score}&total=${totalQuestions}&quizName=${encodeURIComponent(quizName)}`
        });

    } catch (error) {
        console.error('Error during quiz submission:', error);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

module.exports = router;