

const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const router = express.Router();
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const excel = require('exceljs');

const QUIZ_FILE = path.join(__dirname, '../quizzes.json');
const uploadDir = path.join(__dirname, '../uploads');
const QUIZ_IMAGES_DIR = path.join(__dirname, '../public/quiz-images');
const MANUAL_QUESTIONS_DIR = path.join(__dirname, '../manual-questions');

// Email configuration (replace with your actual SMTP settings)
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Your SMTP host
    port: 587,
    secure: false,
    auth: {
      user: 'vajrakowtilya@gmail.com', // Your email
      pass: 'ihpd dabe fljn xhpt' // app password
    }
  });


const studentPhotoDir = path.join(__dirname, '../public/student-photos');

// Ensure directory exists
if (!fs.existsSync(studentPhotoDir)) {
  fs.mkdirSync(studentPhotoDir, { recursive: true });
}

// Update the multer configuration to handle student photos
const studentStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, studentPhotoDir);
    },
    filename: function (req, file, cb) {
      // Generate a temporary filename first
      const tempFilename = 'temp-' + Date.now() + path.extname(file.originalname);
      
      // Store the temp filename in the request object
      req.tempPhotoFilename = tempFilename;
      cb(null, tempFilename);
    }
  });
  
  const uploadStudentPhoto = multer({ 
    storage: studentStorage,
    limits: { 
      fileSize: 5 * 1024 * 1024, // 5MB limit
      files: 1
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'), false);
      }
    }
  });
  
  

// Set up multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, req.body.quizName + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });


// Set up multer for email attachments
const uploadEmail = multer({
    storage: multer.memoryStorage(), // Store files in memory
    limits: {
      fileSize: 5 * 1024 * 1024 // Limit file size to 5MB
    }
});

// Create directories if they don't exist
if (!fs.existsSync(QUIZ_IMAGES_DIR)) {
  fs.mkdirSync(QUIZ_IMAGES_DIR, { recursive: true });
}
if (!fs.existsSync(MANUAL_QUESTIONS_DIR)) {
  fs.mkdirSync(MANUAL_QUESTIONS_DIR, { recursive: true });
}

// Set up multer for Excel uploads
const excelStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, req.body.quizName + path.extname(file.originalname));
  }
});

const uploadExcel = multer({ 
  storage: excelStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed!'), false);
    }
  }
}).single('quizFile');

// Update the storage configuration for quiz images
const quizImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, QUIZ_IMAGES_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadQuizImage = multer({ 
  storage: quizImageStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
}).fields([
  { name: 'questionImage_0', maxCount: 1 },
  { name: 'questionImage_1', maxCount: 1 },
  { name: 'questionImage_2', maxCount: 1 },
  { name: 'questionImage_3', maxCount: 1 },
  { name: 'questionImage_4', maxCount: 1 },
  { name: 'questionImage_5', maxCount: 1 },
  { name: 'questionImage_6', maxCount: 1 },
  { name: 'questionImage_7', maxCount: 1 },
  { name: 'questionImage_8', maxCount: 1 },
  { name: 'questionImage_9', maxCount: 1 },
  // Add more if needed
]);

// Helper: Read quizzes from file
function readQuizzes() {
  try {
    const data = fs.readFileSync(QUIZ_FILE);
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

// Helper: Save quizzes to file
function saveQuizzes(quizzes) {
  fs.writeFileSync(QUIZ_FILE, JSON.stringify(quizzes, null, 2));
}

// Generate random username and password
function generateCredentials(name) {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const username = name.toLowerCase().replace(/\s+/g, '') + randomNum;
  const password = Math.random().toString(36).slice(-8);
  return { username, password };
}

// Admin Home
router.get('/', (req, res) => {
  if (req.session.fname) {
    res.sendFile(path.join(__dirname, "../public/admin.html"));
  } else {
    res.redirect("/login");
  }
});

// Create Quiz Page
router.get('/create-quiz', (req, res) => {
  if (req.session.fname) {
    res.sendFile(path.join(__dirname, "../public/createquiz.html"));
  } else {
    res.redirect("/login");
  }
});

// Add Student Page
router.get('/add-student', (req, res) => {
  if (req.session.fname) {
    res.sendFile(path.join(__dirname, "../public/addstudent.html"));
  } else {
    res.redirect("/login");
  }
});

// Handle Student Creation
router.post('/add-student', uploadStudentPhoto.single('photo'), async (req, res) => {
    try {
      if (!req.file) {
        throw new Error('No photo uploaded or upload failed');
      }
  
      const { name, email, phone, dob, studentClass } = req.body;

      if (!name) {
        throw new Error('Student name is required');
      }
      
      // Generate credentials
      const { username, password } = generateCredentials(name);

          // Sanitize the student name for filename
    const sanitizedName = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  
  const ext = path.extname(req.file.originalname);
  let filename = `${sanitizedName}${ext}`;
  let counter = 1;
  
  // Check for existing files with same name
  while (fs.existsSync(path.join(studentPhotoDir, filename))) {
    filename = `${sanitizedName}-${counter}${ext}`;
    counter++;
  }
  
  // Rename the temp file to the final filename
  const tempPath = path.join(studentPhotoDir, req.file.filename);
  const newPath = path.join(studentPhotoDir, filename);
  fs.renameSync(tempPath, newPath);
      
      // Student data with photo path
      const studentData = {
        name,
        email,
        phone,
        dob,
        class: studentClass,
        username,
        password,
        photo: `/student-photos/${filename}`, // Path relative to public
        role: 'student',
        createdAt: new Date()
      };
  
      // Connect to MongoDB
      const client = new MongoClient("mongodb://localhost:27017/");
      await client.connect();
      const db = client.db("School");
      
      // Insert into the appropriate class collection
      const collectionName = `class_${studentClass}`;
      await db.collection(collectionName).insertOne(studentData);
      
      // Also store in LMS collection for authentication
      await db.collection("user").insertOne({
        Username: username,
        Password: password,
        role: 'student'
      });
  
      client.close();
  
      res.redirect(`/admin/students/${studentClass}`);
    } catch (err) {
      console.error('Error adding student:', err);
      
    // Delete uploaded file if error occurred
    if (req.file) {
        const filePath = path.join(studentPhotoDir, req.file.filename);
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) console.error('Error deleting uploaded file:', unlinkErr);
        });
      }
  
      res.status(500).send(`
        <div style="padding: 20px; background: #ffeeee; color: #ff0000; border-radius: 5px;">
          <h3>Error adding student</h3>
          <p>${err.message}</p>
          <a href="/admin/add-student" style="color: #007bff;">Try again</a>
        </div>
      `);
    }
  });

