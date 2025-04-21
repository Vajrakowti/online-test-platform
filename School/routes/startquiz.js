const express = require('express');
const path = require('path');
const xlsx = require('xlsx');
const fs = require('fs');

const router = express.Router();
const EXCEL_DIR = path.join(__dirname, '../uploads');
const QUIZ_JSON_PATH = path.join(__dirname, '../quizzes.json');
const MANUAL_QUESTIONS_DIR = path.join(__dirname, '../manual-questions');

function loadQuizData(quiz) {
  if (quiz.type === 'excel') {
    // Load Excel quiz
    const workbook = xlsx.readFile(path.join(EXCEL_DIR, quiz.file));
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet, { header: 1 }).slice(1);
  } else if (quiz.type === 'manual') {
    // Load manual quiz
    const questionsData = JSON.parse(
      fs.readFileSync(path.join(MANUAL_QUESTIONS_DIR, quiz.questionsFile))
    );
    
    // Convert to the same format as Excel data
    return questionsData.map(q => [
      q.text,
      ...q.options,
      q.options[q.correctAnswer],
      q.image || null
    ]);
  }
  throw new Error('Invalid quiz type');
}

function calculateDuration(quizConfig) {
    const [startH, startM] = quizConfig.startTime.split(':').map(Number);
    const [endH, endM] = quizConfig.endTime.split(':').map(Number);
    
    // Create Date objects for today with the quiz times
    const now = new Date();
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

router.get('/:quizName', (req, res) => {
    // Check if user is logged in and has student role
    if (!req.session.fname || req.session.role !== 'student') {
        return res.redirect('/login');
    }
    
    const quizName = req.params.quizName;
    const quizzes = JSON.parse(fs.readFileSync(QUIZ_JSON_PATH));
    const quizConfig = quizzes.find(q => q.name === quizName);

    if (!quizConfig) {
        return res.status(404).send("Quiz not found");
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
                    z-index: 1000;
                }
                .navbar > div {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                }
                .card {
                    background: white;
                    padding: 20px;
                    max-width: 600px;
                    margin: 80px auto 30px 20px;
                    border-radius: 8px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    flex: 1;
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
            </style>
        </head>
        <body>
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

                <div class="card">
                    <div id="quiz-content">
                        <h2 id="question"></h2>
                        <div id="questionImage"></div>
                        <form id="quizForm">
                            <ul id="options"></ul>
                            <div class="button-container">
                                <button type="button" onclick="prevQuestion()" id="prevBtn">Previous</button>
                                <button type="button" onclick="nextQuestion()" id="nextBtn">Next</button>
                                <button type="button" onclick="submitQuiz()" id="submitBtn" style="display:none;">Submit</button>
                            </div>
                        </form>
                    </div>
                    
                    <div id="quiz-results" style="display:none;">
                        <h2>Quiz Completed!</h2>
                        <div id="scoreSection"></div>
                        <div id="answerReview"></div>
                        <button id="backBtn" class="back-button" onclick="returnToDashboard()">Back to Dashboard</button>
                    </div>
                </div>

                <div class="sidebar">
                    <h3>Questions</h3>
                    <div id="questionList"></div>
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
                const viewedQuestions = new Array(quiz.length).fill(false);
                const userAnswers = new Array(quiz.length).fill(null);
                let fullscreenAttempts = 0;
                const MAX_FULLSCREEN_ATTEMPTS = 2;
                let isFullscreen = false;
                let quizSubmitted = false;

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
                }

                function removeEventListeners() {
                    document.removeEventListener('fullscreenchange', handleFullscreenChange);
                    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
                    document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
                    document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
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
                    viewedQuestions[index] = true;
                    const row = quiz[index];
                    document.getElementById('question').innerText = "Q" + (index + 1) + ": " + row[0];
                    
                    // Handle question image if present
                    const imageContainer = document.getElementById('questionImage');
                    if (row[6]) { // Check if image path exists
                        imageContainer.innerHTML = \`<img src="\${row[6]}" class="question-image" alt="Question image">\`;
                    } else {
                        imageContainer.innerHTML = '';
                    }

                    const options = row.slice(1, 5);
                    const list = options.map((opt) => \`
                        <li>
                            <label>
                                <input type="radio" name="option" value="\${opt}" \${userAnswers[index] === opt ? 'checked' : ''}>
                                \${opt}
                            </label>
                        </li>
                    \`).join("");
                    document.getElementById('options').innerHTML = list;

                    document.getElementById('prevBtn').style.display = (index > 0) ? 'inline-block' : 'none';
                    document.getElementById('nextBtn').style.display = (index < quiz.length - 1) ? 'inline-block' : 'none';
                    document.getElementById('submitBtn').style.display = (index === quiz.length - 1) ? 'inline-block' : 'none';
                    
                    updateSidebar();
                }

                function prevQuestion() {
                    checkAnswer();
                    index--;
                    showQuestion();
                }

                function nextQuestion() {
                    checkAnswer();
                    index++;
                    showQuestion();
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
                    
                    // Completely remove the sidebar instead of just hiding it
                    const sidebar = document.querySelector('.sidebar');
                    if (sidebar) {
                        sidebar.parentNode.removeChild(sidebar);
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
                    
                    saveAttempt(score, quiz.length);
                    generateAnswerReview();
                }
                
                function saveAttempt(score, totalQuestions) {
                    fetch('/student/saveattempt', {
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
                    })
                    .catch(error => {
                        console.error('Error saving attempt:', error);
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
                    
                    if (userAnswer === correctAnswer) {
                        score += 1;
                    }
                    
                    updateSidebar();
                }

                function generateSidebar() {
                    const list = quiz.map((_, i) => 
                        \`<button onclick="showQuestion(\${i})" id="qBtn\${i}">Q\${i + 1}</button>\`
                    ).join("");
                    document.getElementById('questionList').innerHTML = list;
                    updateSidebar();
                }

                function updateSidebar() {
                    for (let i = 0; i < quiz.length; i++) {
                        const btn = document.getElementById(\`qBtn\${i}\`);
                        if (btn) {
                            btn.className = '';
                            if (answeredQuestions[i]) {
                                btn.classList.add('answered');
                            } else if (viewedQuestions[i]) {
                                btn.classList.add('skipped');
                            }
                            if (i === index) {
                                btn.classList.add('current');
                            }
                        }
                    }
                }

            </script>
        </body>
        </html>
    `);
    } catch (err) {
        console.error('Error loading quiz:', err);
        if (err.message === "This quiz has already ended") {
            res.status(400).send(err.message);
        } else {
            res.status(500).send("Error loading quiz");
        }
    }
});

module.exports = router;