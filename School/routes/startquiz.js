const express = require('express');
const path = require('path');
const xlsx = require('xlsx');
const fs = require('fs');

const router = express.Router();
const EXCEL_DIR = path.join(__dirname, '../uploads');
const QUIZ_JSON_PATH = path.join(__dirname, '../quizzes.json');
const MANUAL_QUESTIONS_DIR = path.join(__dirname, '../manual-questions');
const ATTEMPTS_DIR = path.join(__dirname, '../attempts');

// Ensure directories exist
if (!fs.existsSync(EXCEL_DIR)) {
    fs.mkdirSync(EXCEL_DIR, { recursive: true });
}
if (!fs.existsSync(MANUAL_QUESTIONS_DIR)) {
    fs.mkdirSync(MANUAL_QUESTIONS_DIR, { recursive: true });
}
// Ensure attempts directory exists
if (!fs.existsSync(ATTEMPTS_DIR)) {
    fs.mkdirSync(ATTEMPTS_DIR);
}

function loadQuizData(quiz) {
    if (quiz.type === 'excel') {
        // Load Excel quiz
        const excelFilePath = path.join(EXCEL_DIR, quiz.file);
        
        // Check if the file exists before attempting to read it
        if (!fs.existsSync(excelFilePath)) {
            throw new Error(`Excel file not found: ${quiz.file}. Please contact the administrator.`);
        }
        
        try {
            const workbook = xlsx.readFile(excelFilePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            return shuffleArray(xlsx.utils.sheet_to_json(sheet, { header: 1 }).slice(1));
        } catch (err) {
            throw new Error(`Error reading Excel file: ${err.message}`);
        }
    } else if (quiz.type === 'manual') {
        // Load manual quiz
        const questionsFilePath = path.join(MANUAL_QUESTIONS_DIR, quiz.questionsFile);
        
        // Check if the file exists before attempting to read it
        if (!fs.existsSync(questionsFilePath)) {
            throw new Error(`Questions file not found: ${quiz.questionsFile}. Please contact the administrator.`);
        }
        
        try {
            const questionsData = JSON.parse(
                fs.readFileSync(questionsFilePath, 'utf8')
            );
            
            // Convert to the same format as Excel data
            // Format: [question, option1, option2, option3, option4, correctAnswer, questionImage, 
            //          option1Image, option2Image, option3Image, option4Image]
            const formattedQuestions = questionsData.map(q => [
                q.text,
                ...q.options,
                q.options[q.correctAnswer],
                q.image || null,
                ...(q.optionImages || [null, null, null, null]) // Add option images or default to nulls
            ]);
            
            return shuffleArray(formattedQuestions);
        } catch (err) {
            throw new Error(`Error reading questions file: ${err.message}`);
        }
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
function hasAttemptedQuiz(username, quizName) {
    const attemptsFile = path.join(ATTEMPTS_DIR, `${username}.json`);
    
    if (!fs.existsSync(attemptsFile)) {
        return false;
    }
    
    try {
        const attempts = JSON.parse(fs.readFileSync(attemptsFile, 'utf8'));
        return attempts.some(attempt => attempt.quizName === quizName);
    } catch (err) {
        console.error("Error checking quiz attempts:", err);
        return false;
    }
}

router.get('/:quizName', (req, res) => {
    const quizName = req.params.quizName;
    
    try {
        // Check if quizzes.json exists
        if (!fs.existsSync(QUIZ_JSON_PATH)) {
            return res.status(500).send(`
                <h1>System Error</h1>
                <p>Quiz configuration file not found. Please contact the administrator.</p>
                <a href="/student">Back to Dashboard</a>
            `);
        }
        
        const quizzes = JSON.parse(fs.readFileSync(QUIZ_JSON_PATH));
        
        // Check if user is logged in as a student
        if (!req.session.username || req.session.role !== 'student') {
            return res.redirect('/login');
        }
        
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
        
        // Find quiz configuration - either normal class quiz or student-specific quiz
        const quizConfig = quizzes.find(q => {
            // If it's a normal class quiz for student's class
            if (q.name === quizName && q.class === req.session.class) {
                return true;
            }
            
            // If it's a student-specific quiz (class 999) and student is in retake list
            if (q.name === quizName && (q.isStudentSpecific || q.class === '999') && isRetakeEligible) {
                return true;
            }
            
            return false;
        });

        // Check if quiz exists
        if (!quizConfig) {
            return res.status(404).send(`
                <h1>Quiz Not Found</h1>
                <p>The quiz "${quizName}" does not exist.</p>
                <a href="/student">Back to Dashboard</a>
            `);
        }

        // Check if the quiz has already been attempted
        const attemptsFile = path.join(ATTEMPTS_DIR, `${studentUsername}.json`);
        let hasAttempted = false;

        if (fs.existsSync(attemptsFile)) {
            try {
                const attempts = JSON.parse(fs.readFileSync(attemptsFile, 'utf8'));
                hasAttempted = attempts.some(attempt => attempt.quizName === quizName);
            } catch (err) {
                console.error("Error reading attempts file:", err);
            }
        }

        // If student has attempted and is not eligible for retake, redirect to results
        if (hasAttempted && !isRetakeEligible) {
            return res.redirect(`/student/result/${encodeURIComponent(quizName)}`);
        }

        try {
            const durationSec = calculateDuration(quizConfig);
            const quizData = loadQuizData(quizConfig);

            // Update the quiz display template to handle images
            res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${quizName}</title>
                <style>
                    body { font-family: Arial; margin: 0; background: #f0f0f0; display: flex; }
                    .navbar {
                        background: #007bff;
                        color: white;
                        padding: 15px 20px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        width: 100%;
                        position: fixed;
                        top: 0;
                        z-index: 2000;
                    }
                    .navbar > div {
                        display: flex;
                        align-items: center;
                        gap: 20px;
                    }
                    .card {
                        background: white;
                        padding: 24px 24px 16px 24px;
                        max-width: 900px;
                        margin: 80px auto 30px 20px;
                        border-radius: 10px;
                        box-shadow: 0 0 10px rgba(0,0,0,0.08);
                        flex: 1;
                        min-width: 320px;
                    }
                    .sidebar {
                        width: 200px;
                        padding: 10px;
                        background: #fff;
                        box-shadow: -2px 0 5px rgba(0,0,0,0.1);
                        overflow-y: auto;
                        height: calc(100vh - 90px);
                        position: fixed;
                        right: 0;
                        top: 60px;
                        transition: transform 0.3s ease;
                        z-index: 100;
                        transform: translateX(100%); /* Start collapsed */
                    }
                    .sidebar.expanded {
                        transform: translateX(0);
                    }
                    .sidebar-toggle {
                        position: fixed;
                        right: 0;
                        top: 50%;
                        transform: translateY(-50%);
                        background: #007bff;
                        color: white;
                        border: none;
                        padding: 10px;
                        cursor: pointer;
                        border-radius: 4px 0 0 4px;
                        z-index: 101;
                        transition: all 0.3s ease;
                    }
                    .sidebar-toggle.expanded {
                        right: 200px;
                    }
                    .sidebar-toggle i {
                        transition: transform 0.3s ease;
                        display: inline-block;
                        font-style: normal;
                    }
                    .sidebar-toggle.expanded i {
                        transform: rotate(180deg);
                    }
                    @media (min-width: 769px) {
                        .sidebar {
                            width: 200px;
                        }
                        .card {
                            margin-right: 0; /* Start with no margin */
                            transition: margin-right 0.3s ease;
                        }
                        .card.expanded {
                            margin-right: 200px;
                        }
                        .sidebar-toggle {
                            right: 0;
                            padding: 12px;
                        }
                        .sidebar-toggle.expanded {
                            right: 200px;
                        }
                        .sidebar-toggle i {
                            font-size: 18px;
                        }
                    }
                    @media (max-width: 768px) {
                        .sidebar {
                            width: 150px;
                        }
                        .card {
                            margin-right: 0; /* Start with no margin */
                            transition: margin-right 0.3s ease;
                        }
                        .card.expanded {
                            margin-right: 150px;
                        }
                        .sidebar-toggle {
                            right: 0;
                            padding: 8px;
                        }
                        .sidebar-toggle.expanded {
                            right: 150px;
                        }
                        .sidebar-toggle i {
                            font-size: 14px;
                        }
                    }
                    .sidebar h3 {
                        text-align: center;
                        margin-bottom: 10px;
                        position: sticky;
                        top: 0;
                        background: white;
                        padding: 10px 0;
                        margin-top: 0;
                        z-index: 1;
                    }
                    .sidebar button {
                        width: 100%;
                        margin-bottom: 8px;
                        padding: 8px;
                        cursor: pointer;
                        border: none;
                        border-radius: 4px;
                        text-align: center;
                        transition: all 0.2s;
                    }
                    .sidebar button.answered {
                        background-color: #4CAF50;
                        color: white;
                    }
                    .sidebar button.skipped {
                        background-color: #f44336;
                        color: white;
                    }
                    .sidebar button.current {
                        border: 2px solid #007bff;
                        font-weight: bold;
                    }
                    h2 { margin-bottom: 20px; }
                    ul { list-style: none; padding: 0; }
                    li { margin-bottom: 10px; }
                    label { cursor: pointer; }
                    button {
                        padding: 10px 20px;
                        margin-top: 15px;
                        background: rgb(0, 153, 255);
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                    }
                    button:hover {
                        background: #0056b3;
                    }
                    .button-container {
                        display: flex;
                        gap: 10px;
                    }
                    #scoreSection {
                        margin-top: 20px;
                        font-weight: bold;
                        font-size: 18px;
                    }
                    #timer {
                        font-weight: bold;
                        transition: color 0.5s ease;
                        margin-right: 30px;
                    }
                    .normal { color: white; }
                    .warning { color: orange; }
                    .danger { color: red; }
                    #questionList {
                        max-height: calc(100vh - 150px);
                        overflow-y: auto;
                    }
                    #answerReview {
                        display: none;
                        margin-top: 30px;
                        max-height: 50vh;
                        overflow-y: auto;
                        border-top: 1px solid #ddd;
                        padding-top: 20px;
                    }
                    .review-question {
                        margin-bottom: 20px;
                        padding: 15px;
                        background: #f9f9f9;
                        border-radius: 5px;
                    }
                    .review-question h3 {
                        margin-top: 0;
                    }
                    .review-option {
                        padding: 8px;
                        margin: 5px 0;
                        border-radius: 4px;
                    }
                    .wrong-answer {
                        background-color: #ffdddd;
                        border-left: 4px solid #f44336;
                    }
                    .correct-answer {
                        background-color: #ddffdd;
                        border-left: 4px solid #4CAF50;
                    }
                    .back-button {
                        background-color: rgb(0, 153, 255);
                        margin-top: 20px;
                    }
                    .back-button:hover {
                        background-color: #6c757d;
                    }
                    .fullscreen-warning {
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: white;
                        padding: 30px;
                        border-radius: 10px;
                        box-shadow: 0 0 20px rgba(0,0,0,0.3);
                        z-index: 2000;
                        text-align: center;
                        max-width: 80%;
                    }
                    .fullscreen-warning h3 {
                        margin-top: 0;
                        color: #dc3545;
                    }
                    .fullscreen-warning button {
                        margin-top: 20px;
                        padding: 10px 20px;
                        background: #007bff;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                    }
                    .fullscreen-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,0.7);
                        z-index: 1000;
                        display: none;
                    }
                    #startFullscreenBtn {
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        padding: 15px 30px;
                        font-size: 18px;
                        z-index: 1000;
                    }
                    .question-image {
                        max-width: 100%;
                        max-height: 300px;
                        margin: 15px 0;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .option-image {
                        max-width: 150px;
                        max-height: 150px;
                        margin: 10px 0;
                        border-radius: 6px;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                        display: block;
                    }
                    /* Add a new class for hiding images after submission */
                    .quiz-completed #questionImage {
                        display: none !important;
                        visibility: hidden !important;
                        opacity: 0 !important;
                        height: 0 !important;
                        width: 0 !important;
                        overflow: hidden !important;
                        position: absolute !important;
                        pointer-events: none !important;
                    }
                    .quiz-completed .option-image {
                        display: none !important;
                        visibility: hidden !important;
                        opacity: 0 !important;
                        height: 0 !important;
                        width: 0 !important;
                        overflow: hidden !important;
                        position: absolute !important;
                        pointer-events: none !important;
                    }
                    /* Style for inspect element warning */
                    .devtools-warning {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(220, 53, 69, 0.9);
                        color: white;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        z-index: 9999;
                        font-size: 24px;
                        text-align: center;
                        padding: 20px;
                    }
                    .devtools-warning h2 {
                        margin-bottom: 20px;
                        color: white;
                    }
                    .continue-btn {
                        background: white;
                        color: #dc3545;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        font-weight: bold;
                        margin-top: 20px;
                        cursor: pointer;
                    }
                    .continue-btn:hover {
                        background: #f8f9fa;
                    }
                    .question-panel {
                        position: fixed;
                        right: 0;
                        top: 60px;
                        width: 320px;
                        max-width: 95vw;
                        background: #fff;
                        box-shadow: -2px 0 8px rgba(0,0,0,0.08);
                        border-radius: 0 0 0 12px;
                        z-index: 100;
                        transform: translateX(100%);
                        transition: transform 0.3s cubic-bezier(.4,2,.6,1);
                        padding: 0 0 20px 0;
                        display: flex;
                        flex-direction: column;
                        min-height: 350px;
                    }
                    .question-panel.open {
                        transform: translateX(0);
                    }
                    .sidebar-toggle {
                        position: fixed;
                        right: 0;
                        top: 50%;
                        transform: translateY(-50%);
                        background: #007bff;
                        color: white;
                        border: none;
                        padding: 10px 12px;
                        cursor: pointer;
                        border-radius: 4px 0 0 4px;
                        z-index: 101;
                        transition: right 0.3s;
                    }
                    .sidebar-toggle.open {
                        right: 320px;
                    }
                    #sidebarArrow {
                        font-size: 20px;
                        transition: transform 0.3s;
                    }
                    .sidebar-toggle.open #sidebarArrow {
                        transform: rotate(180deg);
                    }
                    .panel-summary {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: space-between;
                        background: #f8f9fa;
                        border-bottom: 1px solid #e0e0e0;
                        padding: 12px 18px 8px 18px;
                        border-radius: 0 0 0 0;
                        gap: 8px;
                    }
                    .summary-item {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        font-size: 13px;
                        min-width: 54px;
                        margin-bottom: 4px;
                    }
                    .summary-item span {
                        font-size: 18px;
                        font-weight: bold;
                        margin-bottom: 2px;
                    }
                    .summary-item.not-answered span { color: #f44336; }
                    .summary-item.answered span { color: #4CAF50; }
                    .summary-item.marked span { color: #673ab7; }
                    .summary-item.not-visited span { color: #333; }
                    .summary-item.answered-marked span { color: #2196f3; }
                    .panel-title {
                        text-align: center;
                        font-size: 20px;
                        font-weight: 600;
                        margin: 10px 0 8px 0;
                        color: #222;
                    }
                    .question-grid {
                        display: grid;
                        grid-template-columns: repeat(5, 1fr);
                        gap: 12px;
                        padding: 0 18px;
                        margin-top: 8px;
                    }
                    .question-btn {
                        width: 38px;
                        height: 38px;
                        border-radius: 50%;
                        border: none;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: box-shadow 0.2s, background 0.2s;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
                        outline: none;
                        position: relative;
                    }
                    .question-btn.answered { background: #4CAF50; color: #fff; }
                    .question-btn.not-answered { background: #f44336; color: #fff; }
                    .question-btn.marked { background: #673ab7; color: #fff; }
                    .question-btn.not-visited { background: #fff; color: #333; border: 1.5px solid #bbb; }
                    .question-btn.answered-marked { background: #2196f3; color: #fff; }
                    .question-btn.current { box-shadow: 0 0 0 3px #007bff44; border: 2px solid #007bff; }
                    .question-btn:active { filter: brightness(0.95); }
                    @media (max-width: 768px) {
                        .question-panel {
                            width: 95vw;
                            min-width: 0;
                            max-width: 99vw;
                        }
                        .sidebar-toggle.open {
                            right: 95vw;
                        }
                        .question-grid {
                            grid-template-columns: repeat(4, 1fr);
                        }
                    }
                    .question-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: 18px;
                        gap: 10px;
                    }
                    .question-number {
                        font-size: 1.25rem;
                        font-weight: 700;
                        color: #222;
                    }
                    .marking-scheme {
                        font-size: 1.1rem;
                        color: #444;
                        background: #f8f8f8;
                        border-radius: 6px;
                        padding: 4px 10px;
                        font-weight: 500;
                    }
                    .marking-scheme .plus { color: #4CAF50; font-weight: bold; }
                    .marking-scheme .minus { color: #f44336; font-weight: bold; }
                    .timer {
                        font-size: 1.1rem;
                        color: #007bff;
                        font-weight: 600;
                        margin-left: 10px;
                    }
                    .mark-btn {
                        background: #e3e3fa;
                        color: #673ab7;
                        border: 1.5px solid #bdb4e6;
                        border-radius: 6px;
                        padding: 7px 18px;
                        font-size: 1rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: background 0.2s, color 0.2s;
                    }
                    .mark-btn.marked, .mark-btn:active {
                        background: #673ab7;
                        color: #fff;
                        border-color: #673ab7;
                    }
                    .question-card {
                        background: #fafbfc;
                        border-radius: 8px;
                        padding: 24px 18px 18px 18px;
                        margin-bottom: 18px;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.04);
                    }
                    .question-text {
                        font-size: 1.18rem;
                        font-weight: 600;
                        margin-bottom: 22px;
                        color: #222;
                    }
                    .options-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }
                    .options-list li {
                        margin-bottom: 18px;
                    }
                    .options-list label {
                        display: flex;
                        align-items: center;
                        font-size: 1.08rem;
                        background: #fff;
                        border: 1.5px solid #e0e0e0;
                        border-radius: 7px;
                        padding: 12px 18px;
                        cursor: pointer;
                        transition: border 0.2s, box-shadow 0.2s;
                        min-height: 44px;
                        font-weight: 500;
                    }
                    .options-list input[type="radio"] {
                        accent-color: #007bff;
                        margin-right: 16px;
                        width: 20px;
                        height: 20px;
                    }
                    .options-list label:hover, .options-list input[type="radio"]:focus + label {
                        border-color: #007bff;
                        box-shadow: 0 0 0 2px #007bff22;
                    }
                    .button-container {
                        display: flex;
                        gap: 12px;
                        justify-content: flex-end;
                        margin-top: 10px;
                    }
                    .nav-btn {
                        padding: 10px 24px;
                        background: #fff;
                        color: #007bff;
                        border: 1.5px solid #007bff;
                        border-radius: 6px;
                        font-size: 1.08rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: background 0.2s, color 0.2s;
                    }
                    .nav-btn:disabled, .nav-btn[disabled] {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                    .nav-btn:hover:not(:disabled) {
                        background: #007bff;
                        color: #fff;
                    }
                    .submit-btn {
                        background: #007bff;
                        color: #fff;
                        border: none;
                        margin-left: 10px;
                    }
                    .submit-btn:hover {
                        background: #0056b3;
                    }
                    @media (max-width: 768px) {
                        .card {
                            padding: 10px 2vw 10px 2vw;
                            margin: 70px 0 20px 0;
                            min-width: 0;
                        }
                        .question-header {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 8px;
                        }
                        .button-container {
                            flex-direction: column;
                            gap: 8px;
                            align-items: stretch;
                        }
                    }
                    .question-panel-overlay {
                        position: fixed;
                        top: 60px; /* Changed from 0 to 60px to account for navbar height */
                        right: 0;
                        width: auto;
                        height: calc(100vh - 60px); /* Adjusted height to account for navbar */
                        background: none;
                        z-index: 1500;
                        display: none;
                        align-items: flex-start;
                        justify-content: flex-end;
                        pointer-events: none;
                    }
                    .question-panel-overlay.open {
                        display: flex;
                    }
                    .question-panel-card {
                        background: #fff;
                        border-radius: 18px 0 0 18px;
                        box-shadow: -4px 0 24px rgba(0,0,0,0.13);
                        width: 410px;
                        max-width: 98vw;
                        min-height: 90vh;
                        margin: 0 0 0 auto;
                        display: flex;
                        flex-direction: column;
                        padding: 24px 18px 18px 18px;
                        gap: 18px;
                        position: relative;
                        pointer-events: auto;
                    }
                    .panel-summary-card {
                        background: #f8f9fa;
                        border-radius: 12px;
                        padding: 18px 12px 10px 12px;
                        margin-bottom: 10px;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.04);
                    }
                    .summary-row {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 8px;
                    }
                    .summary-shape {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.1rem;
                        font-weight: 700;
                        width: 38px;
                        height: 38px;
                        margin-right: 6px;
                    }
                    .summary-shape.answered {
                        background: #4CAF50;
                        color: #fff;
                        clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
                    }
                    .summary-shape.not-answered {
                        background: #f44336;
                        color: #fff;
                        clip-path: polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%);
                    }
                    .summary-shape.marked {
                        background: #673ab7;
                        color: #fff;
                        border-radius: 50%;
                    }
                    .summary-shape.not-visited {
                        background: #fff;
                        color: #222;
                        border: 2px solid #bbb;
                        border-radius: 7px;
                    }
                    .summary-shape.answered-marked {
                        background: #2196f3;
                        color: #fff;
                        border-radius: 50%;
                        border: 2px solid #2196f3;
                        position: relative;
                    }
                    .summary-label {
                        font-size: 1rem;
                        color: #333;
                        margin-right: 18px;
                        min-width: 120px;
                    }
                    .panel-section-card {
                        background: #fff;
                        border-radius: 12px;
                        padding: 18px 10px 18px 10px;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.04);
                    }
                    .panel-title {
                        text-align: center;
                        font-size: 1.18rem;
                        font-weight: 600;
                        margin-bottom: 18px;
                        color: #222;
                    }
                    .question-grid {
                        display: grid;
                        grid-template-columns: repeat(5, 1fr);
                        gap: 14px;
                        padding: 0 8px;
                    }
                    .question-btn {
                        width: 38px;
                        height: 38px;
                        font-size: 1.1rem;
                        font-weight: 600;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border: none;
                        outline: none;
                        background: #fff;
                        color: #222;
                        border-radius: 7px;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
                        transition: box-shadow 0.2s, background 0.2s;
                        position: relative;
                    }
                    .question-btn.answered {
                        background: #4CAF50;
                        color: #fff;
                        clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
                    }
                    .question-btn.not-answered {
                        background: #f44336;
                        color: #fff;
                        clip-path: polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%);
                    }
                    .question-btn.marked {
                        background: #673ab7;
                        color: #fff;
                        border-radius: 50%;
                        clip-path: none;
                    }
                    .question-btn.not-visited {
                        background: #fff;
                        color: #222;
                        border: 2px solid #bbb;
                        border-radius: 7px;
                        clip-path: none;
                    }
                    .question-btn.answered-marked {
                        background: #2196f3;
                        color: #fff;
                        border-radius: 50%;
                        border: 2px solid #2196f3;
                        clip-path: none;
                    }
                    .question-btn.current {
                        box-shadow: 0 0 0 3px #007bff44;
                        border: 2px solid #007bff;
                    }
                    .close-panel-btn {
                        position: absolute;
                        top: 18px;
                        right: 24px;
                        background: #fff;
                        color: #333;
                        border: none;
                        font-size: 2rem;
                        border-radius: 50%;
                        width: 38px;
                        height: 38px;
                        cursor: pointer;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.08);
                        z-index: 10;
                        transition: background 0.2s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .close-panel-btn:hover {
                        background: #f44336;
                        color: #fff;
                    }
                    .open-panel-btn {
                        position: fixed;
                        right: 0;
                        top: 50%;
                        transform: translateY(-50%);
                        background: #fff;
                        color: #007bff;
                        border: 2px solid #bbb;
                        border-radius: 8px 0 0 8px;
                        padding: 0;
                        z-index: 1001;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.08);
                        width: 44px;
                        height: 44px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .panel-arrow-btn {
                        position: fixed;
                        right: 0;
                        top: 50%;
                        transform: translateY(-50%);
                        background: #fff;
                        border: 2px solid #bbb;
                        border-radius: 8px 0 0 8px;
                        width: 44px;
                        height: 44px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        margin-right: 0;
                        transition: background 0.2s, border 0.2s;
                        z-index: 2001;
                    }
                    .panel-arrow-btn:hover {
                        background: #f0f0f0;
                        border-color: #007bff;
                    }
                    .panel-arrow-btn.open {
                        right: 320px;
                    }
                    @media (max-width: 768px) {
                        .panel-arrow-btn {
                            position: fixed;
                            right: 0;
                            top: 50%;
                            transform: translateY(-50%);
                            width: 38px;
                            height: 38px;
                            z-index: 2001;
                        }
                        .panel-arrow-btn.open {
                            right: 95vw;
                        }
                        .question-panel-card {
                            width: 95vw;
                            max-width: 95vw;
                        }
                    }
                </style>
            </head>
            <body>
                <div id="devtools-warning" class="devtools-warning" style="display:none;">
                    <h2>Developer Tools Detected!</h2>
                    <p>Use of developer tools is not allowed during the quiz.</p>
                    <p>Please close developer tools to continue.</p>
                    <button class="continue-btn" onclick="checkAndContinue()">Continue Quiz</button>
                </div>
                
                <div class="fullscreen-overlay" id="fullscreenOverlay"></div>
                <div class="fullscreen-warning" id="fullscreenWarning" style="display:none;">
                    <h3>Warning!</h3>
                    <p id="warningMessage">You have left fullscreen mode. Please return to the quiz.</p>
                    <p id="attemptsLeft"></p>
                    <button onclick="hideWarning()">OK</button>
                </div>

                <button id="startFullscreenBtn" onclick="startQuiz()">Start Quiz in Fullscreen</button>

                <div id="quizContainer" style="display:none;">
                    <div class="navbar">
                        <div><strong>${quizName}</strong></div>
                        <div>Time Left: <span id="timer" class="normal"></span></div>
                    </div>

                    <button class="sidebar-toggle" id="sidebarToggleBtn">
                        <span style="display: flex; align-items: center; justify-content: center;">
                            <svg id="arrowSvgClosed" width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="2" y="2" width="24" height="24" rx="6" fill="#fff" stroke="#bbb" stroke-width="2"/>
                                <path d="M16.5 8L11.5 14L16.5 20" stroke="#888" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                    </button>

                    <div class="question-panel-overlay" id="questionPanelOverlay">
                        <div class="question-panel-card">
                            <div class="panel-header">
                                <button class="panel-arrow-btn" id="panelArrowBtn" aria-label="Close Panel">
                                    <span style="display: flex; align-items: center; justify-content: center;">
                                        <svg id="arrowSvg" width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <rect x="2" y="2" width="24" height="24" rx="6" fill="#fff" stroke="#bbb" stroke-width="2"/>
                                            <path d="M16.5 8L11.5 14L16.5 20" stroke="#888" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </span>
                                </button>
                                <button class="close-panel-btn" id="closePanelBtn" aria-label="Close Panel">&times;</button>
                            </div>
                            <div class="panel-summary-card">
                                <div class="summary-row">
                                    <div class="summary-shape not-answered"><span id="countNotAnswered">0</span></div>
                                    <div class="summary-label">Not Answered</div>
                                    <div class="summary-shape answered"><span id="countAnswered">0</span></div>
                                    <div class="summary-label">Answered</div>
                                </div>
                                <div class="summary-row">
                                    <div class="summary-shape marked"><span id="countMarked">0</span></div>
                                    <div class="summary-label">Marked for Review</div>
                                    <div class="summary-shape not-visited"><span id="countNotVisited">0</span></div>
                                    <div class="summary-label">Not Visited</div>
                                </div>
                                <div class="summary-row">
                                    <div class="summary-shape answered-marked"><span id="countAnsweredMarked">0</span></div>
                                    <div class="summary-label">Answered and Marked for Review</div>
                                </div>
                            </div>
                            <div class="panel-section-card">
                                <div class="panel-title">Computer Awareness</div>
                                <div class="question-grid" id="questionGrid"></div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div id="quiz-content">
                            <div class="question-header">
                                <span class="question-number" id="questionNumber"></span>
                                <span class="marking-scheme">Marking Scheme : <span class="plus">+1</span> <span class="minus">0</span></span>
                                <span class="timer"><span id="timer" class="normal"></span></span>
                                <button type="button" class="mark-btn" id="markBtn" onclick="toggleMarkForReview()"><span id="markBtnText">Mark</span></button>
                            </div>
                            <div class="question-card">
                                <div class="question-text" id="question"></div>
                                <form id="quizForm">
                                    <ul id="options" class="options-list"></ul>
                                </form>
                            </div>
                            <div class="button-container">
                                <button type="button" onclick="prevQuestion()" id="prevBtn" class="nav-btn">&lt; Previous</button>
                                <button type="button" onclick="clearResponse()" id="clearBtn" class="nav-btn">Clear Response</button>
                                <button type="button" onclick="nextQuestion()" id="nextBtn" class="nav-btn">Save & Next &gt;</button>
                                <button type="button" onclick="submitQuiz()" id="submitBtn" class="nav-btn submit-btn">Submit Test</button>
                            </div>
                        </div>
                        
                        <div id="quiz-results" style="display:none;">
                            <h2>Quiz Completed!</h2>
                            <div id="scoreSection"></div>
                            <div id="answerReview"></div>
                            <button id="backBtn" class="back-button" onclick="returnToDashboard()">Back to Dashboard</button>
                        </div>
                    </div>
                </div>

                <script>
                    const quiz = ${JSON.stringify(quizData)};
                    const quizName = "${quizName}";
                    let index = 0;
                    let score = 0;
                    let timerInterval;
                    let timeLeft = ${durationSec};
                    const answeredQuestions = new Array(quiz.length).fill(false);
                    let viewedQuestions = new Array(quiz.length).fill(false);
                    let userAnswers = new Array(quiz.length).fill(null);
                    let fullscreenAttempts = 0;
                    const MAX_FULLSCREEN_ATTEMPTS = 2;
                    let isFullscreen = false;
                    let quizSubmitted = false;
                    
                    // Check if we already have an attempt in sessionStorage to handle page refreshes
                    const attemptKey = 'quiz_attempt_' + quizName.replace(/\s+/g, '_');
                    
                    if (sessionStorage.getItem(attemptKey) === 'completed') {
                        // This quiz was already completed in this session, redirect to results
                        window.location.href = '/student/result/' + encodeURIComponent(quizName);
                    }

                    // Developer tools detection variables
                    let devToolsOpen = false;
                    let devToolsCheckInterval;

                    // Show start button initially
                    document.getElementById('startFullscreenBtn').style.display = 'block';
                    document.getElementById('quizContainer').style.display = 'none';

                    function formatTime(sec) {
                        const hrs = String(Math.floor(sec / 3600)).padStart(2, '0');
                        const mins = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
                        const secs = String(sec % 60).padStart(2, '0');
                        return \`\${hrs}:\${mins}:\${secs}\`;
                    }

                    function startQuiz() {
                        // Hide start button and show quiz
                        document.getElementById('startFullscreenBtn').style.display = 'none';
                        document.getElementById('quizContainer').style.display = 'block';
                        
                        index = 0;
                        score = 0;
                        fullscreenAttempts = 0;
                        startTimer();
                        generateSidebar();
                        showQuestion();
                        
                        // Enter fullscreen mode
                        enterFullscreen();
                        
                        // Set up event listeners
                        setupEventListeners();
                        
                        // Ensure sidebar starts collapsed
                        const sidebar = document.querySelector('.sidebar');
                        const toggle = document.querySelector('.sidebar-toggle');
                        const card = document.querySelector('.card');
                        sidebar.classList.remove('expanded');
                        toggle.classList.remove('expanded');
                        card.classList.remove('expanded');
                    }

                    function enterFullscreen() {
                        const elem = document.documentElement;
                        if (elem.requestFullscreen) {
                            elem.requestFullscreen().catch(err => {
                                console.error('Error attempting to enable fullscreen:', err);
                            });
                        } else if (elem.webkitRequestFullscreen) {
                            elem.webkitRequestFullscreen();
                        } else if (elem.mozRequestFullScreen) {
                            elem.mozRequestFullScreen();
                        } else if (elem.msRequestFullscreen) {
                            elem.msRequestFullscreen();
                        }
                        isFullscreen = true;
                    }

                    function exitFullscreen() {
                        if (document.exitFullscreen) {
                            document.exitFullscreen();
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                        } else if (document.mozCancelFullScreen) {
                            document.mozCancelFullScreen();
                        } else if (document.msExitFullscreen) {
                            document.msExitFullscreen();
                        }
                        isFullscreen = false;
                    }

                    function setupEventListeners() {
                        document.addEventListener('fullscreenchange', handleFullscreenChange);
                        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
                        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
                        document.addEventListener('MSFullscreenChange', handleFullscreenChange);
                        document.addEventListener('visibilitychange', handleVisibilityChange);
                        
                        // Add beforeunload event to prevent refreshing during quiz
                        window.addEventListener('beforeunload', function(e) {
                            if (quizSubmitted) {
                                return undefined; // Allow leaving if quiz is submitted
                            }
                            
                            // Standard way to show confirmation dialog
                            const confirmationMessage = 'If you leave or refresh the page, your quiz will be submitted automatically. Are you sure?';
                            e.returnValue = confirmationMessage;
                            return confirmationMessage;
                        });

                        // Setup dev tools detection
                        setupDevToolsDetection();
                    }

                    function removeEventListeners() {
                        document.removeEventListener('fullscreenchange', handleFullscreenChange);
                        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
                        document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
                        document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
                        document.removeEventListener('visibilitychange', handleVisibilityChange);
                        window.removeEventListener('beforeunload', function() {
                            // Empty function as we just want to remove the listener
                        });
                        
                        // Remove dev tools detection
                        removeDevToolsDetection();
                    }

                    function handleFullscreenChange() {
                        isFullscreen = !!(document.fullscreenElement || 
                                         document.webkitFullscreenElement || 
                                         document.mozFullScreenElement || 
                                         document.msFullscreenElement);
                        
                        if (!isFullscreen && document.getElementById('backBtn').style.display !== 'block') {
                            showWarning();
                        }
                    }

                    function handleVisibilityChange() {
                        if (document.hidden && isFullscreen) {
                            showWarning();
                        }
                    }

                    function showWarning() {
                        fullscreenAttempts++;
                        const warningEl = document.getElementById('fullscreenWarning');
                        const overlayEl = document.getElementById('fullscreenOverlay');
                        const messageEl = document.getElementById('warningMessage');
                        const attemptsEl = document.getElementById('attemptsLeft');
                        
                        if (fullscreenAttempts > MAX_FULLSCREEN_ATTEMPTS) {
                            submitQuiz();
                            return;
                        }
                        
                        messageEl.textContent = \`You have left fullscreen mode. \${fullscreenAttempts === 1 ? 'First' : 'Second'} warning!\`;
                        attemptsEl.textContent = \`Attempts left: \${MAX_FULLSCREEN_ATTEMPTS - fullscreenAttempts + 1}\`;
                        
                        warningEl.style.display = 'block';
                        overlayEl.style.display = 'block';
                        
                        enterFullscreen();
                    }

                    function hideWarning() {
                        document.getElementById('fullscreenWarning').style.display = 'none';
                        document.getElementById('fullscreenOverlay').style.display = 'none';
                        enterFullscreen();
                    }

                    function startTimer() {
                        // Clear any existing timer interval
                        if (timerInterval) {
                            clearInterval(timerInterval);
                        }
                        
                        const timerEl = document.getElementById('timer');
                        updateTimerColor();
                        timerEl.textContent = formatTime(timeLeft);

                        timerInterval = setInterval(() => {
                            timeLeft--;
                            timerEl.textContent = formatTime(timeLeft);
                            updateTimerColor();
                            if (timeLeft <= 0) {
                                clearInterval(timerInterval);
                                submitQuiz(true);
                            }
                        }, 1000);
                    }

                    function updateTimerColor() {
                        const timerEl = document.getElementById('timer');
                        timerEl.classList.remove("normal", "warning", "danger");
                        if (timeLeft <= 300) {
                            timerEl.classList.add("danger");
                        } else if (timeLeft <= 600) {
                            timerEl.classList.add("warning");
                        } else {
                            timerEl.classList.add("normal");
                        }
                    }

                    function showQuestion(qIndex = index) {
                        if (quizSubmitted) return;
                        index = qIndex;
                        // Update question number
                        document.getElementById('questionNumber').innerText = 'Question-' + (index + 1);
                        viewedQuestions[index] = viewedQuestions[index] || true;
                        const row = quiz[index];
                        document.getElementById('question').innerText = row[0];
                        // Handle options
                        const options = row.slice(1, 5);
                        const list = options.map((opt, optIndex) => {
                            return '<li><label><input type="radio" name="option" value="' + opt + '" ' + (userAnswers[index] === opt ? 'checked' : '') + '> ' + opt + '</label></li>';
                        }).join("");
                        document.getElementById('options').innerHTML = list;
                        // Mark button state
                        const markBtn = document.getElementById('markBtn');
                        if (viewedQuestions[index] === 'marked') {
                            markBtn.classList.add('marked');
                            document.getElementById('markBtnText').innerText = 'Marked';
                        } else {
                            markBtn.classList.remove('marked');
                            document.getElementById('markBtnText').innerText = 'Mark';
                        }
                        // Navigation buttons
                        document.getElementById('prevBtn').style.display = (index > 0) ? 'inline-block' : 'none';
                        document.getElementById('nextBtn').style.display = (index < quiz.length - 1) ? 'inline-block' : 'none';
                        document.getElementById('submitBtn').style.display = (index === quiz.length - 1) ? 'inline-block' : 'none';
                        updateSidebar();
                    }

                    function toggleMarkForReview() {
                        if (viewedQuestions[index] === 'marked') {
                            viewedQuestions[index] = true;
                        } else {
                            viewedQuestions[index] = 'marked';
                        }
                        showQuestion(index);
                        updateSidebar();
                    }

                    function prevQuestion() {
                        checkAnswer();
                        if (index > 0) {
                            index--;
                            showQuestion();
                        }
                    }

                    function nextQuestion() {
                        checkAnswer();
                        if (index < quiz.length - 1) {
                            index++;
                            showQuestion();
                        }
                    }

                    function submitQuiz(auto = false) {
                        quizSubmitted = true;
                        
                        // Check the answer for the current question (which might be the last one)
                        checkAnswer();
                        
                        exitFullscreen();
                        removeEventListeners();
                        
                        // First, replace the showQuestion function entirely
                        window.showQuestion = function() {
                            return; // Do absolutely nothing
                        };
                        
                        // Add quiz-completed class to body to hide the image using CSS
                        document.body.classList.add('quiz-completed');
                        
                        // Hide the question panel and arrow button
                        const panelOverlay = document.getElementById('questionPanelOverlay');
                        const panelArrowBtn = document.getElementById('panelArrowBtn');
                        const sidebarBtn = document.getElementById('sidebarToggleBtn');
                        
                        if (panelOverlay) {
                            panelOverlay.style.display = 'none';
                        }
                        if (panelArrowBtn) {
                            panelArrowBtn.style.display = 'none';
                        }
                        if (sidebarBtn) {
                            sidebarBtn.style.display = 'none';
                        }
                        
                        clearInterval(timerInterval);
                        
                        // Disable all navigation buttons and remove their event handlers
                        const allButtons = document.querySelectorAll('button');
                        allButtons.forEach(btn => {
                            if (btn.id !== 'backBtn') {
                                btn.disabled = true;
                                btn.onclick = null;
                                // Remove all event listeners by cloning and replacing
                                const newBtn = btn.cloneNode(true);
                                if (btn.parentNode) {
                                    btn.parentNode.replaceChild(newBtn, btn);
                                }
                            }
                        });
                        
                        // Switch to results view by hiding quiz content and showing results
                        document.getElementById('quiz-content').style.display = "none";
                        document.getElementById('quiz-results').style.display = "block";
                        
                        document.getElementById('scoreSection').innerText = "Your Final Score: " + score + " out of " + quiz.length;
                        
                        // Mark this quiz as completed in sessionStorage
                        sessionStorage.setItem(attemptKey, 'completed');
                        
                        saveAttempt(score, quiz.length);
                        generateAnswerReview();
                    }
                    
                    function saveAttempt(score, totalQuestions) {
                        fetch('/student/save-attempt', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                quizName: quizName,
                                score: score,
                                totalQuestions: totalQuestions
                            })
                        })
                        .then(response => {
                            if (!response.ok) {
                                console.error('Failed to save attempt');
                            }
                            // After saving attempt, sync with MongoDB
                            return fetch('/student/sync-attempts', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                }
                            });
                        })
                        .then(response => {
                            if (!response.ok) {
                                console.error('Failed to sync attempts with MongoDB');
                            }
                        })
                        .catch(error => {
                            console.error('Error saving or syncing attempt:', error);
                        });
                    }

                    function returnToDashboard() {
                        window.location.href = '/student';
                    }

                    function checkAnswer() {
                        const chosen = document.querySelector('input[name="option"]:checked');
                        const userAnswer = chosen?.value || "";
                        const correctAnswer = quiz[index][5];
                        
                        userAnswers[index] = userAnswer;
                        answeredQuestions[index] = userAnswer !== "";
                        
                        // Recalculate total score by checking all answers
                        score = 0;
                        for (let i = 0; i < quiz.length; i++) {
                            if (userAnswers[i] === quiz[i][5]) {
                                score += 1;
                            }
                        }
                        
                        updateSidebar();
                    }

                    function generateSidebar() {
                        updatePanelCountsAndGrid();
                    }

                    function updateSidebar() {
                        updatePanelCountsAndGrid();
                    }
                    
                    function generateAnswerReview() {
                        // Create review of answers
                        const reviewContainer = document.getElementById('answerReview');
                        reviewContainer.style.display = 'block';
                        
                        let reviewHTML = '<h3>Answer Review</h3>';
                        
                        for (let i = 0; i < quiz.length; i++) {
                            const question = quiz[i][0];
                            const userAnswer = userAnswers[i] || "Not answered";
                            const correctAnswer = quiz[i][5];
                            const isCorrect = userAnswer === correctAnswer;
                            
                            reviewHTML += '<div class="review-question">' +
                                '<h3>Q' + (i+1) + ': ' + question + '</h3>' +
                                '<div class="review-option ' + (isCorrect ? 'correct-answer' : 'wrong-answer') + '">' +
                                'Your answer: ' + userAnswer +
                                '</div>';
                                
                            if (!isCorrect) {
                                reviewHTML += '<div class="review-option correct-answer">' +
                                    'Correct answer: ' + correctAnswer +
                                    '</div>';
                            }
                            
                            reviewHTML += '</div>';
                        }
                        
                        reviewContainer.innerHTML = reviewHTML;
                    }

                    // Setup multiple methods to detect developer tools
                    function setupDevToolsDetection() {
                        // Method 1: Using window size and dimensions
                        window.addEventListener('resize', checkDevToolsOpen);
                        
                        // Method 2: Using console.clear interference
                        devToolsCheckInterval = setInterval(function() {
                            if (!quizSubmitted) {
                                const before = performance.now();
                                console.clear();
                                const after = performance.now();
                                const diff = after - before;
                                
                                // If console clearing takes too long, dev tools might be open
                                if (diff > 20 && !devToolsOpen) {
                                    handleDevToolsOpen();
                                }
                                
                                // Method 3: Check window dimensions periodically
                                checkDevToolsOpen();
                            }
                        }, 1000);
                    }
                    
                    function removeDevToolsDetection() {
                        window.removeEventListener('resize', checkDevToolsOpen);
                        if (devToolsCheckInterval) {
                            clearInterval(devToolsCheckInterval);
                        }
                    }
                    
                    function checkDevToolsOpen() {
                        if (devToolsOpen || quizSubmitted) return;
                        
                        // Method 1: Check window dimensions
                        const heightDiff = window.outerHeight - window.innerHeight;
                        const widthDiff = window.outerWidth - window.innerWidth;
                        
                        // Different threshold for different browsers
                        const threshold = 150;
                        
                        if (heightDiff > threshold || widthDiff > threshold) {
                            handleDevToolsOpen();
                        }
                        
                        // Method 2: Check for custom browser objects
                        if (window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) {
                            handleDevToolsOpen();
                        }
                        
                        // Method 3: Firefox-specific
                        if (typeof InstallTrigger !== 'undefined' && widthDiff > 80) {
                            handleDevToolsOpen();
                        }
                    }
                    
                    function handleDevToolsOpen() {
                        if (devToolsOpen || quizSubmitted) return;
                        
                        devToolsOpen = true;
                        const warningEl = document.getElementById('devtools-warning');
                        warningEl.style.display = 'flex';
                        
                        // Pause the quiz timer while warning is shown
                        if (timerInterval) {
                            clearInterval(timerInterval);
                        }
                    }
                    
                    function checkAndContinue() {
                        // Check if developer tools are still open
                        const heightDiff = window.outerHeight - window.innerHeight;
                        const widthDiff = window.outerWidth - window.innerWidth;
                        const threshold = 150;
                        
                        if (heightDiff > threshold || widthDiff > threshold || 
                            (window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) ||
                            (typeof InstallTrigger !== 'undefined' && widthDiff > 80)) {
                            // Still open, show alert
                            alert("Please close developer tools before continuing");
                        } else {
                            // Developer tools closed, continue quiz
                            devToolsOpen = false;
                            document.getElementById('devtools-warning').style.display = 'none';
                            
                            // Resume the quiz timer
                            startTimer();
                        }
                    }

                    // Panel open/close logic
                    const sidebarBtn = document.getElementById('sidebarToggleBtn');
                    const panelOverlay = document.getElementById('questionPanelOverlay');
                    const closePanelBtn = document.getElementById('closePanelBtn');
                    const panelArrowBtn = document.getElementById('panelArrowBtn');

                    function openPanel() {
                        panelOverlay.classList.add('open');
                        sidebarBtn.style.display = 'none';
                    }
                    function closePanel() {
                        panelOverlay.classList.remove('open');
                        sidebarBtn.style.display = 'block';
                    }
                    sidebarBtn.onclick = openPanel;
                    panelArrowBtn.onclick = closePanel;
                    closePanelBtn.onclick = closePanel;

                    // Add event listener for page load to detect if this is a page refresh during an active quiz
                    window.addEventListener('load', function() {
                        // If the page is being refreshed during an active quiz (not already submitted)
                        // and not just starting (still showing the start button)
                        if (!quizSubmitted && 
                            document.getElementById('quizContainer').style.display === 'block' && 
                            document.getElementById('startFullscreenBtn').style.display === 'none') {
                            
                            // Page was refreshed during active quiz - auto submit
                            alert("The page was refreshed during an active quiz. Your quiz will be automatically submitted.");
                            submitQuiz(true);
                        }
                        
                        // Disable context menu during quiz to prevent right-click inspect
                        document.addEventListener('contextmenu', function(e) {
                            if (!quizSubmitted && document.getElementById('quizContainer').style.display === 'block') {
                                e.preventDefault();
                                return false;
                            }
                        });
                        
                        // Disable keyboard shortcuts for developer tools
                        document.addEventListener('keydown', function(e) {
                            if (!quizSubmitted && document.getElementById('quizContainer').style.display === 'block') {
                                // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, F12
                                if (
                                    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
                                    (e.key === 'F12')
                                ) {
                                    e.preventDefault();
                                    return false;
                                }
                            }
                        });

                        // Add event listener for page load to ensure sidebar starts collapsed
                        const sidebar = document.querySelector('.sidebar');
                        const toggle = document.querySelector('.sidebar-toggle');
                        const card = document.querySelector('.card');
                        if (sidebar && toggle && card) {
                            sidebar.classList.remove('expanded');
                            toggle.classList.remove('expanded');
                            card.classList.remove('expanded');
                        }
                    });

                    // Replace sidebar logic with new panel logic
                    function updatePanelCountsAndGrid() {
                        let notAnswered = 0, answered = 0, marked = 0, notVisited = 0, answeredMarked = 0;
                        const grid = [];
                        for (let i = 0; i < quiz.length; i++) {
                            let status = 'not-visited';
                            if (userAnswers[i] && userAnswers[i] !== '') {
                                if (viewedQuestions[i] && viewedQuestions[i] === 'marked') {
                                    status = 'answered-marked';
                                    answeredMarked++;
                                } else {
                                    status = 'answered';
                                    answered++;
                                }
                            } else if (viewedQuestions[i] && viewedQuestions[i] === 'marked') {
                                status = 'marked';
                                marked++;
                            } else if (viewedQuestions[i]) {
                                status = 'not-answered';
                                notAnswered++;
                            } else {
                                status = 'not-visited';
                                notVisited++;
                            }
                            grid.push({ idx: i, status });
                        }
                        document.getElementById('countNotAnswered').textContent = notAnswered;
                        document.getElementById('countAnswered').textContent = answered;
                        document.getElementById('countMarked').textContent = marked;
                        document.getElementById('countNotVisited').textContent = notVisited;
                        document.getElementById('countAnsweredMarked').textContent = answeredMarked;
                        // Render grid with shapes
                        const gridDiv = document.getElementById('questionGrid');
                        gridDiv.innerHTML = grid.map(function(q) {
                            let shapeClass = q.status;
                            return '<button class="question-btn ' + shapeClass + (index===q.idx?' current':'') + '" onclick="showQuestion(' + q.idx + ')">' + (q.idx+1) + '</button>';
                        }).join('');
                    }

                    function clearResponse() {
                        // Clear the selected radio button
                        const selectedOption = document.querySelector('input[name="option"]:checked');
                        if (selectedOption) {
                            selectedOption.checked = false;
                        }
                        
                        // Clear the user's answer for this question
                        userAnswers[index] = null;
                        answeredQuestions[index] = false;
                        
                        // Update the sidebar to reflect the change
                        updateSidebar();
                    }

                </script>
            </body>
            </html>
        `);
        } catch (err) {
            console.error('Error loading quiz data:', err);
            if (err.message.includes('Excel file not found') || err.message.includes('Questions file not found')) {
                // File not found error (more specific)
                return res.status(404).send(`
                    <h1>Quiz Resource Not Found</h1>
                    <p>${err.message}</p>
                    <p>The administrator may need to re-upload the quiz file.</p>
                    <a href="/student">Back to Dashboard</a>
                `);
            } else if (err.message === "This quiz has already ended") {
                // Quiz timing error
                return res.status(400).send(`
                    <h1>Quiz Unavailable</h1>
                    <p>${err.message}</p>
                    <a href="/student">Back to Dashboard</a>
                `);
            } else {
                // Generic error
                return res.status(500).send(`
                    <h1>Error Loading Quiz</h1>
                    <p>There was a problem loading the quiz: ${err.message}</p>
                    <a href="/student">Back to Dashboard</a>
                `);
            }
        }
    } catch (err) {
        console.error('Error processing quiz request:', err);
        res.status(500).send(`
            <h1>System Error</h1>
            <p>An unexpected error occurred: ${err.message}</p>
            <a href="/student">Back to Dashboard</a>
        `);
    }
});

module.exports = router;