// View Students Page (shows class buttons)
router.get('/students', (req, res) => {
  if (req.session.fname) {
    res.sendFile(path.join(__dirname, "../public/students.html"));
  } else {
    res.redirect("/login");
  }
});

// View Students by Class (returns HTML fragment)
router.get('/students/:class', async (req, res) => {
    try {
        if (!req.session.fname) {
            return res.status(401).send('Unauthorized');
        }

        const classNumber = req.params.class;
        const client = new MongoClient("mongodb://localhost:27017/");
        await client.connect();
        const db = client.db("School");
        
        // Fetch students from specific class
        const students = await db.collection(`class_${classNumber}`).find().toArray();
        client.close();

        // Render student list with enhanced design
        res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                .student-container {
                    max-width: 1200px;
                    margin: 20px auto;
                    padding: 20px;
                    background: #f9f9f9;
                    border-radius: 8px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    gap: 15px;
                }
                .search-container {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-grow: 1;
                    max-width: 400px;
                }
                #searchInput {
                    padding: 10px 15px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    flex-grow: 1;
                    transition: border 0.3s;
                }
                #searchInput:focus {
                    outline: none;
                    border-color: #4CAF50;
                    box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
                }
                .student-count {
                    font-size: 14px;
                    color: #666;
                    margin-left: auto;
                }
                .back-btn {
                    padding: 10px 16px;
                    background-color: #36b9cc;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-block;
                    margin-bottom: 10px;
                    transition: background-color 0.3s;
                }
                .back-btn:hover {
                    background-color: #5a6268;
                }
                .student-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                .student-table th, .student-table td {
                    border: 1px solid #ddd;
                    padding: 12px;
                    text-align: left;
                }
                .student-table th {
                    background-color: #007bff;
                    color: white;
                    position: sticky;
                    top: 0;
                }
                .student-table tr:nth-child(even) {
                    background-color: #f2f2f2;
                }
                .student-table tr:hover {
                    background-color: #e9e9e9;
                }
                .no-students {
                    text-align: center;
                    padding: 30px;
                    color: #666;
                    font-style: italic;
                    font-size: 16px;
                }
                .card {
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    padding: 20px;
                    margin-bottom: 20px;
                }
                .card-title {
                    margin-top: 0;
                    color: #333;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .actions {
                    display: flex;
                    gap: 8px;
                }
                .action-btn {
                    padding: 6px 12px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                .edit-btn {
                    background-color: #ffc107;
                    color: #212529;
                }
                .edit-btn:hover {
                    background-color: #e0a800;
                    transform: translateY(-1px);
                }
                .delete-btn {
                    background-color: #dc3545;
                    color: white;
                }
                .delete-btn:hover {
                    background-color: #c82333;
                    transform: translateY(-1px);
                }
                .badge {
                    display: inline-block;
                    padding: 3px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: bold;
                    background-color: #4CAF50;
                    color: white;
                }
                @media (max-width: 768px) {
                    .header {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                    .search-container {
                        width: 100%;
                    }
                    .student-table {
                        font-size: 14px;
                    }
                    .actions {
                        flex-direction: column;
                        gap: 5px;
                    }
                }

                .email-btn {
                    background-color: #28a745;
                    color: white;
                }
                .email-btn:hover {
                    background-color: #218838;
                    transform: translateY(-1px);
                }
                
                /* Modal styles */
                .modal {
                    display: none;
                    position: fixed;
                    z-index: 1000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    overflow: auto;
                    background-color: rgba(0,0,0,0.4);
                }
                .modal-content {
                    background-color: #fefefe;
                    margin: 5% auto;
                    padding: 20px;
                    border: 1px solid #888;
                    width: 80%;
                    max-width: 600px;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
                .close {
                    color: #aaa;
                    float: right;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                }
                .close:hover {
                    color: black;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                .form-group input, 
                .form-group textarea {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    box-sizing: border-box;
                }
                .form-group textarea {
                    height: 150px;
                    resize: vertical;
                }
                .send-btn {
                    background-color: #007bff;
                    color: white;
                    padding: 10px 20px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                }
                .send-btn:hover {
                    background-color: #0069d9;
                }
                .attachment-btn {
                    background-color: #6c757d;
                    color: white;
                    padding: 8px 15px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-top: 10px;
                }
                .attachment-btn:hover {
                    background-color: #5a6268;
                }
                .attachment-list {
                    margin-top: 10px;
                }
                .student-photo {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #ddd;
}
.photo-placeholder {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #eee;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
}    
            </style>
        </head>
        <body>
            <div class="student-container">
                <div class="card">
                    <div class="header">
                        <h2 class="card-title">
                            Class ${classNumber} Students
                            <span class="badge">${students.length} students</span>
                        </h2>
                        <div class="search-container">
                            <input type="text" id="searchInput" placeholder="Type to search students..." autocomplete="off">
                            <span class="student-count" id="studentCount">Showing ${students.length} students</span>
                        </div>
                    </div>
                    
                    ${students.length === 0 ? 
                        '<div class="no-students">No students found in this class</div>' : 
                        `
                        <div style="overflow-x: auto;">
                            <table class="student-table" id="studentTable">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Username</th>
                                        <th>Password</th>
                                        <th>Date of Birth</th>
                                        <th>Phone</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${students.map(student => `
                                          <tr>
    <td>
        <div style="display: flex; align-items: center; gap: 10px;">
            ${student.photo ? 
                `<img src="${student.photo}" alt="${student.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">` : 
                `<div style="width: 40px; height: 40px; border-radius: 50%; background: #eee; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-user" style="color: #999;"></i>
                </div>`
            }
            <span>${student.name}</span>
        </div>
    </td>
    <td>${student.email}</td>
    <td>${student.username}</td>
    <td>${student.password}</td>
    <td>${student.dob}</td>
    <td>${student.phone}</td>
    <td class="actions">
        <button class="action-btn edit-btn" data-id="${student.username}">Edit</button>
        <button class="action-btn delete-btn" data-id="${student.username}">Delete</button>
        <button class="action-btn email-btn" data-id="${student.username}" data-email="${student.email}" data-name="${student.name}">Email</button>
    </td>
</tr>

                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        `
                    }
                </div>
                <a href="/admin/students" class="back-btn">← Back to All Classes</a>
            </div>

            <!-- Email Modal -->

            <div id="emailModal" class="modal">
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h2>Send Email to <span id="studentName"></span></h2>
                    <form id="emailForm">
                        <input type="hidden" id="studentEmail">
                        <div class="form-group">
                            <label for="emailSubject">Subject:</label>
                            <input type="text" id="emailSubject" required>
                        </div>
                        <div class="form-group">
                            <label for="emailBody">Message:</label>
                            <textarea id="emailBody" required></textarea>
                        </div>
                        <div class="form-group">
                            <button type="button" class="attachment-btn" id="addAttachment">Add Attachment</button>
                            <div class="attachment-list" id="attachmentList"></div>
                        </div>
                        <button type="submit" class="send-btn">Send Email</button>
                    </form>
                    <div id="emailStatus" style="margin-top: 15px;"></div>
                </div>
            </div>

            <script>
                // Real-time filtering function
                function filterStudents() {
                    const input = document.getElementById('searchInput');
                    const filter = input.value.trim().toLowerCase();
                    const table = document.getElementById('studentTable');
                    const rows = table ? table.getElementsByTagName('tr') : [];
                    let visibleCount = 0;

                    // Skip header row (index 0)
                    for (let i = 1; i < rows.length; i++) {
                        const nameCell = rows[i].querySelector('.student-name');
                        const name = nameCell.textContent.toLowerCase();
                        const emailCell = rows[i].cells[1];
                        const email = emailCell.textContent.toLowerCase();
                        
                        if (name.includes(filter) || email.includes(filter)) {
                            rows[i].style.display = '';
                            visibleCount++;
                            
                            // Highlight matching text
                            if (filter) {
                                highlightText(nameCell, filter);
                                highlightText(emailCell, filter);
                            } else {
                                removeHighlight(nameCell);
                                removeHighlight(emailCell);
                            }
                        } else {
                            rows[i].style.display = 'none';
                            removeHighlight(nameCell);
                            removeHighlight(emailCell);
                        }
                    }

                    // Update student count
                    document.getElementById('studentCount').textContent = 
                        \`Showing \${visibleCount} of \${rows.length - 1} students\`;
                }

                // Highlight matching text
                function highlightText(element, text) {
                    const innerHTML = element.textContent;
                    const index = innerHTML.toLowerCase().indexOf(text);
                    if (index >= 0) {
                        const highlighted = innerHTML.substring(0, index) + 
                            '<span class="highlight">' + innerHTML.substring(index, index + text.length) + '</span>' + 
                            innerHTML.substring(index + text.length);
                        element.innerHTML = highlighted;
                    }
                }

                // Remove highlight
                function removeHighlight(element) {
                    if (element.innerHTML !== element.textContent) {
                        element.innerHTML = element.textContent;
                    }
                }

                // Initialize with event listeners
                document.addEventListener('DOMContentLoaded', function() {
                    const searchInput = document.getElementById('searchInput');
                    
                    // Real-time filtering as user types
                    searchInput.addEventListener('input', function() {
                        filterStudents();
                    });
                    
                    // Focus search input on page load
                    searchInput.focus();
                    
                    // Edit button functionality
                    document.querySelectorAll('.edit-btn').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const username = this.getAttribute('data-id');
                            // Implement edit functionality
                            alert('Edit student with username: ' + username);
                        });
                    });
                    
                    // Delete button functionality
                    document.querySelectorAll('.delete-btn').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const username = this.getAttribute('data-id');
                            const row = this.closest('tr');
                            if (confirm('Are you sure you want to delete student: ' + username + '?')) {
                                // AJAX call to delete student
                                fetch(\`/admin/students/delete/\${username}\`, {
                                    method: 'DELETE'
                                })
                                .then(response => {
                                    if (response.ok) {
                                        row.remove();
                                        updateStudentCount();
                                    } else {
                                        alert('Failed to delete student');
                                    }
                                })
                                .catch(error => {
                                    console.error('Error:', error);
                                    alert('Error deleting student');
                                });
                            }
                        });
                    });
                    
                    // Update student count initially
                    if (document.getElementById('studentTable')) {
                        updateStudentCount();
                    }
                });
                
                // Update visible student count
                function updateStudentCount() {
                    const table = document.getElementById('studentTable');
                    if (!table) return;
                    
                    const visibleRows = Array.from(table.querySelectorAll('tbody tr'))
                        .filter(row => row.style.display !== 'none');
                    
                    document.getElementById('studentCount').textContent = 
                        \`Showing \${visibleRows.length} of \${table.rows.length - 1} students\`;
                }


                                // Modal functionality
                const modal = document.getElementById('emailModal');
                const span = document.getElementsByClassName('close')[0];
                const emailForm = document.getElementById('emailForm');
                const studentNameSpan = document.getElementById('studentName');
                const studentEmailInput = document.getElementById('studentEmail');
                const emailStatus = document.getElementById('emailStatus');
                let attachments = [];

                // Email button click handler
                document.addEventListener('click', function(e) {
                    if (e.target.classList.contains('email-btn')) {
                        const studentName = e.target.getAttribute('data-name');
                        const studentEmail = e.target.getAttribute('data-email');
                        
                        studentNameSpan.textContent = studentName;
                        studentEmailInput.value = studentEmail;
                        emailForm.reset();
                        attachments = [];
                        document.getElementById('attachmentList').innerHTML = '';
                        emailStatus.innerHTML = '';
                        modal.style.display = 'block';
                    }
                });

                // Close modal
                span.onclick = function() {
                    modal.style.display = 'none';
                }

                // Close modal when clicking outside
                window.onclick = function(event) {
                    if (event.target == modal) {
                        modal.style.display = 'none';
                    }
                }

                // Add attachment
                document.getElementById('addAttachment').addEventListener('click', function() {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.style.display = 'none';
                    input.onchange = function(e) {
                    for (let i = 0; i < e.target.files.length; i++) {
                            attachments.push(e.target.files[i]); 
                            const attachmentItem = document.createElement('div');
                            attachmentItem.innerHTML = 
                                '<div style="display: flex; align-items: center; margin-bottom: 5px;">' +
                                '<span style="flex-grow: 1;">' + e.target.files[i].name + '</span>' +
                                '<button type="button" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer;" ' +
                                'data-index="' + (attachments.length - 1) + '">Remove</button>' +
                '</div>';
            document.getElementById('attachmentList').appendChild(attachmentItem);
        }
    };
    
    input.click();
});

                // Remove attachment
                document.getElementById('attachmentList').addEventListener('click', function(e) {
                    if (e.target.tagName === 'BUTTON' && e.target.hasAttribute('data-index')) {
                        const index = parseInt(e.target.getAttribute('data-index'));
                        attachments.splice(index, 1);
                        e.target.parentElement.remove();
                    }
                });

                // Send email
                emailForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    const subject = document.getElementById('emailSubject').value;
                    const body = document.getElementById('emailBody').value;
                    const to = studentEmailInput.value;
                    
                    emailStatus.innerHTML = '<p style="color: #007bff;">Sending email...</p>';
                    
                    const formData = new FormData();
                    formData.append('to', to);
                    formData.append('subject', subject);
                    formData.append('body', body);
                    
                    attachments.forEach((file, index) => {
                        formData.append('attachments', file);
                    });
                    
                    fetch('/admin/send-email', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                    if (data.success) {
                        emailStatus.innerHTML = '<p style="color: #28a745;">Email sent successfully!</p>';
                        setTimeout(function() {
                            modal.style.display = 'none';
                        }, 1500);
                    } else {
                        emailStatus.innerHTML = '<p style="color: #dc3545;">Error: ' + data.message + '</p>';
                }
            })
            .catch(function(error) {
                emailStatus.innerHTML = '<p style="color: #dc3545;">Error: ' + error.message + '</p>';
            });

        });
        </script>
    </body>
</html>
        `);
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).send(`
            <div class="student-container">
                <div class="card">
                    <h2>Error Loading Students</h2>
                    <p>There was an error loading the student data. Please try again later.</p>
                    <p>Error details: ${err.message}</p>
                </div>
                <a href="/admin/students" class="back-btn">Back to All Classes</a>
            </div>
        `);
    }
});


// Handle sending emails
router.post('/send-email', uploadEmail.any(), async (req, res) => {
    try {
        if (!req.session.fname) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        // Validate required fields
        if (!req.body.to || !req.body.subject || !req.body.body) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields (to, subject, or body)' 
            });
        }

        const { to, subject, body } = req.body;
        
        // Prepare email options
        const mailOptions = {
            from: 'vajrakowtilya@gmail.com', // Use your email from config.
            to: to,
            subject: subject,
            text: body
        };

        // Handle attachments if any
        if (req.files && req.files.length > 0) {
            mailOptions.attachments = req.files.map(file => ({
                filename: file.originalname,
                content: file.buffer
            }));
        }

        // Send email
        await transporter.sendMail(mailOptions);
        
        res.json({ success: true, message: 'Email sent successfully' });
    } catch (err) {
        console.error('Error sending email:', err);
        res.status(500).json({ 
            success: false, 
            message: err.message 
        });
    }
});


