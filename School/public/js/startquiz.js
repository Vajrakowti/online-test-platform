let currentQuiz = null;
let timeLeft = 0;
let timerInterval = null;

// Add this global variable if not present
let allQuestionsFlat = [];

// Function to display the quiz
function displayQuiz(quizData) {
    const questionsContainer = document.getElementById('questions');
    questionsContainer.innerHTML = '';
    
    quizData.forEach((question, index) => {
        const [questionText, option1, option2, option3, option4, correctAnswers] = question;
        
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';
        questionDiv.innerHTML = `
            <h3>Question ${index + 1}</h3>
            <p>${questionText}</p>
            <div class="options">
                <label>
                    <input type="checkbox" name="q${index}" value="0">
                    ${option1}
                </label>
                <label>
                    <input type="checkbox" name="q${index}" value="1">
                    ${option2}
                </label>
                <label>
                    <input type="checkbox" name="q${index}" value="2">
                    ${option3}
                </label>
                <label>
                    <input type="checkbox" name="q${index}" value="3">
                    ${option4}
                </label>
            </div>
        `;
        questionsContainer.appendChild(questionDiv);
    });
}

// Function to start the timer
function startTimer(duration) {
    timeLeft = duration;
    const timerDisplay = document.getElementById('time');
    
    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            submitQuiz();
        }
    }, 1000);
}

// Function to submit the quiz
async function submitQuiz() {
    if (!quizDataGlobal || !allQuestionsFlat || allQuestionsFlat.length === 0) {
        console.error("Quiz data not loaded or invalid for submission.");
        return;
    }

    const studentAnswers = [];
    answers.forEach(answer => {
        if (answer) { // Only push if an answer exists (not null from clear response)
            studentAnswers.push(answer);
        }
    });

    const quizName = quizDataGlobal.quiz.name; // Get quizName from the global data

    // --- FIX: Ensure shuffledQuestions are always objects with question/options/correctAnswer ---
    const shuffledQuestions = allQuestionsFlat.map(q => {
        // If already an object with question/options/correctAnswer, return as is
        if (q && typeof q === 'object' && q.question && q.options && q.correctAnswer) {
            return q;
        }
        // If array format: [question, option1, option2, option3, option4, correctAnswers]
        if (Array.isArray(q)) {
            const [question, option1, option2, option3, option4, correctAnswers] = q;
            let correctArr = [];
            if (Array.isArray(correctAnswers)) {
                correctArr = correctAnswers;
            } else if (typeof correctAnswers === 'number') {
                correctArr = [correctAnswers];
            } else if (typeof correctAnswers !== 'undefined') {
                correctArr = [parseInt(correctAnswers)];
            }
            return {
                question,
                options: [option1, option2, option3, option4],
                correctAnswer: correctArr
            };
        }
        // Fallback: return as is
        return q;
    });
    // --- END FIX ---

    let client;
    try {
        // The /submit-quiz endpoint is in startquiz.js on the server side
        const response = await fetch('/student/submit-quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                quizName,
                answers: studentAnswers, // Send the collected answers
                shuffledQuestions // Use the fixed/normalized array
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to submit quiz');
        }

        // Redirect to results page
        window.location.href = `/student/result/${encodeURIComponent(quizName)}`;
    } catch (err) {
        console.error('Error submitting quiz:', err);
        alert('Failed to submit your quiz attempt. Please try again: ' + err.message);
    } finally {
        if (client) {
            // client.close(); // Client is not used here, only on server-side
        }
    }
}

// Initialize the quiz when the page loads
document.addEventListener('DOMContentLoaded', () => {
    if (typeof quiz !== 'undefined' && quiz) {
        currentQuiz = quiz;
        // --- FIX: Populate allQuestionsFlat with correct structure ---
        allQuestionsFlat = quiz.map(q => {
            if (typeof q === 'object' && q.question && q.options && q.correctAnswer) {
                return q;
            }
            // If array format: [question, option1, option2, option3, option4, correctAnswers]
            if (Array.isArray(q)) {
                const [question, option1, option2, option3, option4, correctAnswers] = q;
                let correctArr = [];
                if (Array.isArray(correctAnswers)) {
                    correctArr = correctAnswers;
                } else if (typeof correctAnswers === 'number') {
                    correctArr = [correctAnswers];
                } else if (typeof correctAnswers !== 'undefined') {
                    correctArr = [parseInt(correctAnswers)];
                }
                return {
                    question,
                    options: [option1, option2, option3, option4],
                    correctAnswer: correctArr
                };
            }
            return q;
        });
        // --- END FIX ---
        displayQuiz(allQuestionsFlat);
        startTimer(duration);
    } else {
        console.error('Quiz data not found');
        document.getElementById('quiz-container').innerHTML = `
            <div class="error">
                <h2>Error Loading Quiz</h2>
                <p>There was a problem loading the quiz data. Please try again later.</p>
                <button onclick="window.location.href='/student'">Return to Dashboard</button>
            </div>
        `;
    }
});

async function loadQuiz(quizName) {
    try {
        // First try to get from MongoDB
        const response = await fetch(`/manual-questions/${quizName}`);
        if (response.ok) {
            const questions = await response.json();
            if (questions && questions.length > 0) {
                return questions;
            }
        }
        
        // If not found in MongoDB, try local file
        const response2 = await fetch(`/quizzes/${quizName}`);
        if (response2.ok) {
            const quiz = await response2.json();
            if (quiz && quiz.questions && quiz.questions.length > 0) {
                return quiz.questions;
            }
        }
        
        throw new Error('Quiz not found');
    } catch (err) {
        console.error('Error loading quiz:', err);
        throw err;
    }
}

async function saveAttempt(quizName, answers, score) {
    try {
        // First save to server (which will save to both local and MongoDB)
        const response = await fetch('/student/save-attempt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                quizName,
                score,
                totalQuestions: answers.length,
                isRetake: false,
                answers
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save attempt');
        }
        
        // Then sync to ensure everything is up to date
        const syncResponse = await fetch('/student/sync-attempts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!syncResponse.ok) {
            throw new Error('Failed to sync attempts');
        }
        
        return await response.json();
    } catch (err) {
        console.error('Error saving attempt:', err);
        throw err;
    }
}

// Function to get attempts for the current student
async function getAttempts() {
    try {
        const response = await fetch('/student/attempts');
        if (!response.ok) {
            throw new Error('Failed to get attempts');
        }
        return await response.json();
    } catch (err) {
        console.error('Error getting attempts:', err);
        throw err;
    }
}

// Function to delete an attempt
async function deleteAttempt(quizName) {
    try {
        const response = await fetch('/student/delete-attempt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ quizName })
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete attempt');
        }
        
        // Sync after deletion
        const syncResponse = await fetch('/student/sync-attempts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!syncResponse.ok) {
            throw new Error('Failed to sync after deletion');
        }
        
        return await response.json();
    } catch (err) {
        console.error('Error deleting attempt:', err);
        throw err;
    }
} 