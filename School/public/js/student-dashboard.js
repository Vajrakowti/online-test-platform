document.addEventListener('DOMContentLoaded', () => {
    // Fetch student info
    fetch('/student/info')
        .then(res => res.ok ? res.json() : Promise.reject('Failed to load student info'))
        .then(data => {
            if (data.name) document.getElementById('studentName').textContent = data.name;
            if (data.photo) {
                const img = document.getElementById('studentPhoto');
                img.src = data.photo.startsWith('/') ? data.photo : `/${data.photo}`;
                img.onerror = () => { img.src = '/default-profile.jpg'; };
            }
        })
        .catch(err => console.error('Error loading student info:', err));

    const todayTbody = document.querySelector('#todayTable tbody');
    const attemptedTbody = document.querySelector('#attemptedTable tbody');

    // Fetch all data
    Promise.all([
        fetch('/student/quizzes').then(res => res.ok ? res.json() : []),
        fetch('/student/attempts').then(res => res.ok ? res.json() : [])
    ]).then(([quizzes, attempts]) => {
        const attemptedQuizNames = new Set(attempts.map(a => a.quizName));
        
        // Render Today's Quizzes
        const availableQuizzes = quizzes.filter(q => !attemptedQuizNames.has(q.name));
        todayTbody.innerHTML = '';
        if (availableQuizzes.length === 0) {
            todayTbody.innerHTML = `<tr><td colspan="4" class="no-quizzes">No available quizzes.</td></tr>`;
        } else {
            availableQuizzes.forEach(quiz => {
                const row = todayTbody.insertRow();
                row.className = 'quiz-row';
                row.innerHTML = `
                    <td>${quiz.name}</td>
                    <td>${new Date(quiz.examDate).toLocaleDateString()}</td>
                    <td>${quiz.testDuration} mins</td>
                    <td>${quiz.startTime} - ${quiz.endTime}</td>
                `;
                row.addEventListener('click', () => {
                    window.location.href = `/student/quiz/${encodeURIComponent(quiz.name)}`;
                });
            });
        }

        // Render Attempted Quizzes
        attemptedTbody.innerHTML = '';
        if (attempts.length === 0) {
            attemptedTbody.innerHTML = `<tr><td colspan="2" class="no-quizzes">No attempted quizzes yet.</td></tr>`;
        } else {
            attempts.forEach(attempt => {
                const row = attemptedTbody.insertRow();
                row.innerHTML = `
                    <td>${attempt.quizName}</td>
                    <td><button class="view-result-btn" data-quiz-name="${attempt.quizName}">View Result</button></td>
                `;
            });
        }
        
        attachResultButtonListeners();

    }).catch(err => {
        console.error('Error loading dashboard data:', err);
        todayTbody.innerHTML = `<tr><td colspan="4" class="no-quizzes" style="color:red;">Error loading quizzes.</td></tr>`;
        attemptedTbody.innerHTML = `<tr><td colspan="2" class="no-quizzes" style="color:red;">Error loading attempts.</td></tr>`;
    });

    // Modal logic
    const modal = document.getElementById('quizResultModal');
    const modalBody = document.getElementById('resultsModalBody');
    const closeBtn = document.querySelector('.close-button');

    if(modal && closeBtn) {
        closeBtn.onclick = () => { modal.classList.remove('modal-active'); };
        window.onclick = (event) => {
            if (event.target == modal) {
                modal.classList.remove('modal-active');
            }
        };
    }

    function attachResultButtonListeners() {
        document.querySelectorAll('.view-result-btn').forEach(button => {
            button.addEventListener('click', async () => {
                const quizName = button.dataset.quizName;
                if (!modal || !modalBody) return;

                modalBody.innerHTML = `<p>Loading results for ${quizName}...</p>`;
                modal.classList.add('modal-active');

                try {
                    const response = await fetch(`/student/api/quiz-result/${encodeURIComponent(quizName)}`);
                    const data = await response.json();

                    if (!response.ok) {
                        modalBody.innerHTML = `<p class="error-message">${data.message || 'Failed to load results.'}</p>`;
                        if(data.endTime) modalBody.innerHTML += `<p>Please check back after ${data.endTime}.</p>`;
                    } else {
                        displayQuizResults(data);
                    }
                } catch (error) {
                    modalBody.innerHTML = `<p class="error-message">An unexpected error occurred.</p>`;
                    console.error('Error fetching result:', error);
                }
            });
        });
    }

    function displayQuizResults({ quiz, attempt }) {
         if (!modalBody) return;
         const scorePercent = Math.round((attempt.score / (quiz.questions.length * (quiz.questionMarks || 1))) * 100);
         let questionsHtml = '';

         quiz.questions.forEach((question, index) => {
             const studentAns = attempt.answers.find(a => a.questionText === question.questionText);
             const isCorrect = studentAns && studentAns.isCorrect;
             questionsHtml += `
                <div class="question-item">
                    <p class="question-text">${index + 1}. ${question.questionText}</p>
                    <ul class="options-list">
                        ${question.options.map(option => `
                            <li class="${option === question.correctAnswer ? 'correct' : (option === (studentAns && studentAns.chosenAnswer) ? 'incorrect' : '')} ${option === (studentAns && studentAns.chosenAnswer) ? 'marked' : ''}">
                                ${option}
                            </li>
                        `).join('')}
                    </ul>
                </div>
             `;
         });
        
        modalBody.innerHTML = `
            <h2>${quiz.name}</h2>
            <div class="quiz-summary">
                <p>Score: ${attempt.score}/${quiz.questions.length}</p>
                <p>Percentage: ${scorePercent}%</p>
            </div>
            <div class="question-section">
                ${questionsHtml}
            </div>
        `;
    }
});

function filterTable(tableId, searchTerm) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    searchTerm = searchTerm.toLowerCase();
    rows.forEach(row => {
        const cell = row.querySelector('td');
        if (cell) {
            row.style.display = cell.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
        }
    });
} 