// student deletion in db.
router.delete('/students/delete/:username', async (req, res) => {
    try {
      if (!req.session.fname) {
        return res.status(401).send('Unauthorized');
      }
  
      const username = req.params.username;
      const client = new MongoClient("mongodb://localhost:27017/");
      await client.connect();
      const db = client.db("School");
      
      // First find which class the student is in and get photo path
      const collections = await db.listCollections().toArray();
      const classCollections = collections.filter(c => c.name.startsWith('class_'));
      
      let deleted = false;
      let photoPath = null;
      
      for (const collection of classCollections) {
        const student = await db.collection(collection.name).findOne({ username });
        if (student) {
          photoPath = student.photo;
          const result = await db.collection(collection.name)
            .deleteOne({ username });
          if (result.deletedCount > 0) {
            deleted = true;
            break;
          }
        }
      }
      
      // Delete from LMS collection
      if (deleted) {
        await db.collection("user").deleteOne({ Username: username });
        
        // Delete the photo file if it exists
        if (photoPath) {
          const fullPath = path.join(__dirname, '../public', photoPath);
          fs.unlink(fullPath, (err) => {
            if (err) console.error('Error deleting student photo:', err);
            else console.log('Deleted student photo:', fullPath);
          });
        }
      }
      
      client.close();
      
      res.status(deleted ? 200 : 404).send(deleted ? 'Student deleted' : 'Student not found');
    } catch (err) {
      console.error('Error deleting student:', err);
      res.status(500).send('Error deleting student');
    }
  });


