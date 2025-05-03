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

// Update the submitQuiz function
async function submitQuiz() {
    if (!currentQuiz) return;
    
    const answers = [];
    let score = 0;
    
    currentQuiz.questions.forEach((question, index) => {
        const selectedOption = document.querySelector(`input[name="q${index}"]:checked`);
        const answer = selectedOption ? selectedOption.value : null;
        answers.push(answer);
        
        if (answer === question.correctAnswer) {
            score++;
        }
    });
    
    try {
        await saveAttempt(currentQuiz.name, answers, score);
        
        // Update UI to show results
        document.getElementById('quiz-container').innerHTML = `
            <div class="quiz-result">
                <h2>Quiz Completed!</h2>
                <p>Your score: ${score}/${currentQuiz.questions.length}</p>
                <button onclick="window.location.href='/student/dashboard'">Return to Dashboard</button>
            </div>
        `;
    } catch (err) {
        console.error('Error submitting quiz:', err);
        alert('Failed to save your quiz attempt. Please try again.');
    }
} 