// Handle Excel Quiz Creation
router.post('/create-quiz', (req, res) => {
  uploadExcel(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).send('Error uploading files: ' + err.message);
    } else if (err) {
      console.error('Unknown error:', err);
      return res.status(500).send('Unknown error occurred');
    }

    try {
      const quizzes = readQuizzes();
      const { quizName, quizClass, startTime, endTime } = req.body;

      if (!req.file) {
        throw new Error('No Excel file uploaded');
      }

      // Add quiz to quizzes.json
      const quiz = {
        name: quizName,
        startTime: startTime,
        endTime: endTime,
        class: quizClass,
        type: 'excel',
        file: req.file.filename
      };

      quizzes.push(quiz);
      saveQuizzes(quizzes);

      res.redirect('/admin');
    } catch (error) {
      console.error('Error creating quiz:', error);
      res.status(500).send('Error creating quiz: ' + error.message);
    }
  });
});

// Handle Manual Quiz Creation
router.post('/create-quiz-manual', (req, res) => {
  uploadQuizImage(req, res, async function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).send('Error uploading files: ' + err.message);
    } else if (err) {
      console.error('Unknown error:', err);
      return res.status(500).send('Unknown error occurred');
    }

    try {
      // Debug logging
      console.log('Form Data:', req.body);
      console.log('Files:', req.files);

      const quizzes = readQuizzes();
      const { quizName, quizClass, startTime, endTime } = req.body;

      // Validate required fields
      if (!quizName || !quizClass || !startTime || !endTime) {
        throw new Error('Missing required quiz information');
      }
      
      // Process questions using new field format
      const questions = [];
      
      // Get indices of questions
      const indices = req.body.questionIndex ? 
        (Array.isArray(req.body.questionIndex) ? req.body.questionIndex : [req.body.questionIndex]) : [];
      
      console.log('Question indices:', indices);
      
      if (!indices || indices.length === 0) {
        throw new Error('No questions found in form data');
      }

      // Create full question objects
      for (const index of indices) {
        const text = req.body[`questionText_${index}`];
        const option1 = req.body[`questionOption1_${index}`];
        const option2 = req.body[`questionOption2_${index}`];
        const option3 = req.body[`questionOption3_${index}`];
        const option4 = req.body[`questionOption4_${index}`];
        const correct = req.body[`questionCorrect_${index}`];
        
        console.log(`Processing question ${index}:`, {
          text, option1, option2, option3, option4, correct
        });

        if (!text || !option1 || !option2 || !option3 || !option4 || !correct) {
          throw new Error(`Missing data for question ${parseInt(index) + 1}`);
        }

        const questionObj = {
          text: text,
          options: [option1, option2, option3, option4],
          correctAnswer: parseInt(correct) - 1
        };

        // Check if there's an image for this question
        const uploadedFiles = req.files ? (req.files[`questionImage_${index}`] || []) : [];
        if (uploadedFiles.length > 0) {
          questionObj.image = `/quiz-images/${uploadedFiles[0].filename}`;
        }

        questions.push(questionObj);
      }

      // Validate we have at least one question
      if (questions.length === 0) {
        throw new Error('No questions provided. Please check the form data.');
      }

      console.log('Final questions array:', questions);

      // Create directory if it doesn't exist
      if (!fs.existsSync(MANUAL_QUESTIONS_DIR)) {
        fs.mkdirSync(MANUAL_QUESTIONS_DIR, { recursive: true });
      }

      // Save questions to a JSON file
      const questionsFileName = `${quizName}-manual.json`;
      const questionsFilePath = path.join(MANUAL_QUESTIONS_DIR, questionsFileName);
      
      fs.writeFileSync(
        questionsFilePath,
        JSON.stringify(questions, null, 2)
      );

      console.log('Saved questions to file:', questionsFilePath);

      // Add quiz to quizzes.json
      const quiz = {
        name: quizName,
        startTime: startTime,
        endTime: endTime,
        class: quizClass,
        type: 'manual',
        questionsFile: questionsFileName
      };

      quizzes.push(quiz);
      saveQuizzes(quizzes);

      console.log('Quiz added successfully:', quiz);

      res.redirect('/admin');
    } catch (error) {
      console.error('Error creating manual quiz:', error);
      // Delete uploaded files if there was an error
      if (req.files) {
        Object.keys(req.files).forEach(key => {
          req.files[key].forEach(file => {
            const filePath = path.join(QUIZ_IMAGES_DIR, file.filename);
            fs.unlink(filePath, (err) => {
              if (err) console.error('Error deleting uploaded file:', err);
            });
          });
        });
      }
      res.status(500).send(`Error creating quiz: ${error.message}`);
    }
  });
});

// Show Total Quizzes
router.get('/total-quiz', (req, res) => {
    if (!req.session.fname) {
      return res.redirect("/login");
    }
  
    const quizzes = readQuizzes();
    
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Total Quizzes</title>
        <style>
            * {
                box-sizing: border-box;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            body {
                margin: 0;
                padding: 20px;
                background-color: #f5f7fa;
                color: #333;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            }
            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 30px;
                flex-wrap: wrap;
                gap: 15px;
            }
            .page-title {
                margin: 0;
                color: #4e73df;
                font-size: 28px;
            }
            .back-btn {
                padding: 10px 16px;
                background-color: #36b9cc;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                transition: background-color 0.3s;
            }
            .back-btn:hover {
                background-color: #5a6268;
            }
            .search-container {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                max-width: 400px;
            }
            #searchInput {
                padding: 10px 15px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
                flex-grow: 1;
                transition: border 0.3s;
            }
            #searchInput:focus {
                outline: none;
                border-color: #4CAF50;
                box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
            }
            .quiz-count {
                font-size: 14px;
                color: #666;
                margin-left: auto;
            }
            .quiz-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
                background: white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                border-radius: 8px;
                overflow: hidden;
            }
            .quiz-table th {
                background-color: #007BFF;
                color: white;
                padding: 15px;
                text-align: left;
                font-weight: 600;
            }
            .quiz-table td {
                padding: 12px 15px;
                border-bottom: 1px solid #eee;
            }
            .quiz-table tr:last-child td {
                border-bottom: none;
            }
            .quiz-table tr:hover {
                background-color: #f8f9fa;
            }
            .file-link {
                color: #3498db;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                transition: color 0.2s;
            }
            .file-link:hover {
                color: #1d6fa5;
                text-decoration: underline;
            }
            .no-quizzes {
                text-align: center;
                padding: 40px;
                color: #666;
                font-style: italic;
                font-size: 16px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .time-cell {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }
            .time-badge {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                background-color: #e3f2fd;
                color: #1976d2;
            }
            @media (max-width: 768px) {
                .header {
                    flex-direction: column;
                    align-items: flex-start;
                }
                .search-container {
                    width: 100%;
                }
                .quiz-table {
                    display: block;
                    overflow-x: auto;
                }
                .time-cell {
                    flex-direction: column;
                    gap: 5px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 class="page-title">Total Quizzes</h1>
                <div class="search-container">
                    <input type="text" id="searchInput" placeholder="Search quizzes by name..." autocomplete="off">
                    <span class="quiz-count" id="quizCount">Showing ${quizzes.length} quizzes</span>
                </div>
                <a href="/admin" class="back-btn">← Back to Admin</a>
            </div>
            
            ${quizzes.length === 0 ? 
                '<div class="no-quizzes">No quizzes available. Create your first quiz to get started.</div>' : 
                `
                <table class="quiz-table">
    <thead>
        <tr>
            <th>Quiz Name</th>
            <th>Class</th>
            <th>Time Period</th>
            <th>Quiz File</th>
            <th>Actions</th>
        </tr>
    </thead>
    <tbody id="quizTableBody">
        ${quizzes.map(quiz => `
            <tr data-quiz-name="${quiz.name.toLowerCase()}">
                <td class="quiz-name">${quiz.name}</td>
                <td>Class ${quiz.class}</td>
                <td class="time-cell">
                    <span class="time-badge">Start: ${quiz.startTime}</span>
                    <span class="time-badge">End: ${quiz.endTime}</span>
                </td>
                <td>
                    <a href="/uploads/${quiz.file}" class="file-link" download>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        ${quiz.file}
                    </a>
                </td>
                <td>
                    <a href="/admin/quiz-results/${encodeURIComponent(quiz.name)}" class="file-link">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        View Results
                    </a>
                </td>
            </tr>
        `).join('')}
    </tbody>
</table>

                `
            }
        </div>
  
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                const searchInput = document.getElementById('searchInput');
                const quizTableBody = document.getElementById('quizTableBody');
                const quizCount = document.getElementById('quizCount');
                const quizRows = quizTableBody ? quizTableBody.querySelectorAll('tr') : [];
                
                // Focus search input on page load
                if (searchInput) searchInput.focus();
                
                function filterQuizzes() {
                    const searchTerm = searchInput.value.trim().toLowerCase();
                    let visibleCount = 0;
                    
                    if (quizRows.length > 0) {
                        quizRows.forEach(row => {
                            const quizName = row.getAttribute('data-quiz-name');
                            const nameCell = row.querySelector('.quiz-name');
                            const nameText = nameCell.textContent.toLowerCase();
                            
                            if (nameText.includes(searchTerm)) {
                                row.style.display = '';
                                visibleCount++;
                                
                                // Highlight matching text
                                if (searchTerm) {
                                    highlightText(nameCell, searchTerm);
                                } else {
                                    removeHighlight(nameCell);
                                }
                            } else {
                                row.style.display = 'none';
                                removeHighlight(nameCell);
                            }
                        });
                        
                        // Update quiz count
                        quizCount.textContent = \`Showing \${visibleCount} of \${quizRows.length} quizzes\`;
                    }
                }
                
                // Highlight matching text
                function highlightText(element, text) {
                    const innerHTML = element.textContent;
                    const index = innerHTML.toLowerCase().indexOf(text);
                    if (index >= 0) {
                        const highlighted = innerHTML.substring(0, index) + 
                            '<span class="highlight">' + innerHTML.substring(index, index + text.length) + '</span>' + 
                            innerHTML.substring(index + text.length);
                        element.innerHTML = highlighted;
                    }
                }
                
                // Remove highlight
                function removeHighlight(element) {
                    if (element.innerHTML !== element.textContent) {
                        element.innerHTML = element.textContent;
                    }
                }
                
                // Add event listener for search
                if (searchInput) {
                    searchInput.addEventListener('input', filterQuizzes);
                }
            });
        </script>
    </body>
    </html>
    `);
  });




// View Marks.


router.get('/quiz-results/:quizName', async (req, res) => {
    if (!req.session.fname) {
        if (req.query.partial) {
            return res.status(401).json({ error: 'Session expired' });
        }
        return res.redirect("/login");
    }

    const quizName = decodeURIComponent(req.params.quizName);
    const classFilter = req.query.class;
    
    try {
        // Connect to MongoDB
        const client = new MongoClient("mongodb://localhost:27017/");
        await client.connect();
        const db = client.db("School");
        
        // Get all collections that start with 'class_'
        const collections = await db.listCollections().toArray();
        const classCollections = collections.filter(c => c.name.startsWith('class_'));
        
        // Get all attempts for this quiz
        const attemptsDir = path.join(__dirname, '../attempts');
        const attemptFiles = fs.readdirSync(attemptsDir);
        
        let allResults = [];
        
        for (const file of attemptFiles) {
            if (file.endsWith('.json')) {
                const username = file.replace('.json', ''); // Get username from filename
                const filePath = path.join(attemptsDir, file);
                const attempts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const quizAttempts = attempts.filter(a => a.quizName === quizName);
                
                if (quizAttempts.length > 0) {
                    // Get the latest attempt
                    const latestAttempt = quizAttempts.reduce((latest, current) => 
                        new Date(current.attemptedAt) > new Date(latest.attemptedAt) ? current : latest
                    );
                    
                    // Find student details from all class collections
                    let studentDetails = null;
                    
                    for (const collection of classCollections) {
                        const student = await db.collection(collection.name).findOne({ username });
                        if (student) {
                            studentDetails = {
                                name: student.name,
                                class: student.class,
                                email: student.email
                            };
                            break;
                        }
                    }
                    
                    if (studentDetails && (!classFilter || studentDetails.class === classFilter)) {
                        allResults.push({
                            ...studentDetails,
                            username: username, // Include username in results
                            score: latestAttempt.score,
                            totalQuestions: latestAttempt.totalQuestions,
                            percentage: Math.round((latestAttempt.score / latestAttempt.totalQuestions) * 100),
                            attemptedAt: latestAttempt.attemptedAt
                        });
                    }
                }
            }
        }
        
        client.close();
        
        // Sort by class then by score (descending)
        allResults.sort((a, b) => {
            if (a.class === b.class) {
                return b.score - a.score;
            }
            return a.class.localeCompare(b.class);
        });

        // Handle Excel export
        if (req.query.export === 'excel') {
            const workbook = new excel.Workbook();
            const worksheet = workbook.addWorksheet('Quiz Results');
            
            // Add headers
            worksheet.columns = [
                { header: 'Class', key: 'class', width: 10 },
                { header: 'Student Name', key: 'name', width: 30 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Score', key: 'score', width: 15 },
                { header: 'Percentage', key: 'percentage', width: 15 },
                { header: 'Attempted At', key: 'attemptedAt', width: 25 }
            ];
            
            // Format header row
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).alignment = { horizontal: 'center' };
            
            // Add data rows
            allResults.forEach(result => {
                worksheet.addRow({
                    class: result.class,
                    name: result.name,
                    email: result.email,
                    score: `${result.score}/${result.totalQuestions}`,
                    percentage: `${result.percentage}%`,
                    attemptedAt: new Date(result.attemptedAt).toLocaleString()
                });
            });
            
            // Set response headers
            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${quizName.replace(/[^a-z0-9]/gi, '_')}_results.xlsx"`
            );
            
            // Send the Excel file
            return workbook.xlsx.write(res).then(() => {
                res.end();
            });
        }

        // Handle partial requests (AJAX updates)
        if (req.query.partial) {
            return res.json({
                count: allResults.length,
                html: allResults.length === 0 ? 
                    '<div class="no-results">No students have attempted this quiz yet.</div>' : 
                    `<div class="results-container">${renderResultsByClass(allResults)}</div>`
            });
        }

        // Full page render
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Quiz Results - ${quizName}</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        padding: 20px;
                        background-color: #f8f9fa;
                        margin: 0;
                        color: #333;
                    }
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 30px;
                        flex-wrap: wrap;
                        gap: 15px;
                    }
                    .page-title {
                        margin: 0;
                        color: #4e73df;
                        font-size: 28px;
                    }
                    .back-btn {
                        padding: 10px 16px;
                        background-color: #36b9cc;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        text-decoration: none;
                        display: inline-block;
                        transition: background-color 0.3s;
                    }
                    .back-btn:hover {
                        background-color: #5a6268;
                    }
                    .export-btn {
                        padding: 10px 16px;
                        background-color: #28a745;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        text-decoration: none;
                        display: inline-block;
                        transition: background-color 0.3s;
                        margin-left: 10px;
                    }
                    .export-btn:hover {
                        background-color: #218838;
                    }
                    .quiz-info {
                        background: white;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                        margin-bottom: 30px;
                    }
                    .results-container {
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                        overflow: hidden;
                    }
                    .class-header {
                        background-color: #007bff;
                        color: white;
                        padding: 15px 20px;
                        font-weight: 600;
                        margin-top: 20px;
                    }
                    .results-table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    .results-table th {
                        background-color: #f2f2f2;
                        padding: 15px;
                        text-align: left;
                        font-weight: 600;
                    }
                    .results-table td {
                        padding: 12px 15px;
                        border-bottom: 1px solid #eee;
                    }
                    .results-table tr:last-child td {
                        border-bottom: none;
                    }
                    .results-table tr:hover {
                        background-color: #f8f9fa;
                    }
                    .percentage-cell {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    .percentage-bar {
                        flex-grow: 1;
                        height: 10px;
                        background-color: #e3f2fd;
                        border-radius: 5px;
                        overflow: hidden;
                    }
                    .percentage-fill {
                        height: 100%;
                        background-color: #4CAF50;
                    }
                    .no-results {
                        text-align: center;
                        padding: 40px;
                        color: #666;
                        font-style: italic;
                        font-size: 16px;
                    }
                    .refresh-status {
                        margin-left: 10px;
                        font-size: 14px;
                        color: #6c757d;
                    }
                    .button-group {
                        display: flex;
                        gap: 10px;
                    }
                    @media (max-width: 768px) {
                        .header {
                            flex-direction: column;
                            align-items: flex-start;
                        }
                        .results-table {
                            display: block;
                            overflow-x: auto;
                        }
                        .button-group {
                            flex-direction: column;
                            width: 100%;
                        }
                        .button-group .back-btn,
                        .button-group .export-btn,
                        .button-group #refreshBtn {
                            width: 100%;
                            margin-left: 0;
                            margin-top: 5px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 class="page-title">Quiz Results: ${quizName}</h1>
                        <div class="button-group">
                            <a href="/admin/total-quiz" class="back-btn">Back</a>
                            <a href="/admin/quiz-results/${encodeURIComponent(quizName)}?export=excel" class="export-btn">Export to Excel</a>
                            <button id="refreshBtn" class="back-btn">
                                ↻ Refresh
                            </button>
                            <span id="refreshStatus" class="refresh-status"></span>
                        </div>
                    </div>
                    
                    <div class="quiz-info">
                        <p>Total Students Attempted: <span id="attemptCount">${allResults.length}</span></p>
                    </div>

                    <div id="resultsContainer">
                        ${allResults.length === 0 ? 
                            '<div class="no-results">No students have attempted this quiz yet.</div>' : 
                            `<div class="results-container">${renderResultsByClass(allResults)}</div>`
                        }
                    </div>
                </div>

                <script>
                    // Auto-refresh every 30 seconds
                    let refreshInterval = setInterval(fetchUpdatedResults, 30000);
                    let isFetching = false;
                    
                    // Manual refresh button
                    document.getElementById('refreshBtn').addEventListener('click', function() {
                        if (!isFetching) {
                            fetchUpdatedResults();
                        }
                    });
                    
                    // Fetch updated results without page reload
                    async function fetchUpdatedResults() {
                        if (isFetching) return;
                        
                        isFetching = true;
                        const statusEl = document.getElementById('refreshStatus');
                        statusEl.textContent = 'Refreshing...';
                        statusEl.style.color = '#6c757d';
                        
                        try {
                            const response = await fetch(window.location.pathname + '?partial=true', {
                                headers: {
                                    'Cache-Control': 'no-cache'
                                }
                            });
                            
                            if (!response.ok) throw new Error('Failed to fetch');
                            
                            const data = await response.json();
                            
                            // Update the results container
                            if (data.html) {
                                document.getElementById('resultsContainer').innerHTML = data.html;
                                document.getElementById('attemptCount').textContent = data.count;
                                statusEl.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
                                statusEl.style.color = '#28a745';
                            }
                        } catch (error) {
                            console.error('Error fetching updated results:', error);
                            statusEl.textContent = 'Refresh failed';
                            statusEl.style.color = '#dc3545';
                        } finally {
                            isFetching = false;
                            
                            // Reset status message after 5 seconds
                            setTimeout(() => {
                                if (!isFetching) {
                                    statusEl.textContent = '';
                                }
                            }, 5000);
                        }
                    }
                    
                    // Initial fetch to set the last updated time
                    window.addEventListener('DOMContentLoaded', () => {
                        const statusEl = document.getElementById('refreshStatus');
                        statusEl.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
                        statusEl.style.color = '#28a745';
                    });
                    
                    // Clean up interval when leaving the page
                    window.addEventListener('beforeunload', function() {
                        clearInterval(refreshInterval);
                    });
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Error loading quiz results:', err);
        
        if (req.query.partial) {
            return res.status(500).json({ error: 'Error loading results' });
        }
        
        res.status(500).send(`
            <div class="container">
                <div class="header">
                    <h1 class="page-title">Quiz Results: ${quizName}</h1>
                    <a href="/admin/total-quiz" class="back-btn">← Back</a>
                </div>
                <div class="quiz-info">
                    <p style="color: #dc3545;">Error loading quiz results. Please try again later.</p>
                    <p>Error details: ${err.message}</p>
                </div>
            </div>
        `);
    }
});


// Helper function to render results grouped by class
function renderResultsByClass(results) {
    // Group results by class
    const resultsByClass = results.reduce((acc, result) => {
        if (!acc[result.class]) {
            acc[result.class] = [];
        }
        acc[result.class].push(result);
        return acc;
    }, {});
    
    let html = '';
    
    for (const [classNum, classResults] of Object.entries(resultsByClass)) {
        html += `
            <div class="class-group">
                <div class="class-header">Class ${classNum}</div>
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Student Name</th>
                            <th>Email</th>
                            <th>Score</th>
                            <th>Percentage</th>
                            <th>Attempted At</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${classResults.map(result => `
                            <tr>
                                <td>${result.name}</td>
                                <td>${result.email}</td>
                                <td>${result.score}/${result.totalQuestions}</td>
                                <td class="percentage-cell">
                                    ${result.percentage}%
                                    <div class="percentage-bar">
                                        <div class="percentage-fill" style="width: ${result.percentage}%"></div>
                                    </div>
                                </td>
                                <td>${new Date(result.attemptedAt).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    return html;
}

module.exports = router;
