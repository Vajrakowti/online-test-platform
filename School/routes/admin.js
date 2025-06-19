const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');
const excel = require('exceljs');
const xlsx = require('xlsx');
const Quiz = require('../models/Quiz');

// MongoDB connection URL
const url = process.env.MONGODB_URI || "mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles";

// Sidebar template for all admin pages
const ADMIN_SIDEBAR = `
<div class="sidebar">
  <div class="sidebar-header">
    <i class="fas fa-graduation-cap"></i>
    <div class="sidebar-title">
      <h1>Test</h1>
      <h1>Platform</h1>
    </div>
  </div>
  <div class="sidebar-divider"></div>
  <div class="sidebar-menu">
    <a href="/admin" class="sidebar-item">
      <i class="fas fa-home"></i>
      <span>Dashboard</span>
    </a>
    
    <!-- Students Dropdown -->
    <div class="sidebar-dropdown">
      <a href="javascript:void(0)" class="sidebar-item dropdown-toggle">
        <i class="fas fa-users"></i>
        <span>Students</span>
        <i class="fas fa-chevron-down dropdown-icon"></i>
      </a>
      <div class="dropdown-menu">
        <a href="/admin/add-student" class="dropdown-item">Add Students</a>
        <a href="/admin/students" class="dropdown-item">View Students</a>
      </div>
    </div>
    
    <!-- Quizzes Dropdown -->
    <div class="sidebar-dropdown">
      <a href="javascript:void(0)" class="sidebar-item dropdown-toggle">
        <i class="fas fa-clipboard-list"></i>
        <span>Quizzes</span>
        <i class="fas fa-chevron-down dropdown-icon"></i>
      </a>
      <div class="dropdown-menu">
        <a href="/admin/create-quiz" class="dropdown-item">Create Quiz</a>
        <a href="/admin/total-quiz" class="dropdown-item">View Quizzes</a>
      </div>
    </div>
    
    <!-- Student-Specific Quiz -->
    <a href="/admin/retake-quiz" class="sidebar-item">
      <i class="fas fa-user-check"></i>
      <span>Student-Specific Quiz</span>
    </a>
    
    <!-- Messages -->
    <a href="/admin/messages" class="sidebar-item">
      <i class="fas fa-envelope"></i>
      <span>Student Messages</span>
    </a>
  </div>
  <div class="signout-container" style="margin-top:auto; padding: 15px 20px; border-top: 1px solid rgba(255,255,255,0.1);">
    <button onclick="window.location.href='/admin/logout'" class="logout-btn" style="background-color: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: 500; display: flex; align-items: center; gap: 8px;">
      <i class="fas fa-sign-out-alt"></i>
      Logout
    </button>
  </div>
</div>
`;

// Admin common scripts for all pages
const ADMIN_SCRIPTS = `
<script>
  // Toggle dropdown menus
  document.addEventListener('DOMContentLoaded', function() {
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
    
    dropdownToggles.forEach(toggle => {
      toggle.addEventListener('click', function() {
        const parent = this.parentElement;
        const dropdownMenu = parent.querySelector('.dropdown-menu');
        
        // Close all other dropdowns
        document.querySelectorAll('.sidebar-dropdown .dropdown-menu').forEach(menu => {
          if (menu !== dropdownMenu) {
            menu.classList.remove('show');
          }
        });
        
        // Toggle current dropdown
        dropdownMenu.classList.toggle('show');
        this.classList.toggle('active');
      });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(event) {
      if (!event.target.closest('.sidebar-dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
          menu.classList.remove('show');
        });
        document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
          toggle.classList.remove('active');
        });
      }
    });
  });
</script>
`;

// Sidebar CSS for all admin pages
const SIDEBAR_CSS = `
.admin-container {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 260px;
  min-height: 100vh;
  background-color: #4361ee;
  color: white;
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 100;
}

.sidebar-header {
  display: flex;
  align-items: center;
  padding: 0 20px;
  margin-bottom: 20px;
}

.sidebar-header i {
  font-size: 2.5rem;
  margin-right: 12px;
}

.sidebar-title {
  display: flex;
  flex-direction: column;
}

.sidebar-title h1 {
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
}

.sidebar-divider {
  height: 1px;
  background-color: rgba(255, 255, 255, 0.2);
  margin: 15px 0;
}

.sidebar-menu {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  color: white;
  text-decoration: none;
  transition: all 0.3s;
  border-radius: 0;
  font-weight: 500;
  font-size: 1.05rem;
}

.sidebar-item.active,
.sidebar-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
  font-weight: 700;
}

.sidebar-item i {
  font-size: 1.25rem;
  margin-right: 12px;
  width: 24px;
  text-align: center;
}

/* Dropdown styles */
.sidebar-dropdown {
  position: relative;
}

.dropdown-toggle {
  justify-content: space-between;
  cursor: pointer;
}

.dropdown-icon {
  margin-left: auto;
  margin-right: 0;
  transition: transform 0.3s;
  font-size: 0.8rem;
}

.dropdown-toggle.active .dropdown-icon {
  transform: rotate(180deg);
}

.dropdown-menu {
  display: none;
  background-color: rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.dropdown-menu.show {
  display: block;
}

.dropdown-item {
  display: block;
  padding: 10px 20px 10px 56px;
  color: white;
  text-decoration: none;
  transition: background-color 0.3s;
  font-size: 1rem;
}

.dropdown-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.main-content {
  flex: 1;
  margin-left: 260px;
  padding: 20px;
}

@media (max-width: 768px) {
  .sidebar {
    width: 70px;
    padding: 15px 0;
  }
  
  .sidebar-header {
    padding: 0 15px;
    justify-content: center;
  }
  
  .sidebar-title,
  .sidebar-item span,
  .dropdown-icon {
    display: none;
  }
  
  .sidebar-header i {
    margin-right: 0;
  }
  
  .sidebar-item {
    justify-content: center;
    padding: 12px;
  }
  
  .sidebar-item i {
    margin-right: 0;
  }
  
  .dropdown-item {
    padding: 12px;
    text-align: center;
  }
  
  .main-content {
    margin-left: 70px;
  }
}
`;

const QUIZ_FILE = path.join(__dirname, '../quizzes.json');
const uploadDir = path.join(__dirname, '..', 'uploads');
const QUIZ_IMAGES_DIR = path.join(__dirname, '../public/quiz-images');
const MANUAL_QUESTIONS_DIR = path.join(__dirname, '../manual-questions');

// Ensure directories exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(QUIZ_IMAGES_DIR)) {
  fs.mkdirSync(QUIZ_IMAGES_DIR, { recursive: true });
}
if (!fs.existsSync(MANUAL_QUESTIONS_DIR)) {
  fs.mkdirSync(MANUAL_QUESTIONS_DIR, { recursive: true });
}

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize quizzes.json if it doesn't exist
if (!fs.existsSync(QUIZ_FILE)) {
  fs.writeFileSync(QUIZ_FILE, '[]');
}

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
    // Ensure unique filename for each section file
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalExt = path.extname(file.originalname);
    cb(null, req.body.quizName + '-' + file.fieldname + '-' + uniqueSuffix + originalExt);
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
    try {
      // Ensure the upload directory exists with proper permissions
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true, mode: 0o777 });
      }
      console.log('Saving Excel file to directory:', uploadDir);
      cb(null, uploadDir);
    } catch (error) {
      console.error('Error setting upload destination:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    try {
      // For update route, use the quiz name from params if available
      const quizName = req.params.quizName ? decodeURIComponent(req.params.quizName) : req.body.quizName;
      const filename = `${quizName}${path.extname(file.originalname)}`;
      console.log('Saving Excel file as:', filename);
      cb(null, filename);
    } catch (error) {
      console.error('Error generating filename:', error);
      cb(error);
    }
  }
});

const uploadExcel = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
            // Ensure unique filename for each section file
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const originalExt = path.extname(file.originalname);
            // Use file.fieldname (e.g., 'sectionFiles[0]') to differentiate files from the same form field array
            cb(null, req.body.quizName + '-' + file.fieldname + '-' + uniqueSuffix + originalExt);
        }
    }),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
}).array('sectionFiles[]'); // Ensure this is .array for multiple files

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
  // Option images for question 0
  { name: 'questionOption1Image_0', maxCount: 1 },
  { name: 'questionOption2Image_0', maxCount: 1 },
  { name: 'questionOption3Image_0', maxCount: 1 },
  { name: 'questionOption4Image_0', maxCount: 1 },
  // Option images for question 1
  { name: 'questionOption1Image_1', maxCount: 1 },
  { name: 'questionOption2Image_1', maxCount: 1 },
  { name: 'questionOption3Image_1', maxCount: 1 },
  { name: 'questionOption4Image_1', maxCount: 1 },
  // Option images for question 2
  { name: 'questionOption1Image_2', maxCount: 1 },
  { name: 'questionOption2Image_2', maxCount: 1 },
  { name: 'questionOption3Image_2', maxCount: 1 },
  { name: 'questionOption4Image_2', maxCount: 1 },
  // Option images for question 3
  { name: 'questionOption1Image_3', maxCount: 1 },
  { name: 'questionOption2Image_3', maxCount: 1 },
  { name: 'questionOption3Image_3', maxCount: 1 },
  { name: 'questionOption4Image_3', maxCount: 1 },
  // Option images for question 4
  { name: 'questionOption1Image_4', maxCount: 1 },
  { name: 'questionOption2Image_4', maxCount: 1 },
  { name: 'questionOption3Image_4', maxCount: 1 },
  { name: 'questionOption4Image_4', maxCount: 1 },
  // Option images for question 5
  { name: 'questionOption1Image_5', maxCount: 1 },
  { name: 'questionOption2Image_5', maxCount: 1 },
  { name: 'questionOption3Image_5', maxCount: 1 },
  { name: 'questionOption4Image_5', maxCount: 1 },
  // Option images for question 6
  { name: 'questionOption1Image_6', maxCount: 1 },
  { name: 'questionOption2Image_6', maxCount: 1 },
  { name: 'questionOption3Image_6', maxCount: 1 },
  { name: 'questionOption4Image_6', maxCount: 1 },
  // Option images for question 7
  { name: 'questionOption1Image_7', maxCount: 1 },
  { name: 'questionOption2Image_7', maxCount: 1 },
  { name: 'questionOption3Image_7', maxCount: 1 },
  { name: 'questionOption4Image_7', maxCount: 1 },
  // Option images for question 8
  { name: 'questionOption1Image_8', maxCount: 1 },
  { name: 'questionOption2Image_8', maxCount: 1 },
  { name: 'questionOption3Image_8', maxCount: 1 },
  { name: 'questionOption4Image_8', maxCount: 1 },
  // Option images for question 9
  { name: 'questionOption1Image_9', maxCount: 1 },
  { name: 'questionOption2Image_9', maxCount: 1 },
  { name: 'questionOption3Image_9', maxCount: 1 },
  { name: 'questionOption4Image_9', maxCount: 1 },
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
  if (req.session.fname && req.session.role === 'admin') {
    res.sendFile(path.join(__dirname, "../public/admin.html"));
  } else {
    res.redirect("/login");
  }
});

// Create Quiz Page
router.get('/create-quiz', (req, res) => {
  if (req.session.fname && req.session.role === 'admin') {
    res.sendFile(path.join(__dirname, "../public/createquiz.html"));
  } else {
    res.redirect("/login");
  }
});

// Add Student Page
router.get('/add-student', (req, res) => {
  if (req.session.fname && req.session.role === 'admin') {
    res.sendFile(path.join(__dirname, "../public/addstudent.html"));
  } else {
    res.redirect("/login");
  }
});

// Handle Student Creation
router.post('/add-student', uploadStudentPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.session.fname || req.session.role !== 'admin') {
      return res.status(401).send('Unauthorized');
    }

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

    // Connect to MongoDB using the updated connection string
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Check if this is a custom class (not a standard class 1-10)
    const isCustomClass = !['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].includes(studentClass);
    
    if (isCustomClass) {
      // Add custom class to custom_classes collection if it doesn't exist
      const customClassesCollection = db.collection('custom_classes');
      const existingClass = await customClassesCollection.findOne({ 
        adminId: req.session.adminId, 
        className: studentClass 
      });
      
      if (!existingClass) {
        await customClassesCollection.insertOne({
          adminId: req.session.adminId,
          className: studentClass,
          createdAt: new Date()
        });
      }
    }
    
    // Insert into the appropriate class collection
    const collectionName = `class_${studentClass}`;
    await db.collection(collectionName).insertOne(studentData);
    
    // Also store in user collection for authentication
    await db.collection("user").insertOne({
      Username: username,
      Password: password,
      role: 'student'
    });

    client.close();

    res.redirect(`/admin/students/${encodeURIComponent(studentClass)}`);
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
  if (req.session.fname && req.session.role === 'admin') {
    res.sendFile(path.join(__dirname, "../public/students.html"));
  } else {
    res.redirect("/login");
  }
});

// View Students by Class (returns HTML fragment)
router.get('/students/:class', async (req, res) => {
    try {
        if (!req.session.fname || req.session.role !== 'admin') {
            return res.status(401).send('Unauthorized');
        }

        const classNumber = req.params.class;
        const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Fetch students from specific class
        const students = await db.collection(`class_${classNumber}`).find().toArray();
        client.close();

        // Render student list with enhanced design
        res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Students - Class ${classNumber}</title>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Poppins', sans-serif;
                }
                
                body {
                    background-color: #f5f7fa;
                    color: #333;
                }
                
                ${SIDEBAR_CSS}
                
                .student-container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
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
                    z-index: 1001;
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

                /* Edit Student Modal Styles */
                .student-photo-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    margin-bottom: 20px;
                }

                .student-photo-large {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 3px solid #4e73df;
                    margin-bottom: 10px;
                }

                .change-photo-btn {
                    background-color: #4e73df;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 5px 10px;
                    cursor: pointer;
                    font-size: 14px;
                }

                .button-group {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 20px;
                }

                .cancel-btn {
                    background-color: #6c757d;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 10px 15px;
                    cursor: pointer;
                }

                .save-btn {
                    background-color: #4e73df;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 10px 15px;
                    cursor: pointer;
                }
                
                /* Current page styling */
                .sidebar-item[href="/admin/students"] {
                    background-color: rgba(255, 255, 255, 0.2);
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="admin-container">
                ${ADMIN_SIDEBAR}
                <main class="main-content">
                    <div class="student-container">
                        <div class="card">
                            <div class="header">
                                <h2 class="card-title">
                                    Class ${classNumber}
                                    <span class="badge">${students.length} students</span>
                                </h2>
                                <div class="search-container">
                                    <input type="text" id="searchInput" placeholder="Type to search students..." autocomplete="off">
                                    <span class="student-count" id="studentCount">Showing ${students.length} students</span>
                                </div>
                            </div>
                            
                            <a href="/admin/students" class="back-btn">
                                <i class="fas fa-arrow-left"></i> Back to All Classes
                            </a>
                            
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
                                                            <span class="student-name">${student.name}</span>
                                                        </div>
                                                    </td>
                                                    <td>${student.email}</td>
                                                    <td>${student.username}</td>
                                                    <td>${student.password}</td>
                                                    <td>${student.dob}</td>
                                                    <td>${student.phone}</td>
                                                    <td class="actions">
                                                        <button class="action-btn edit-btn" data-id="${student.username}" data-class="${student.class}">Edit</button>
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
                    </div>
                </main>
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

            <!-- Edit Student Modal -->
            <div id="editModal" class="modal">
                <div class="modal-content">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                        <h2 style="margin: 0; color: #4e73df;">Edit Student Information</h2>
                        <span class="close" style="font-size: 24px; cursor: pointer;">&times;</span>
                    </div>
                    <div class="edit-student-container">
                        <div class="student-photo-container">
                            <img id="studentPhotoPreview" class="student-photo-large" src="/images/default-user.png">
                            <button type="button" id="changePhotoBtn" class="change-photo-btn">Change Photo</button>
                        </div>
                        <form id="editStudentForm" enctype="multipart/form-data" method="post">
                            <input type="hidden" id="studentUsername" name="username">
                            <input type="hidden" id="currentClass" name="currentClass">
                            <input type="file" id="photoInput" name="photo" accept="image/*" style="display: none;">
                            
                            <div class="form-group">
                                <label for="fullName">Full Name</label>
                                <input type="text" id="fullName" name="name" required style="border-radius: 5px; padding: 12px; border: 1px solid #ddd; transition: all 0.3s">
                            </div>
                            
                            <div class="form-group">
                                <label for="emailAddress">Email Address</label>
                                <input type="email" id="emailAddress" name="email" required style="border-radius: 5px; padding: 12px; border: 1px solid #ddd; transition: all 0.3s">
                            </div>
                            
                            <div class="form-group">
                                <label for="phoneNumber">Phone Number</label>
                                <input type="tel" id="phoneNumber" name="phone" required style="border-radius: 5px; padding: 12px; border: 1px solid #ddd; transition: all 0.3s">
                            </div>
                            
                            <div class="form-group">
                                <label for="dateOfBirth">Date of Birth</label>
                                <input type="date" id="dateOfBirth" name="dob" required style="border-radius: 5px; padding: 12px; border: 1px solid #ddd; transition: all 0.3s">
                            </div>
                            
                            <div class="form-group">
                                <label for="studentClass">Class</label>
                                <select id="studentClass" name="studentClass" style="border-radius: 5px; padding: 12px; border: 1px solid #ddd; transition: all 0.3s">
                                    <option value="1">Class 1</option>
                                    <option value="2">Class 2</option>
                                    <option value="3">Class 3</option>
                                    <option value="4">Class 4</option>
                                    <option value="5">Class 5</option>
                                    <option value="6">Class 6</option>
                                    <option value="7">Class 7</option>
                                    <option value="8">Class 8</option>
                                    <option value="9">Class 9</option>
                                    <option value="10">Class 10</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="newPassword">New Password</label>
                                <input type="password" id="newPassword" name="newPassword" placeholder="Leave blank to keep current password" style="border-radius: 5px; padding: 12px; border: 1px solid #ddd; transition: all 0.3s">
                            </div>
                            
                            <div class="button-group">
                                <button type="button" id="cancelEditBtn" class="cancel-btn">Cancel</button>
                                <button type="submit" class="save-btn">Save Changes</button>
                            </div>
                        </form>
                    </div>
                    <div id="editStatus" style="margin-top: 15px;"></div>
                </div>
            </div>

            <style>
                /* Improved Modal Styles */
                .modal {
                    display: none;
                    position: fixed;
                    z-index: 1000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    overflow: auto;
                    background-color: rgba(0,0,0,0.5);
                }
                .modal-content {
                    background-color: #fefefe;
                    margin: 2% auto;
                    padding: 25px;
                    border: 1px solid #ddd;
                    width: 90%;
                    max-width: 600px;
                    border-radius: 8px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                    position: relative;
                    z-index: 1001;
                    animation: modalOpen 0.3s ease-out;
                }
                @keyframes modalOpen {
                    from {opacity: 0; transform: translateY(-20px);}
                    to {opacity: 1; transform: translateY(0);}
                }
                .edit-student-container {
                    padding: 10px 0;
                }
                .student-photo-container {
                    text-align: center;
                    margin-bottom: 20px;
                }
                .student-photo-large {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 3px solid #4e73df;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    display: block;
                    margin: 0 auto 10px;
                }
                .change-photo-btn {
                    background-color: #4e73df;
                    color: white;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background-color 0.3s;
                }
                .change-photo-btn:hover {
                    background-color: #3756a4;
                }
                .form-group {
                    margin-bottom: 20px;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 500;
                    color: #333;
                }
                .form-group input:focus,
                .form-group select:focus {
                    border-color: #4e73df !important;
                    box-shadow: 0 0 0 2px rgba(78, 115, 223, 0.25) !important;
                    outline: none;
                }
                .button-group {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 25px;
                }
                .cancel-btn {
                    background-color: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background-color 0.3s;
                }
                .cancel-btn:hover {
                    background-color: #5a6268;
                }
                .save-btn {
                    background-color: #4e73df;
                    color: white;
                    border: none;
                    padding: 10px 25px;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background-color 0.3s;
                }
                .save-btn:hover {
                    background-color: #2e59d9;
                }
            </style>

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
                        'Showing ' + visibleCount + ' of ' + (rows.length - 1) + ' students';
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
                            const studentClass = this.getAttribute('data-class');
                            
                            // Get the edit modal
                            const editModal = document.getElementById('editModal');
                            const editModalClose = editModal.querySelector('.close');
                            const editStatus = document.getElementById('editStatus');
                            
                            // Clear previous status
                            editStatus.innerHTML = '';
                            
                            // Show loading message
                            editStatus.innerHTML = '<p style="color: #007bff;">Loading student data...</p>';
                            
                            // Show modal
                            editModal.style.display = 'block';
                            
                            // Fetch student data
                            fetch('/admin/api/student/' + username)
                                .then(response => {
                                    if (!response.ok) {
                                        throw new Error('Failed to fetch student data');
                                    }
                                    return response.json();
                                })
                                .then(student => {
                                    console.log('Student data:', student);
                                    // Populate form with student data
                                    document.getElementById('studentUsername').value = student.username;
                                    document.getElementById('fullName').value = student.name;
                                    document.getElementById('emailAddress').value = student.email;
                                    document.getElementById('phoneNumber').value = student.phone;
                                    document.getElementById('dateOfBirth').value = student.dob;
                                    document.getElementById('studentClass').value = student.class;
                                    document.getElementById('currentClass').value = student.class;
                                    
                                    // Display student photo
                                    const photoPreview = document.getElementById('studentPhotoPreview');
                                    if (student.photo) {
                                        photoPreview.src = student.photo;
                                    } else {
                                        photoPreview.src = '/images/default-user.png';
                                    }
                                    
                                    // Clear status
                                    editStatus.innerHTML = '';
                                })
                                .catch(error => {
                                    console.error('Error:', error);
                                    editStatus.innerHTML = '<p style="color: #dc3545;">Error: ' + error.message + '</p>';
                                });
                        });
                    });
                    
                    // Delete button functionality
                    document.querySelectorAll('.delete-btn').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const username = this.getAttribute('data-id');
                            const row = this.closest('tr');
                            if (confirm('Are you sure you want to delete student: ' + username + '?')) {
                                // AJAX call to delete student
                                fetch('/admin/students/delete/' + username, {
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
                    
                    // Email Modal Functionality
                    const emailModal = document.getElementById('emailModal');
                    if (emailModal) {
                        const emailModalClose = emailModal.querySelector('.close');
                const emailForm = document.getElementById('emailForm');
                const studentNameSpan = document.getElementById('studentName');
                const studentEmailInput = document.getElementById('studentEmail');
                const emailStatus = document.getElementById('emailStatus');
                let attachments = [];

                // Email button click handler
                        document.querySelectorAll('.email-btn').forEach(btn => {
                            btn.addEventListener('click', function() {
                                const studentName = this.getAttribute('data-name');
                                const studentEmail = this.getAttribute('data-email');
                        
                        studentNameSpan.textContent = studentName;
                        studentEmailInput.value = studentEmail;
                        emailForm.reset();
                        attachments = [];
                        document.getElementById('attachmentList').innerHTML = '';
                        emailStatus.innerHTML = '';
                                emailModal.style.display = 'block';
                            });
                });

                // Close modal
                        if (emailModalClose) {
                            emailModalClose.addEventListener('click', function() {
                                emailModal.style.display = 'none';
                            });
                }

                // Close modal when clicking outside
                        window.addEventListener('click', function(event) {
                            if (event.target == emailModal) {
                                emailModal.style.display = 'none';
                            }
                        });

                // Add attachment
                        const addAttachmentBtn = document.getElementById('addAttachment');
                        if (addAttachmentBtn) {
                            addAttachmentBtn.addEventListener('click', function() {
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
                        }

                // Remove attachment
                        const attachmentList = document.getElementById('attachmentList');
                        if (attachmentList) {
                            attachmentList.addEventListener('click', function(e) {
                    if (e.target.tagName === 'BUTTON' && e.target.hasAttribute('data-index')) {
                        const index = parseInt(e.target.getAttribute('data-index'));
                        attachments.splice(index, 1);
                        e.target.parentElement.remove();
                    }
                });
                        }

                // Send email
                        if (emailForm) {
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
                                            emailModal.style.display = 'none';
                        }, 1500);
                    } else {
                        emailStatus.innerHTML = '<p style="color: #dc3545;">Error: ' + data.message + '</p>';
                }
            })
            .catch(function(error) {
                emailStatus.innerHTML = '<p style="color: #dc3545;">Error: ' + error.message + '</p>';
                                });
                            });
                        }
                    }
                });
                
                // Update visible student count
                function updateStudentCount() {
                    const table = document.getElementById('studentTable');
                    if (!table) return;
                    
                    const visibleRows = Array.from(table.querySelectorAll('tbody tr'))
                        .filter(row => row.style.display !== 'none');
                    
                    document.getElementById('studentCount').textContent = 
                        'Showing ' + visibleRows.length + ' of ' + (table.rows.length - 1) + ' students';
                }
                
                // Edit Student Modal Functionality
                const editModal = document.getElementById('editModal');
                const editModalClose = editModal.querySelector('.close');
                const cancelEditBtn = document.getElementById('cancelEditBtn');
                const changePhotoBtn = document.getElementById('changePhotoBtn');
                const photoInput = document.getElementById('photoInput');
                
                // Close modal when clicking X button - Using a click event handler with stopPropagation
                editModalClose.addEventListener('click', function(e) {
                    e.stopPropagation();
                    editModal.style.display = 'none';
                });
                
                // Close modal when clicking Cancel button - Using a click event handler with stopPropagation
                cancelEditBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    editModal.style.display = 'none';
                });
                
                // Only close modal when clicking directly on the background, not on any children
                window.addEventListener('click', function(event) {
                    if (event.target === editModal) {
                        editModal.style.display = 'none';
                    }
                });
                
                // Prevent accidental closings when clicking inside the modal
                const modalContent = editModal.querySelector('.modal-content');
                modalContent.addEventListener('click', function(e) {
                    e.stopPropagation(); // Stop click from reaching the window event listener
                });
                
                // Change photo functionality
                changePhotoBtn.addEventListener('click', function(e) {
                    e.stopPropagation(); // Prevent event from bubbling up
                    photoInput.click();
                });
                
                // Preview uploaded photo
                photoInput.addEventListener('change', function(e) {
                    if (this.files && this.files[0]) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            document.getElementById('studentPhotoPreview').src = e.target.result;
                        }
                        reader.readAsDataURL(this.files[0]);
                    }
                });
                
                const editForm = document.getElementById('editStudentForm');
                if (editForm) {
                    editForm.addEventListener('submit', function(e) {
                        e.preventDefault();
                        
                        const editStatusEl = document.getElementById('editStatus');
                        editStatusEl.innerHTML = '<p style="color: #007bff;">Updating student information...</p>';
                        
                        const formData = new FormData(editForm);
                        
                        // Debug info
                        console.log('Form data:');
                        for (let [key, value] of formData.entries()) {
                            console.log(key + ': ' + value);
                        }
                        
                        fetch('/admin/api/student/update', {
                            method: 'POST',
                            body: formData
                        })
                        .then(response => {
                            console.log('Server response status:', response.status);
                            if (!response.ok) {
                                return response.json().then(data => {
                                    console.error('Error details:', data);
                                    throw new Error(data.message || 'Failed to update student');
                                });
                            }
                            return response.json();
                        })
                        .then(data => {
                            console.log('Update success:', data);
                            if (data.success) {
                                editStatusEl.innerHTML = '<p style="color: #28a745;">Student information updated successfully!</p>';
                                
                                // Refresh the page after a short delay to show updated info
                                setTimeout(function() {
                                    window.location.reload();
                                }, 1500);
                            } else {
                                editStatusEl.innerHTML = '<p style="color: #dc3545;">Error: ' + (data.message || 'Unknown error') + '</p>';
                            }
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            editStatusEl.innerHTML = '<p style="color: #dc3545;">Error: ' + error.message + '</p>';
                        });
                    });
                }
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
        if (!req.session.fname || req.session.role !== 'admin') {
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
      if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).send('Unauthorized');
      }
  
      const username = req.params.username;
      const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
      await client.connect();
      const db = client.db(req.session.adminDb);
      
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
router.post('/create-quiz', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).send('Unauthorized');
  }
  
  uploadExcel(req, res, async function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).send('Error uploading files: ' + err.message);
    } else if (err) {
      console.error('Unknown error:', err);
      return res.status(500).send('Unknown error occurred');
    }

    try {
      const { quizName, quizClass, startTime, endTime } = req.body;
      const sectionNames = Array.isArray(req.body.sectionNames) ? req.body.sectionNames : [req.body.sectionNames];
      const sectionFiles = req.files || [];

      // Get negative marking value, default to 0 if not provided
      const negativeMarking = parseFloat(req.body.negativeMarking) || 0;
      if (negativeMarking < 0 || negativeMarking > 1) {
        throw new Error('Negative marking must be between 0 and 1');
      }

      // Get question marks value, default to 1 if not provided
      const questionMarks = parseInt(req.body.questionMarks) || 1;
      if (questionMarks < 1) {
        throw new Error('Question marks must be at least 1');
      }

      if (!sectionFiles || sectionFiles.length === 0) {
        throw new Error('No Excel files uploaded');
      }

      if (sectionNames.length !== sectionFiles.length) {
        throw new Error('Number of section names must match number of files');
      }

      // Create quiz object with sections
      const quiz = {
        name: quizName,
        class: quizClass,
        examDate: new Date(req.body.examDate),
        testDuration: parseInt(req.body.testDuration),
        startTime: startTime,
        endTime: endTime,
        type: 'excel',
        sections: sectionNames.map((name, index) => ({
          name: name,
          file: sectionFiles[index].filename
        })),
        negativeMarking: negativeMarking,
        questionMarks: questionMarks,
        createdAt: new Date()
      };

      // Store in MongoDB
      const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
      await client.connect();
      const db = client.db(req.session.adminDb);
      
      // Check if quiz already exists in MongoDB
      const existingQuiz = await db.collection('quizzes').findOne({ name: quizName });
      if (existingQuiz) {
        // Delete the uploaded files since quiz already exists
        sectionFiles.forEach(file => {
          const filePath = path.join(uploadDir, file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
        throw new Error('Quiz with this name already exists');
      }

      // Insert into MongoDB
      await db.collection('quizzes').insertOne(quiz);
      console.log('Quiz object to be stored in MongoDB:', quiz);
      console.log('Filenames in uploaded sectionFiles:', sectionFiles.map(f => f.filename));

      res.redirect('/admin/total-quiz');
    } catch (err) {
      console.error('Error creating quiz:', err);
      res.status(500).send(`
        <div style="padding: 20px; background: #ffeeee; color: #ff0000; border-radius: 5px;">
          <h3>Error creating quiz</h3>
          <p>${err.message}</p>
          <a href="/admin/create-quiz" style="color: #007bff;">Try again</a>
        </div>
      `);
    }
  });
});

// Handle Manual Quiz Creation
router.post('/create-quiz-manual', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).send('Unauthorized');
  }
  uploadQuizImage(req, res, async function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).send('Error uploading files: ' + err.message);
    } else if (err) {
      console.error('Unknown error:', err);
      return res.status(500).send('Unknown error occurred');
    }

    try {
      const { quizName, quizClass, startTime, endTime } = req.body;

      // Validate required fields
      if (!quizName || !quizClass || !startTime || !endTime) {
        throw new Error('Missing required quiz information');
      }

      // Get negative marking value, default to 0 if not provided
      const negativeMarking = parseFloat(req.body.negativeMarking) || 0;
      if (negativeMarking < 0 || negativeMarking > 1) {
        throw new Error('Negative marking must be between 0 and 1');
      }
      
      // Get question marks value, default to 1 if not provided
      const questionMarks = parseInt(req.body.questionMarks) || 1;
      if (questionMarks < 1) {
        throw new Error('Question marks must be at least 1');
      }
      
      // Process questions using new field format
      const questions = [];
      
      // Get indices of questions
      const indices = req.body.questionIndex ? 
        (Array.isArray(req.body.questionIndex) ? req.body.questionIndex : [req.body.questionIndex]) : [];
      
      if (!indices || indices.length === 0) {
        throw new Error('No questions found in form data');
      }

      // Process each question
      for (const index of indices) {
        const questionObj = {
          question: req.body[`question_${index}`],
          options: [
            req.body[`option1_${index}`],
            req.body[`option2_${index}`],
            req.body[`option3_${index}`],
            req.body[`option4_${index}`]
          ],
          correctAnswer: parseInt(req.body[`correctAnswer_${index}`]),
          optionImages: [null, null, null, null]
        };

        // Process question image
        const questionImages = req.files ? (req.files[`questionImage_${index}`] || []) : [];
        if (questionImages.length > 0) {
          questionObj.questionImage = `/quiz-images/${questionImages[0].filename}`;
        }

        // Process option images
        for (let i = 1; i <= 4; i++) {
          const optionImages = req.files ? (req.files[`questionOption${i}Image_${index}`] || []) : [];
          if (optionImages.length > 0) {
            questionObj.optionImages[i-1] = `/quiz-images/${optionImages[0].filename}`;
          }
        }

        questions.push(questionObj);
      }

      // Validate we have at least one question
      if (questions.length === 0) {
        throw new Error('No questions provided. Please check the form data.');
      }

      // Create quiz object
      const quiz = {
        name: quizName,
        class: quizClass,
        examDate: new Date(req.body.examDate),
        testDuration: parseInt(req.body.testDuration),
        startTime: startTime,
        endTime: endTime,
        type: 'manual',
        sections: [{
          name: 'Questions',
          description: 'Quiz Questions',
          file: '',
          questions: questions
        }],
        negativeMarking: negativeMarking,
        questionMarks: questionMarks
      };

      // Store in MongoDB
      const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
      await client.connect();
      const db = client.db(req.session.adminDb);
      
      // Check if quiz already exists in MongoDB
      const existingQuiz = await db.collection('quizzes').findOne({ name: quizName });
      if (existingQuiz) {
        throw new Error('Quiz with this name already exists');
      }

      // Insert into MongoDB
      await db.collection('quizzes').insertOne(quiz);
      console.log('Quiz stored in MongoDB:', quiz);
      
      await client.close();
      res.redirect('/admin/total-quiz');
    } catch (error) {
      console.error('Error creating manual quiz:', error);
      res.status(500).send('Error creating quiz: ' + error.message);
    }
  });
});

// Show Total Quizzes
router.get('/total-quiz', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
      return res.redirect("/login");
    }
  
    try {
      const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
      await client.connect();
      const db = client.db(req.session.adminDb);
      
      // Get quizzes from MongoDB
      const quizzes = await db.collection('quizzes').find().toArray();
      await client.close();
      
      // Get current time to determine quiz status (active, upcoming, ended)
      const now = getISTNow();
      const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
      const currentDate = now.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
      
      res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Total Quizzes</title>
          <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
          <style>
              * {
                  box-sizing: border-box;
                  font-family: 'Poppins', sans-serif;
              }
              body {
                  margin: 0;
                  background-color: #f5f7fa;
                  color: #333;
              }
              
              ${SIDEBAR_CSS}
              
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
              .status-badge {
                  display: inline-block;
                  padding: 4px 8px;
                  border-radius: 4px;
                  font-size: 12px;
                  font-weight: 600;
              }
              .status-active {
                  background-color: #e8f5e9;
                  color: #2e7d32;
              }
              .status-upcoming {
                  background-color: #e3f2fd;
                  color: #1565c0;
              }
              .status-ended {
                  background-color: #f5f5f5;
                  color: #757575;
              }
              .actions-cell {
                  display: flex;
                  gap: 8px;
              }
              .edit-link {
                  color: #ff9800;
                  text-decoration: none;
                  font-weight: 500;
              }
              .edit-link:hover {
                  text-decoration: underline;
              }
              .view-link {
                  color: #4caf50;
                  text-decoration: none;
                  font-weight: 500;
              }
              .view-link:hover {
                  text-decoration: underline;
              }
              
              .btn-create {
                  padding: 10px 16px;
                  background-color: #4e73df;
                  color: white;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  text-decoration: none;
                  display: inline-flex;
                  align-items: center;
                  gap: 8px;
                  transition: background-color 0.3s;
                  margin-bottom: 20px;
              }
              
              .btn-create:hover {
                  background-color: #3a59c7;
              }
              
              /* Current page styling */
              .sidebar-item[href="/admin/total-quiz"] {
                  background-color: rgba(255, 255, 255, 0.2);
                  font-weight: bold;
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
          <div class="admin-container">
              ${ADMIN_SIDEBAR}
              <main class="main-content">
                  <div class="container">
                      <div class="header">
                          <h1 class="page-title">Total Quizzes</h1>
                          <div class="search-container">
                              <input type="text" id="searchInput" placeholder="Search quizzes by name..." autocomplete="off">
                              <span class="quiz-count" id="quizCount">Showing ${quizzes.length} quizzes</span>
                          </div>
                      </div>
                      
                      <a href="/admin/create-quiz" class="btn-create">
                          <i class="fas fa-plus"></i> Create New Quiz
                      </a>
                      
                      ${quizzes.length === 0 ? 
                          '<div class="no-quizzes">No quizzes available. Click "Create New Quiz" to add a quiz.</div>' : 
                          `
                          <div style="overflow-x: auto;">
                              <table class="quiz-table" id="quizTable">
                                  <thead>
                                      <tr>
                                          <th>Quiz Name</th>
                                          <th>Class</th>
                                          <th>Time</th>
                                          <th>Status</th>
                                          <th>Type</th>
                                          <th>Actions</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      ${quizzes.map(quiz => {
                                          // Determine quiz status based on time
                                          let statusClass = '';
                                          let statusText = '';
                                          
                                          // Parse quiz times
                                          const startParts = quiz.startTime.split(':');
                                          const endParts = quiz.endTime.split(':');
                                          
                                          const startHour = parseInt(startParts[0]);
                                          const startMinute = parseInt(startParts[1]);
                                          const endHour = parseInt(endParts[0]);
                                          const endMinute = parseInt(endParts[1]);
                                          
                                          const now = getISTNow();
                                          const currentHour = now.getHours();
                                          const currentMinute = now.getMinutes();
                                          
                                          if (currentHour < startHour || (currentHour === startHour && currentMinute < startMinute)) {
                                              statusClass = 'status-upcoming';
                                              statusText = 'Upcoming';
                                          } else if (currentHour > endHour || (currentHour === endHour && currentMinute > endMinute)) {
                                              statusClass = 'status-ended';
                                              statusText = 'Ended';
                                          } else {
                                              statusClass = 'status-active';
                                              statusText = 'Active';
                                          }
                                          
                                          return `
                                              <tr>
                                                  <td>${quiz.name}</td>
                                                  <td>Class ${quiz.class}</td>
                                                  <td class="time-cell">
                                                      <span class="time-badge">Date: ${new Date(quiz.examDate).toLocaleDateString()}</span>
                                                      <span class="time-badge">Duration: ${quiz.testDuration} mins</span>
                                                      <span class="time-badge">Available: ${quiz.startTime} - ${quiz.endTime}</span>
                                                  </td>
                                                  <td>
                                                      <span class="status-badge ${statusClass}">${statusText}</span>
                                                  </td>
                                                  <td>${quiz.type === 'excel' ? 'Excel' : 'Manual'}</td>
                                                  <td class="actions-cell">
                                                      <a href="/admin/edit-quiz/${encodeURIComponent(quiz.name)}" class="edit-link">Edit</a>
                                                      <a href="/admin/quiz-results/${encodeURIComponent(quiz.name)}" class="view-link">Results</a>
                                                  </td>
                                              </tr>
                                          `;
                                      }).join('')}
                                  </tbody>
                              </table>
                          </div>
                          `
                      }
                  </div>
              </main>
          </div>

          <script>
              // Search functionality
              document.getElementById('searchInput').addEventListener('input', function() {
                  const searchValue = this.value.toLowerCase();
                  const table = document.getElementById('quizTable');
                  
                  if (!table) return; // No table exists
                  
                  const rows = table.getElementsByTagName('tr');
                  let visibleCount = 0;
                  
                  // Start from 1 to skip header row
                  for (let i = 1; i < rows.length; i++) {
                      const nameCell = rows[i].cells[0];
                      const classCell = rows[i].cells[1];
                      
                      if (nameCell.textContent.toLowerCase().includes(searchValue) || 
                          classCell.textContent.toLowerCase().includes(searchValue)) {
                          rows[i].style.display = '';
                          visibleCount++;
                      } else {
                          rows[i].style.display = 'none';
                      }
                  }
                  
                  // Update count
                  document.getElementById('quizCount').textContent = 'Showing ' + visibleCount + ' of ' + (rows.length - 1) + ' quizzes';
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

// API endpoint to get quiz data for editing
router.get('/api/quiz/:quizName', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const quizName = decodeURIComponent(req.params.quizName);
        
        // Connect to MongoDB
        const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get quiz from MongoDB
        const quizzesCollection = db.collection('quizzes');
        const quiz = await quizzesCollection.findOne({ name: quizName });

        if (!quiz) {
            await client.close();
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Check if quiz has already started
        const now = getISTNow();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

        // Include if quiz has started in the response
        const hasStarted = quiz.startTime <= currentTime;

        // For manual quizzes, get the questions from MongoDB
        let questions = [];
        if (quiz.type === 'manual' && quiz.questionsFile) {
            const manualQuestionsCollection = db.collection('manual_questions');
            const manualQuiz = await manualQuestionsCollection.findOne({ quizName });
            if (manualQuiz) {
                questions = manualQuiz.questions;
            }
        }

        await client.close();

        res.json({
            ...quiz,
            hasStarted,
            questions: quiz.type === 'manual' ? questions : []
        });
    } catch (error) {
        console.error('Error fetching quiz data:', error);
        res.status(500).json({ error: 'Failed to fetch quiz data' });
    }
});

// Route to render the edit quiz page
router.get('/edit-quiz/:quizName', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.redirect("/login");
    }

    try {
        const quizName = decodeURIComponent(req.params.quizName);
        // Connect to MongoDB
        const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
        await client.connect();
        const db = client.db(req.session.adminDb);
        const quiz = await db.collection('quizzes').findOne({ name: quizName });
        await client.close();
        if (!quiz) {
            return res.status(404).send('Quiz not found');
        }
        // Serve the edit quiz HTML page
        res.sendFile(path.join(__dirname, "../public/editquiz.html"));
    } catch (error) {
        console.error('Error accessing edit quiz page:', error);
        res.status(500).send('Error accessing edit quiz page: ' + error.message);
    }
});

// Route to render the view-only quiz page
router.get('/view-quiz/:quizName', (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.redirect("/login");
    }

    try {
        const quizName = decodeURIComponent(req.params.quizName);
        const quizzes = readQuizzes();
        const quiz = quizzes.find(q => q.name === quizName);

        if (!quiz) {
            return res.status(404).send('Quiz not found');
        }

        // Serve the view quiz HTML page (you'll need to create this)
        // For now, redirect to edit page with a view-only flag
        res.sendFile(path.join(__dirname, "../public/editquiz.html"));
    } catch (error) {
        console.error('Error accessing view quiz page:', error);
        res.status(500).send('Error accessing view quiz page: ' + error.message);
    }
});

// Update Excel quiz
router.post('/update-quiz-excel/:quizName', upload.single('quizFile'), async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const quizName = decodeURIComponent(req.params.quizName);
        const { 
            startTime, 
            endTime, 
            quizClass, 
            testDuration,
            examDate,
            negativeMarking,
            questionMarks
        } = req.body;
        let file = req.file;

        // Connect to MongoDB
        const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get the quiz from MongoDB
        const quizzesCollection = db.collection('quizzes');
        const quiz = await quizzesCollection.findOne({ name: quizName });
        
        if (!quiz) {
            await client.close();
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Update quiz in MongoDB
        const updateData = {
            startTime,
            endTime,
            class: quizClass,
            testDuration: parseInt(testDuration),
            examDate: new Date(examDate),
            negativeMarking: parseFloat(negativeMarking) || 0,
            questionMarks: parseInt(questionMarks) || 1
        };

        // If a new file was uploaded, update the file field
        if (file) {
            updateData.file = file.filename;
        }

        const updateResult = await quizzesCollection.updateOne(
            { name: quizName },
            { $set: updateData }
        );

        if (updateResult.modifiedCount === 0) {
            await client.close();
            return res.status(500).json({ error: 'Failed to update quiz' });
        }

        await client.close();
        res.json({ 
            success: true, 
            message: 'Quiz updated successfully',
            quiz: {
                name: quizName,
                ...updateData
            }
        });
    } catch (error) {
        console.error('Error updating quiz:', error);
        res.status(500).json({ error: 'Failed to update quiz', message: error.message });
    }
});

// Update Manual quiz
router.post('/update-quiz-manual/:quizName', upload.fields([
    { name: 'questionImage_0', maxCount: 1 },
    { name: 'questionOption1Image_0', maxCount: 1 },
    { name: 'questionOption2Image_0', maxCount: 1 },
    { name: 'questionOption3Image_0', maxCount: 1 },
    { name: 'questionOption4Image_0', maxCount: 1 }
]), async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const quizName = decodeURIComponent(req.params.quizName);
        const { 
            startTime, 
            endTime, 
            quizClass,
            testDuration,
            examDate,
            negativeMarking,
            questionMarks
        } = req.body;
        const files = req.files;

        // Connect to MongoDB
        const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get the quiz from MongoDB
        const quizzesCollection = db.collection('quizzes');
        const quiz = await quizzesCollection.findOne({ name: quizName });
        
        if (!quiz) {
            await client.close();
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Process questions and their images
        const questions = [];
        let questionIndex = 0;

        // Process each question
        while (req.body[`question_${questionIndex}`]) {
            const questionObj = {
                question: req.body[`question_${questionIndex}`],
                options: [
                    req.body[`option1_${questionIndex}`],
                    req.body[`option2_${questionIndex}`],
                    req.body[`option3_${questionIndex}`],
                    req.body[`option4_${questionIndex}`]
                ],
                correctAnswer: parseInt(req.body[`correctAnswer_${questionIndex}`]),
                optionImages: [null, null, null, null]
            };

            // Process question image
            const questionImages = files ? (files[`questionImage_${questionIndex}`] || []) : [];
            if (questionImages.length > 0) {
                questionObj.questionImage = `/quiz-images/${questionImages[0].filename}`;
            }

            // Process option images
            for (let i = 1; i <= 4; i++) {
                const optionImages = files ? (files[`questionOption${i}Image_${questionIndex}`] || []) : [];
                if (optionImages.length > 0) {
                    questionObj.optionImages[i-1] = `/quiz-images/${optionImages[0].filename}`;
                }
            }

            questions.push(questionObj);
            questionIndex++;
        }

        // Update quiz in MongoDB
        const updateResult = await quizzesCollection.updateOne(
            { name: quizName },
            { 
                $set: {
                    startTime,
                    endTime,
                    class: quizClass,
                    testDuration: parseInt(testDuration),
                    examDate: new Date(examDate),
                    negativeMarking: parseFloat(negativeMarking) || 0,
                    questionMarks: parseInt(questionMarks) || 1,
                    totalQuestions: questions.length
                }
            }
        );

        if (updateResult.modifiedCount === 0) {
            await client.close();
            return res.status(500).json({ error: 'Failed to update quiz' });
        }

        // Update questions in manual_questions collection
        const manualQuestionsCollection = db.collection('manual_questions');
        await manualQuestionsCollection.updateOne(
            { quizName },
            { $set: { questions } },
            { upsert: true }
        );

        await client.close();
        res.json({ 
            success: true, 
            message: 'Quiz updated successfully',
            quiz: {
                name: quizName,
                startTime,
                endTime,
                class: quizClass,
                testDuration: parseInt(testDuration),
                examDate: new Date(examDate),
                negativeMarking: parseFloat(negativeMarking) || 0,
                questionMarks: parseInt(questionMarks) || 1,
                totalQuestions: questions.length
            }
        });
    } catch (error) {
        console.error('Error updating quiz:', error);
        res.status(500).json({ error: 'Failed to update quiz', message: error.message });
    }
});

// View Marks.


router.get('/quiz-results/:quizName', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        if (req.query.partial) {
            return res.status(401).json({ error: 'Session expired' });
        }
        return res.redirect("/login");
    }

    const quizName = decodeURIComponent(req.params.quizName);
    const classFilter = req.query.class;
    
    try {
        // Connect to MongoDB
        const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get all class collections
        const collections = await db.listCollections().toArray();
        const classCollections = collections.filter(c => c.name.startsWith('class_'));
        
        // Get all attempts for this quiz from MongoDB
        const attemptsCollection = db.collection('attempts');
        const attempts = await attemptsCollection.find({ quizName }).toArray();

        // Fetch the quiz config for fallback
        const quizConfig = await db.collection('quizzes').findOne({ name: quizName });
        let quizTotalQuestions = 0;
        let quizQuestionMarks = 1;
        if (quizConfig) {
            if (quizConfig.sections && Array.isArray(quizConfig.sections)) {
                quizTotalQuestions = quizConfig.sections.reduce((sum, section) => sum + (section.questions ? section.questions.length : 0), 0);
            } else if (quizConfig.questions && Array.isArray(quizConfig.questions)) {
                quizTotalQuestions = quizConfig.questions.length;
            }
            quizQuestionMarks = quizConfig.questionMarks || 1;
        }
        
        let allResults = [];
        for (const attempt of attempts) {
            // Find student details from all class collections
            let studentDetails = null;
            for (const collection of classCollections) {
                const student = await db.collection(collection.name).findOne({ username: attempt.studentId });
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
                // Robustly determine totalQuestions and totalMarks
                let totalQuestions = attempt.totalQuestions;
                let totalMarks = attempt.totalMarks;
                if (!totalQuestions) {
                    if (attempt.shuffledQuestions && Array.isArray(attempt.shuffledQuestions)) {
                        totalQuestions = attempt.shuffledQuestions.length;
                    } else {
                        totalQuestions = quizTotalQuestions;
                    }
                }
                if (!totalMarks) {
                    totalMarks = totalQuestions * quizQuestionMarks;
                }
                // Robust percentage calculation
                let percentage = (typeof attempt.score === 'number' && typeof totalMarks === 'number' && totalMarks > 0)
                    ? Math.round((attempt.score / totalMarks) * 100)
                    : 0;
                // Robust date display
                let attemptedAt = '';
                if (attempt.attemptedAt) {
                    const dateObj = new Date(attempt.attemptedAt);
                    attemptedAt = isNaN(dateObj.getTime()) ? 'N/A' : dateObj.toLocaleString();
                } else if (attempt.submittedAt) {
                    const dateObj = new Date(attempt.submittedAt);
                    attemptedAt = isNaN(dateObj.getTime()) ? 'N/A' : dateObj.toLocaleString();
                } else {
                    attemptedAt = 'N/A';
                }
                // If attemptedAt is still 'Invalid Date', force to 'N/A'
                if (!attemptedAt || attemptedAt === 'Invalid Date') {
                    attemptedAt = 'N/A';
                }
                allResults.push({
                    ...studentDetails,
                    username: attempt.studentId,
                    score: attempt.score,
                    totalQuestions,
                    totalMarks,
                    percentage,
                    attemptedAt
                });
            }
        }
        await client.close();
        
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
                    score: `${result.score}/${result.totalMarks}`,
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
                                <td>${result.score}/${result.totalMarks}</td>
                                <td class="percentage-cell">
                                    ${result.percentage}%
                                    <div class="percentage-bar">
                                        <div class="percentage-fill" style="width: ${result.percentage}%"></div>
                                    </div>
                                </td>
                                <td>${result.attemptedAt}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    return html;
}

// API endpoint to get student counts for all classes
router.get('/stats/class-counts', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
    }

  try {
    // Connect to MongoDB
    const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
    await client.connect();
    const db = client.db(req.session.adminDb);

    // Get all collections that start with 'class_'
        const collections = await db.listCollections().toArray();
        const classCollections = collections.filter(c => c.name.startsWith('class_'));
        
    // Initialize counts object
    const classCounts = {};
        
    // Get count for each class
        for (const collection of classCollections) {
      const className = collection.name.replace('class_', '');
      const classNumber = parseInt(className);
      
      if (!isNaN(classNumber)) {
        const count = await db.collection(collection.name).countDocuments();
        classCounts[classNumber] = count;
    }
    }
    
    // Add zero counts for classes with no students
    for (let i = 1; i <= 10; i++) {
      if (!classCounts[i]) {
        classCounts[i] = 0;
      }
    }

    // Close MongoDB connection
    await client.close();

    // Log the response for debugging
    console.log('Sending class counts:', classCounts);
    
    res.json(classCounts);
  } catch (error) {
    console.error('Error fetching class counts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint to get student statistics
router.get('/stats/students', async (req, res) => {
        if (!req.session.fname || req.session.role !== 'admin') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

  try {
    console.log('Fetching student statistics...');
    // Connect to MongoDB
        const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
        await client.connect();
        const db = client.db(req.session.adminDb);
        
    // Get all collections that start with 'class_'
        const collections = await db.listCollections().toArray();
        const classCollections = collections.filter(c => c.name.startsWith('class_'));
    
    console.log(`Found ${classCollections.length} class collections`);
    
    // Get total student count across all classes
    let totalStudents = 0;
    let activeStudents = 0;
        
        for (const collection of classCollections) {
      try {
        const students = await db.collection(collection.name).find({}).toArray();
        console.log(`Class ${collection.name}: ${students.length} students`);
        totalStudents += students.length;
        
        // Count active students (those who have logged in at least once)
        activeStudents += students.filter(student => student.lastLogin).length;
      } catch (collectionError) {
        console.error(`Error processing collection ${collection.name}:`, collectionError);
            }
        }
        
    // Close MongoDB connection
    await client.close();
    
    const response = {
      total: totalStudents,
      active: activeStudents || totalStudents // If no lastLogin field exists, use total count
    };
    
    console.log('Sending student stats:', response);
    res.json(response);
  } catch (error) {
    console.error('Error fetching student stats:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// Update student information
router.post('/api/student/update', uploadStudentPhoto.single('photo'), async (req, res) => {
    try {
        if (!req.session.fname || req.session.role !== 'admin') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        console.log("Update request received:", req.body);
        const { username, name, email, phone, dob, studentClass, currentClass } = req.body;
        
        console.log("Student class:", studentClass);
        console.log("Current class:", currentClass);

        if (!username || !name || !email) {
            console.error("Missing essential data:", { username, name, email });
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Connect to MongoDB
        const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Prepare update data
        const updateData = {
            name,
            email,
            phone,
            dob,
            class: studentClass || currentClass
        };
        
        console.log("Update data prepared:", updateData);
        
        // If a new password is provided, update it
        if (req.body.newPassword && req.body.newPassword.trim() !== '') {
            updateData.password = req.body.newPassword;
            
            // Also update in user collection
            const userUpdateResult = await db.collection("user").updateOne(
                { Username: username },
                { $set: { Password: req.body.newPassword } }
            );
            console.log("User password update result:", userUpdateResult);
        }
        
        // If a new photo is uploaded, process it
        if (req.file) {
            console.log("Processing new photo:", req.file.originalname);
            
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
            
            // Update photo path
            updateData.photo = `/student-photos/${filename}`;
            console.log("New photo path:", updateData.photo);
        }
        
        // If class has changed, move student to new class collection
        if (studentClass && studentClass !== currentClass) {
            console.log(`Moving student from class ${currentClass} to class ${studentClass}`);
            
            // Get student from current class
            const student = await db.collection(`class_${currentClass}`).findOne({ username });
            
            if (!student) {
                console.error(`Student ${username} not found in class ${currentClass}`);
                client.close();
                return res.status(404).json({ error: 'Student not found' });
            }
            
            // Create new student document with updated data
            const newStudentData = { ...student, ...updateData };
            
            // Insert into new class
            const insertResult = await db.collection(`class_${studentClass}`).insertOne(newStudentData);
            console.log("Insert result in new class:", insertResult);
            
            // Remove from old class
            const deleteResult = await db.collection(`class_${currentClass}`).deleteOne({ username });
            console.log("Delete result from old class:", deleteResult);
        } else {
            // Update in current class
            console.log(`Updating student in class ${currentClass}`);
            
            const updateResult = await db.collection(`class_${currentClass}`).updateOne(
                { username },
                { $set: updateData }
            );
            
            console.log("Update result:", updateResult);
            
            if (updateResult.matchedCount === 0) {
                console.error(`No student with username ${username} found in class ${currentClass}`);
                return res.status(404).json({ error: 'Student not found in specified class' });
            }
        }
        
        client.close();
        console.log("Update completed successfully");
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating student:', err);
        
        // Delete uploaded file if error occurred and file was uploaded
        if (req.file) {
            const filePath = path.join(studentPhotoDir, req.file.filename);
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting uploaded file:', unlinkErr);
            });
        }
        
        res.status(500).json({ error: 'Failed to update student', message: err.message });
    }
});

// API endpoint to get student by username
router.get('/api/student/:username', async (req, res) => {
    try {
        if (!req.session.fname || req.session.role !== 'admin') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const username = req.params.username;
        
        // Connect to MongoDB
        const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Find which class the student is in
        const collections = await db.listCollections().toArray();
        const classCollections = collections.filter(c => c.name.startsWith('class_'));
        
        let student = null;
        
        for (const collection of classCollections) {
            student = await db.collection(collection.name).findOne({ username });
            if (student) {
                break;
            }
        }
        
        await client.close();
        
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        res.json(student);
    } catch (err) {
        console.error('Error fetching student:', err);
        res.status(500).json({ error: 'Failed to fetch student data', message: err.message });
    }
});

// Retake Quiz Page
router.get('/retake-quiz', (req, res) => {
  if (req.session.fname && req.session.role === 'admin') {
    res.sendFile(path.join(__dirname, "../public/retakequiz.html"));
  } else {
    res.redirect("/login");
  }
});

// API endpoint to get all students from a specific class
router.get('/api/students-by-class/:classNumber', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const classNumber = req.params.classNumber;
    
    // Connect to MongoDB
    const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Get all students from the specific class
    const collectionName = `class_${classNumber}`;
    const students = await db.collection(collectionName).find({}).toArray();
    
    await client.close();
    
    // Return only necessary student information
    const sanitizedStudents = students.map(student => ({
      username: student.username,
      name: student.name,
      email: student.email,
      phone: student.phone
    }));
    
    res.json(sanitizedStudents);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Failed to fetch students', message: err.message });
  }
});

// API endpoint to get all available quizzes
router.get('/api/quizzes', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Connect to MongoDB
    const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Get all quizzes from MongoDB
    const quizzesCollection = db.collection('quizzes');
    const quizzes = await quizzesCollection.find({}).toArray();
    
    await client.close();
    
    res.json(quizzes);
  } catch (err) {
    console.error('Error fetching quizzes:', err);
    res.status(500).json({ error: 'Failed to fetch quizzes', message: err.message });
  }
});

// API endpoint to assign a quiz for retake to specific students
router.post('/retake-quiz/assign', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { quizName, studentUsernames } = req.body;
    
    if (!quizName || !studentUsernames || !Array.isArray(studentUsernames) || studentUsernames.length === 0) {
      return res.status(400).json({ error: 'Invalid request data' });
    }
    
    // Get the quiz details
    const quizzes = readQuizzes();
    const quiz = quizzes.find(q => q.name === quizName);
    
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    // Check if the quiz times are valid
    const now = getISTNow();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    
    // Convert times to comparable values
    const startTimeParts = quiz.startTime.split(':').map(Number);
    const endTimeParts = quiz.endTime.split(':').map(Number);
    
    const startTime = new Date();
    startTime.setHours(startTimeParts[0], startTimeParts[1], 0, 0);
    
    const endTime = new Date();
    endTime.setHours(endTimeParts[0], endTimeParts[1], 0, 0);
    
    if (now > endTime) {
      return res.status(400).json({ 
        error: 'Quiz has already ended', 
        message: `This quiz ended at ${quiz.endTime}. Please update the end time before assigning for retake.`
      });
    }
    
    // Validate student usernames exist in MongoDB
    const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Get all class collections
    const collections = await db.listCollections().toArray();
    const classCollections = collections.filter(c => c.name.startsWith('class_'));
    
    // Validate each student username exists
    const validStudents = [];
    const invalidStudents = [];
    
    for (const username of studentUsernames) {
      let found = false;
      
      for (const collection of classCollections) {
        const student = await db.collection(collection.name).findOne({ username });
        if (student) {
          found = true;
          validStudents.push(username);
          break;
        }
      }
      
      if (!found) {
        invalidStudents.push(username);
      }
    }
    
    await client.close();
    
    if (invalidStudents.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid student usernames', 
        invalidStudents 
      });
    }
    
    // Create or update retake entries for the specific quiz
    const RETAKE_DIR = path.join(__dirname, '../retakes');
    if (!fs.existsSync(RETAKE_DIR)) {
      fs.mkdirSync(RETAKE_DIR, { recursive: true });
    }
    
    const retakeFilePath = path.join(RETAKE_DIR, `${quizName.replace(/\s+/g, '_')}.json`);
    
    let retakeData = [];
    if (fs.existsSync(retakeFilePath)) {
      retakeData = JSON.parse(fs.readFileSync(retakeFilePath, 'utf8'));
    }
    
    // Add new students to the retake list
    const newlyAddedStudents = [];
    studentUsernames.forEach(username => {
      if (!retakeData.includes(username)) {
        retakeData.push(username);
        newlyAddedStudents.push(username);
      }
    });
    
    // Save the updated retake data
    fs.writeFileSync(retakeFilePath, JSON.stringify(retakeData, null, 2));
    
    // For each student, clear any previous attempt for this quiz
    const ATTEMPTS_DIR = path.join(__dirname, '../attempts');
    
    for (const username of studentUsernames) {
      const studentAttemptsPath = path.join(ATTEMPTS_DIR, `${username}.json`);
      
      if (fs.existsSync(studentAttemptsPath)) {
        try {
          const attempts = JSON.parse(fs.readFileSync(studentAttemptsPath, 'utf8'));
          
          // Filter out attempts for the retake quiz
          const updatedAttempts = attempts.filter(attempt => attempt.quizName !== quizName);
          
          // Save the updated attempts
          fs.writeFileSync(studentAttemptsPath, JSON.stringify(updatedAttempts, null, 2));
        } catch (err) {
          console.error(`Error updating attempts for student ${username}:`, err);
          // Continue with other students even if there's an error with one
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Quiz assigned for retake successfully',
      newlyAddedStudents,
      totalStudents: retakeData.length
    });
  } catch (err) {
    console.error('Error assigning quiz for retake:', err);
    res.status(500).json({ error: 'Failed to assign quiz for retake', message: err.message });
  }
});

// Handle Creating Quiz for Specific Students
router.post('/create-quiz-for-students', (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  uploadExcel(req, res, async function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: 'Error uploading files: ' + err.message });
    } else if (err) {
      console.error('Unknown error:', err);
      return res.status(500).json({ error: 'Unknown error occurred' });
    }

    try {
      const { quizName, startTime, endTime, examDate, testDuration, negativeMarking, questionMarks, quizClass } = req.body;
      let studentUsernames;
      
      try {
        studentUsernames = JSON.parse(req.body.studentUsernames);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid student usernames format' });
      }
      
      if (!Array.isArray(studentUsernames) || studentUsernames.length === 0) {
        return res.status(400).json({ error: 'No students selected' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No Excel files uploaded' });
      }

      if (!quizClass) {
        return res.status(400).json({ error: 'Class information is required' });
      }

      // Get section names from the request
      const sectionNames = Array.isArray(req.body.sectionNames) ? req.body.sectionNames : [req.body.sectionNames];

      if (sectionNames.length !== req.files.length) {
        return res.status(400).json({ error: 'Number of section names must match number of files' });
      }

      // Connect to MongoDB
      const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
      await client.connect();
      const db = client.db(req.session.adminDb);
      
      // Get all class collections
      const collections = await db.listCollections().toArray();
      const classCollections = collections.filter(c => c.name.startsWith('class_'));
      
      // Keep track of student's actual classes for the log
      const studentClasses = {};
      
      // Validate each student username exists
      const validStudents = [];
      const invalidStudents = [];

      for (const username of studentUsernames) {
        let found = false;
        
        for (const collection of classCollections) {
          const student = await db.collection(collection.name).findOne({ username });
          if (student) {
            found = true;
            validStudents.push(username);
            // Extract class number from collection name (class_1 -> 1)
            const classNumber = collection.name.replace('class_', '');
            studentClasses[username] = classNumber;
            break;
          }
        }
        
        if (!found) {
          invalidStudents.push(username);
        }
      }
      
      if (invalidStudents.length > 0) {
        await client.close();
        return res.status(400).json({ 
          error: 'Invalid student usernames', 
          invalidStudents 
        });
      }

      // Create quiz object with sections
      const quiz = {
        name: quizName,
        class: quizClass,
        examDate: new Date(examDate),
        testDuration: parseInt(testDuration),
        startTime: startTime,
        endTime: endTime,
        type: 'excel',
        sections: sectionNames.map((name, index) => ({
          name: name,
          file: req.files[index].filename
        })),
        negativeMarking: parseFloat(negativeMarking) || 0,
        questionMarks: parseInt(questionMarks) || 1,
        createdAt: new Date(),
        isStudentSpecific: true,
        studentUsernames: validStudents
      };

      // Check if quiz already exists in MongoDB
      const existingQuiz = await db.collection('quizzes').findOne({ name: quizName });
      if (existingQuiz) {
        // Delete the uploaded files since quiz already exists
        req.files.forEach(file => {
          const filePath = path.join(uploadDir, file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
        throw new Error('Quiz with this name already exists');
      }

      // Insert into quizzes collection
      await db.collection('quizzes').insertOne(quiz);

      // Create retake document
      const retakeDoc = {
        quizName: quizName,
        retakes: validStudents,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Insert into retakes collection
      await db.collection('retakes').insertOne(retakeDoc);

      console.log('Quiz object stored in MongoDB:', quiz);
      console.log('Retake document stored in MongoDB:', retakeDoc);
      console.log('Filenames in uploaded files:', req.files.map(f => f.filename));

      await client.close();

      res.json({ 
        success: true, 
        message: 'Quiz created successfully',
        studentCount: validStudents.length
      });
    } catch (error) {
      console.error('Error creating quiz for specific students:', error);
      res.status(500).json({ error: 'Error creating quiz: ' + error.message });
    }
  });
});

// Handle Assigning Existing Quiz to Specific Students
router.post('/assign-existing-quiz', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { 
      originalQuizName, 
      quizName, 
      startTime, 
      endTime, 
      studentUsernames,
      quizType,
      file,
      questionsFile
    } = req.body;
    
    if (!originalQuizName || !quizName || !startTime || !endTime || !studentUsernames) {
      return res.status(400).json({ error: 'Missing required information' });
    }
    
    if (!Array.isArray(studentUsernames) || studentUsernames.length === 0) {
      return res.status(400).json({ error: 'No students selected' });
    }

    // Connect to MongoDB
    const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Get all class collections
    const collections = await db.listCollections().toArray();
    const classCollections = collections.filter(c => c.name.startsWith('class_'));
    
    // Keep track of student's actual classes for the log
    const studentClasses = {};
    
    // Validate each student username exists
    const validStudents = [];
    const invalidStudents = [];
    
    for (const username of studentUsernames) {
      let found = false;
      
      for (const collection of classCollections) {
        const student = await db.collection(collection.name).findOne({ username });
        if (student) {
          found = true;
          validStudents.push(username);
          // Extract class number from collection name (class_1 -> 1)
          const classNumber = collection.name.replace('class_', '');
          studentClasses[username] = classNumber;
          break;
        }
      }
      
      if (!found) {
        invalidStudents.push(username);
      }
    }
    
    if (invalidStudents.length > 0) {
      await client.close();
      return res.status(400).json({ 
        error: 'Invalid student usernames', 
        invalidStudents 
      });
    }

    const quizzesCollection = db.collection('quizzes');
    const retakesCollection = db.collection('retakes');
    
    // Check if we're creating a copy or modifying original quiz for specific students
    let modifiedQuizName = quizName;
    
    // If name is the same as original and other fields also match, just create retake entry
    if (quizName === originalQuizName) {
      // Find the original quiz
      const originalQuiz = await quizzesCollection.findOne({ name: originalQuizName });
      
      if (!originalQuiz) {
        await client.close();
        return res.status(404).json({ error: 'Original quiz not found' });
      }
      
      // Update the quiz to be student-specific
      await quizzesCollection.updateOne(
        { name: originalQuizName },
        { 
          $set: {
            isStudentSpecific: true,
            allowedStudents: validStudents,
            updatedAt: new Date()
          }
        }
      );
      
      // Create or update retake entry
      await retakesCollection.updateOne(
        { quizName: originalQuizName },
        { 
          $set: {
            retakes: validStudents,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    } else {
      // Creating a new version of the quiz with a different name
      // Get the original quiz details
      const originalQuiz = await quizzesCollection.findOne({ name: originalQuizName });
      
      if (!originalQuiz) {
        await client.close();
        return res.status(404).json({ error: 'Original quiz not found' });
      }
      
      // Create new quiz document
      const newQuiz = {
        name: modifiedQuizName,
        startTime: startTime,
        endTime: endTime,
        class: '999', // Special class for student-specific quizzes
        type: quizType,
        isStudentSpecific: true,
        allowedStudents: validStudents,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Add appropriate file reference based on quiz type
      if (quizType === 'excel' && file) {
        newQuiz.file = file;
      } else if (quizType === 'manual' && questionsFile) {
        newQuiz.questionsFile = questionsFile;
      } else {
        await client.close();
        return res.status(400).json({ error: 'Missing required file for quiz type' });
      }
      
      // Copy other relevant fields from original quiz
      if (originalQuiz.questions) newQuiz.questions = originalQuiz.questions;
      if (originalQuiz.options) newQuiz.options = originalQuiz.options;
      if (originalQuiz.answers) newQuiz.answers = originalQuiz.answers;
      
      // Save new quiz to MongoDB
      await quizzesCollection.insertOne(newQuiz);
      
      // Create retake entry for new quiz
      await retakesCollection.insertOne({
        quizName: modifiedQuizName,
        retakes: validStudents,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    await client.close();

    // Log information about the quiz assignment
    console.log(`Assigned quiz "${modifiedQuizName}" to ${validStudents.length} students`);
    console.log('Student classes:', studentClasses);

    res.json({ 
      success: true, 
      message: 'Quiz assigned successfully',
      studentCount: validStudents.length
    });
  } catch (error) {
    console.error('Error assigning existing quiz to students:', error);
    res.status(500).json({ error: 'Error assigning quiz: ' + error.message });
  }
});

// Messages Page
router.get('/messages', (req, res) => {
  if (req.session.fname && req.session.role === 'admin') {
    res.sendFile(path.join(__dirname, "../public/admin-messages.html"));
  } else {
    res.redirect("/login");
  }
});

// API endpoint to get all messages
router.get('/api/messages', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    try {
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get all messages for this admin's database
        const messages = await db.collection('messages')
            .find({})
            .sort({ timestamp: -1 }) // Sort by newest first
            .toArray();
            
        await client.close();
        res.json(messages);
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// API endpoint to get a specific message with student details
router.get('/api/messages/:messageId', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const messageId = req.params.messageId;
    
    // Connect to MongoDB using admin-specific database
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Convert string ID to ObjectId
    const objId = new ObjectId(messageId);
    
    // Get the message
    const message = await db.collection('messages').findOne({ _id: objId });
    
    if (!message) {
      await client.close();
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Find student info from the appropriate class collection
    const classCollection = `class_${message.class}`;
    const student = await db.collection(classCollection).findOne({ username: message.studentUsername });
    
    await client.close();
    
    if (!student) {
      // If student not found, return just the message
      return res.json({ 
        message, 
        student: { 
          name: message.studentName, 
          class: message.class,
          username: message.studentUsername
        } 
      });
    }
    
    res.json({ message, student });
  } catch (err) {
    console.error('Error fetching message details:', err);
    res.status(500).json({ error: 'Failed to fetch message details' });
  }
});

// API endpoint to mark a message as read
router.put('/api/messages/:messageId/read', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const messageId = req.params.messageId;
    
    // Connect to MongoDB using admin-specific database
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Convert string ID to ObjectId
    const objId = new ObjectId(messageId);
    
    // Update the message
    const result = await db.collection('messages').updateOne(
      { _id: objId },
      { $set: { read: true } }
    );
    
    await client.close();
    
    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Message not found or already read' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking message as read:', err);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// API endpoint to reply to a message
router.post('/api/messages/:messageId/reply', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const messageId = req.params.messageId;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Reply content is required' });
    }
    
    // Connect to MongoDB using admin-specific database
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Convert string ID to ObjectId
    const objId = new ObjectId(messageId);
    
    // Create reply object
    const reply = {
      sender: 'admin',
      content,
      timestamp: new Date()
    };
    
    // Update the message
    const result = await db.collection('messages').updateOne(
      { _id: objId },
      { 
        $push: { replies: reply },
        $set: { read: true }
      }
    );
    
    await client.close();
    
    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error sending reply:', err);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// Add logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/admin-login');
    });
});

// Route to create a new quiz - UPDATED TO STORE IN MONGODB
router.post('/create-quiz', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const quiz = req.body;
        console.log('Received quiz data:', quiz);
        
        // Validate required fields
        if (!quiz.name || !quiz.startTime || !quiz.endTime || !quiz.class || !quiz.type) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Get MongoDB database instance
        const db = req.app.locals.db;
        if (!db) {
            console.error('MongoDB database instance not found');
            return res.status(500).json({ error: 'Database connection not available' });
        }

        // First store in MongoDB
        try {
            console.log('Attempting to store quiz in MongoDB...');
            
            // Check if quiz name already exists in MongoDB
            const existingQuiz = await db.collection('quizzes').findOne({ name: quiz.name });
            if (existingQuiz) {
                console.log('Quiz already exists in MongoDB:', existingQuiz);
                return res.status(400).json({ error: "Quiz with this name already exists" });
            }

            // Insert new quiz into MongoDB
            const result = await db.collection('quizzes').insertOne(quiz);
            console.log('MongoDB insert result:', result);
            
            if (!result.insertedId) {
                throw new Error('Failed to insert quiz into MongoDB');
            }
            
            console.log('Successfully stored quiz in MongoDB:', quiz);
        } catch (mongoErr) {
            console.error('Error storing quiz in MongoDB:', mongoErr);
            return res.status(500).json({ 
                error: 'Failed to store quiz in database',
                details: mongoErr.message 
            });
        }

        // Then store in local quizzes.json
        try {
            const quizzesPath = path.join(__dirname, '../quizzes.json');
            let quizzes = [];
            
            if (fs.existsSync(quizzesPath)) {
                const fileContent = fs.readFileSync(quizzesPath, 'utf8');
                if (fileContent.trim()) {
                    quizzes = JSON.parse(fileContent);
                }
            }
            
            // Check if quiz name already exists in local storage
            if (quizzes.some(q => q.name === quiz.name)) {
                console.log('Quiz already exists in local storage');
                return res.status(400).json({ error: "Quiz with this name already exists" });
            }
            
            quizzes.push(quiz);
            fs.writeFileSync(quizzesPath, JSON.stringify(quizzes, null, 2));
            console.log('Successfully stored quiz in local storage:', quiz);
        } catch (fileErr) {
            console.error('Error storing quiz in local file:', fileErr);
            // Don't return error here, as MongoDB storage was successful
        }

        res.json({ 
            success: true, 
            message: 'Quiz created successfully',
            quiz: quiz
        });
    } catch (err) {
        console.error('Error creating quiz:', err);
        res.status(500).json({ 
            error: 'Failed to create quiz',
            details: err.message 
        });
    }
});

// Route to upload Excel quiz - UPDATED TO STORE IN MONGODB
router.post('/upload-excel', upload.single('file'), async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        // Create quiz entry in MongoDB
        const quiz = {
            name: req.body.name,
            startTime: req.body.startTime,
            endTime: req.body.endTime,
            class: req.body.class,
            type: 'excel',
            file: req.file.originalname,
            isStudentSpecific: req.body.isStudentSpecific === 'true'
        };

        // Check if quiz name already exists in MongoDB
        const existingQuiz = await req.app.locals.db.collection('quizzes')
            .findOne({ name: quiz.name });
            
        if (existingQuiz) {
            // Delete the uploaded file since quiz already exists
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: "Quiz with this name already exists" });
        }

        // Insert new quiz into MongoDB
        await req.app.locals.db.collection('quizzes').insertOne(quiz);
        
        // Also update local quizzes.json for backward compatibility
        const quizzesPath = path.join(__dirname, '../quizzes.json');
        let quizzes = [];
        if (fs.existsSync(quizzesPath)) {
            try {
                const fileContent = fs.readFileSync(quizzesPath, 'utf8');
                if (fileContent.trim()) {
                    quizzes = JSON.parse(fileContent);
                }
            } catch (err) {
                console.error('Error reading quizzes.json:', err);
            }
        }
        
        quizzes.push(quiz);
        fs.writeFileSync(quizzesPath, JSON.stringify(quizzes, null, 2));
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error uploading Excel quiz:', err);
        // Clean up uploaded file if there was an error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Failed to upload Excel quiz' });
    }
});

// Route to create manual quiz - UPDATED TO STORE IN MONGODB
router.post('/create-manual-quiz', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const { quizName, questions } = req.body;
        
        if (!quizName || !questions || !Array.isArray(questions)) {
            return res.status(400).json({ error: "Invalid quiz data" });
        }
        
        // First save to MongoDB
        const db = req.app.locals.db;
        const manualQuestionsCollection = db.collection('manual_questions');
        
        // Check if quiz already exists
        const existingQuiz = await manualQuestionsCollection.findOne({ quizName });
        if (existingQuiz) {
            return res.status(400).json({ error: "Quiz with this name already exists" });
        }
        
        // Save to MongoDB
        await manualQuestionsCollection.insertOne({
            quizName,
            questions,
            createdAt: new Date()
        });
        
        // Then save to local file for backward compatibility
        const manualQuestionsPath = path.join(__dirname, '../manual-questions');
        if (!fs.existsSync(manualQuestionsPath)) {
            fs.mkdirSync(manualQuestionsPath, { recursive: true });
        }
        
        const filePath = path.join(manualQuestionsPath, `${quizName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(questions, null, 2));
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error creating manual quiz:', err);
        res.status(500).json({ error: 'Failed to create manual quiz' });
    }
});

// Route to add retake students - UPDATED TO STORE IN MONGODB
router.post('/add-retake', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const { quizName, students } = req.body;
        
        if (!quizName || !Array.isArray(students)) {
            return res.status(400).json({ error: "Invalid retake data" });
        }
        
        // Update retake list in MongoDB
        await req.app.locals.db.collection('retakes').updateOne(
            { quizName },
            { $set: { retakes: students } },
            { upsert: true }
        );
        
        // Also save to local file for backward compatibility
        const retakesPath = path.join(__dirname, '../retakes');
        if (!fs.existsSync(retakesPath)) {
            fs.mkdirSync(retakesPath, { recursive: true });
        }
        
        const filePath = path.join(retakesPath, `${quizName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(students, null, 2));
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error adding retake:', err);
        res.status(500).json({ error: 'Failed to add retake' });
    }
});

// Route to get manual questions
router.get('/manual-questions/:quizName', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
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

// Add a function to check if data is already migrated
async function isDataMigrated(db, collectionName) {
    try {
        const count = await db.collection(collectionName).countDocuments();
        return count > 0;
    } catch (err) {
        console.error(`Error checking migration status for ${collectionName}:`, err);
        return false;
    }
}

// Update the migration route
router.post('/migrate-data', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const db = req.app.locals.db;
        const ATTEMPTS_DIR = path.join(__dirname, '../attempts');
        const MANUAL_QUESTIONS_DIR = path.join(__dirname, '../manual-questions');
        const RETAKE_DIR = path.join(__dirname, '../retakes');

        // Check if data is already migrated
        const attemptsMigrated = await isDataMigrated(db, 'attempts');
        const manualQuestionsMigrated = await isDataMigrated(db, 'manual_questions');
        const retakesMigrated = await isDataMigrated(db, 'retakes');

        if (attemptsMigrated && manualQuestionsMigrated && retakesMigrated) {
            return res.json({ 
                message: "Data is already migrated",
                status: "already_migrated"
            });
        }

        const results = {
            attempts: [],
            manualQuestions: [],
            retakes: []
        };

        // Migrate attempts if not already migrated
        if (!attemptsMigrated && fs.existsSync(ATTEMPTS_DIR)) {
            const attemptFiles = fs.readdirSync(ATTEMPTS_DIR);
            for (const file of attemptFiles) {
                if (file.endsWith('.json')) {
                    const username = file.replace('.json', '');
                    const filePath = path.join(ATTEMPTS_DIR, file);
                    const attempts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    
                    await db.collection('attempts').updateOne(
                        { username },
                        { $set: { attempts } },
                        { upsert: true }
                    );
                    
                    results.attempts.push(username);
                }
            }
        }

        // Migrate manual questions if not already migrated
        if (!manualQuestionsMigrated && fs.existsSync(MANUAL_QUESTIONS_DIR)) {
            const manualFiles = fs.readdirSync(MANUAL_QUESTIONS_DIR);
            for (const file of manualFiles) {
                if (file.endsWith('.json')) {
                    const quizName = file.replace('.json', '');
                    const filePath = path.join(MANUAL_QUESTIONS_DIR, file);
                    const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    
                    await db.collection('manual_questions').updateOne(
                        { quizName },
                        { $set: { questions } },
                        { upsert: true }
                    );
                    
                    results.manualQuestions.push(quizName);
                }
            }
        }

        // Migrate retakes if not already migrated
        if (!retakesMigrated && fs.existsSync(RETAKE_DIR)) {
            const retakeFiles = fs.readdirSync(RETAKE_DIR);
            for (const file of retakeFiles) {
                if (file.endsWith('.json')) {
                    const quizName = file.replace('.json', '');
                    const filePath = path.join(RETAKE_DIR, file);
                    const retakes = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    
                    await db.collection('retakes').updateOne(
                        { quizName },
                        { $set: { retakes } },
                        { upsert: true }
                    );
                    
                    results.retakes.push(quizName);
                }
            }
        }

        res.json({ 
            message: "Migration completed successfully",
            results,
            status: "success"
        });
    } catch (err) {
        console.error('Error during migration:', err);
        res.status(500).json({ error: 'Failed to migrate data' });
    }
});

// Route to create retake quiz
router.post('/create-retake-quiz', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const { quizName, studentUsernames } = req.body;
        
        if (!quizName || !studentUsernames || !Array.isArray(studentUsernames)) {
            return res.status(400).json({ error: "Invalid retake data" });
        }
        
        // First save to MongoDB
        const db = req.app.locals.db;
        const retakesCollection = db.collection('retakes');
        
        // Check if retake already exists
        const existingRetake = await retakesCollection.findOne({ quizName });
        if (existingRetake) {
            // Update existing retake
            await retakesCollection.updateOne(
                { quizName },
                { $set: { retakes: studentUsernames } }
            );
        } else {
            // Create new retake
            await retakesCollection.insertOne({
                quizName,
                retakes: studentUsernames,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
        
        // Then save to local file for backward compatibility
        const retakesPath = path.join(__dirname, '../retakes');
        if (!fs.existsSync(retakesPath)) {
            fs.mkdirSync(retakesPath, { recursive: true });
        }
        
        const filePath = path.join(retakesPath, `${quizName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(studentUsernames, null, 2));
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error creating retake quiz:', err);
        res.status(500).json({ error: 'Failed to create retake quiz' });
    }
});

// Route to get retake quizzes
router.get('/retake-quizzes', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const db = req.app.locals.db;
        const retakesCollection = db.collection('retakes');
        
        // Get all retake quizzes from MongoDB
        const retakes = await retakesCollection.find({}).toArray();
        
        res.json(retakes);
    } catch (err) {
        console.error('Error getting retake quizzes:', err);
        res.status(500).json({ error: 'Failed to get retake quizzes' });
    }
});

// Route to delete retake quiz
router.post('/delete-retake-quiz', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const { quizName } = req.body;
        
        // Delete from MongoDB
        const db = req.app.locals.db;
        const retakesCollection = db.collection('retakes');
        await retakesCollection.deleteOne({ quizName });
        
        // Delete from local file
        const retakesPath = path.join(__dirname, '../retakes', `${quizName}.json`);
        if (fs.existsSync(retakesPath)) {
            fs.unlinkSync(retakesPath);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting retake quiz:', err);
        res.status(500).json({ error: 'Failed to delete retake quiz' });
    }
});

// Function to sync retakes between local storage and MongoDB
async function syncRetakes(db) {
    try {
        const retakesCollection = db.collection('retakes');
        const quizzesCollection = db.collection('quizzes');
        const retakesPath = path.join(__dirname, '../retakes');
        
        if (!fs.existsSync(retakesPath)) {
            return;
        }
        
        // Get all retake files from local storage
        const retakeFiles = fs.readdirSync(retakesPath)
            .filter(file => file.endsWith('.json'));
        
        // Process each retake file
        for (const file of retakeFiles) {
            const quizName = file.replace('.json', '').replace('_retake', '');
            const filePath = path.join(retakesPath, file);
            
            try {
                // Read retake data from local file
                const retakeUsernames = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                // Get the quiz details from quizzes.json
                const quizzesPath = path.join(__dirname, '../quizzes.json');
                const quizzes = JSON.parse(fs.readFileSync(quizzesPath, 'utf8'));
                const quiz = quizzes.find(q => q.name === quizName);
                
                if (!quiz) {
                    console.error(`Quiz ${quizName} not found in quizzes.json`);
                    continue;
                }
                
                // Create or update retake document in MongoDB
                const retakeDoc = {
                    quizName,
                    retakes: retakeUsernames,
                    quizDetails: {
                        ...quiz,
                        isStudentSpecific: true,
                        allowedStudents: retakeUsernames
                    },
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                
                await retakesCollection.updateOne(
                    { quizName },
                    { $set: retakeDoc },
                    { upsert: true }
                );
                
                // Update the quiz in MongoDB to be student-specific
                await quizzesCollection.updateOne(
                    { name: quizName },
                    { 
                        $set: {
                            ...quiz,
                            isStudentSpecific: true,
                            allowedStudents: retakeUsernames
                        }
                    },
                    { upsert: true }
                );
                
                console.log(`Synced retake for quiz ${quizName}`);
            } catch (err) {
                console.error(`Error syncing retake file ${file}:`, err);
            }
        }
        
        console.log('Retakes sync completed successfully');
    } catch (err) {
        console.error('Error syncing retakes:', err);
    }
}

// Route to manually trigger retakes sync
router.post('/sync-retakes', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const db = req.app.locals.db;
        await syncRetakes(db);
        res.json({ success: true });
    } catch (err) {
        console.error('Error syncing retakes:', err);
        res.status(500).json({ error: 'Failed to sync retakes' });
    }
});

// Function to watch retakes directory
function watchRetakesDirectory(db) {
    const retakesPath = path.join(__dirname, '../retakes');
    
    if (!fs.existsSync(retakesPath)) {
        fs.mkdirSync(retakesPath, { recursive: true });
    }
    
    // Initial sync
    syncRetakes(db).catch(err => {
        console.error('Error in initial sync:', err);
    });
    
    // Watch for changes
    const watcher = fs.watch(retakesPath, async (eventType, filename) => {
        if (eventType === 'change' && filename.endsWith('.json')) {
            console.log(`Detected change in retake file: ${filename}`);
            try {
                await syncRetakes(db);
                console.log(`Successfully synced retake file: ${filename}`);
            } catch (err) {
                console.error(`Error syncing retake file ${filename}:`, err);
            }
        }
    });
    
    // Handle watcher errors
    watcher.on('error', (err) => {
        console.error('Error watching retakes directory:', err);
    });
    
    return watcher;
}

// Initialize retakes sync
let retakesWatcher = null;

router.use(async (req, res, next) => {
    try {
        const db = req.app.locals.db;
        
        // Initialize watcher if not already initialized
        if (!retakesWatcher) {
            retakesWatcher = watchRetakesDirectory(db);
            console.log('Retakes directory watcher initialized');
        }
        
        // Perform initial sync
        await syncRetakes(db);
        console.log('Initial retakes sync completed');
    } catch (err) {
        console.error('Error in retakes initialization:', err);
    }
    next();
});

// Update create-retake-quiz route
router.post('/create-retake-quiz', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const { quizName, studentUsernames } = req.body;
        
        if (!quizName || !studentUsernames || !Array.isArray(studentUsernames)) {
            return res.status(400).json({ error: "Invalid retake data" });
        }
        
        // Save to local file
        const retakesPath = path.join(__dirname, '../retakes');
        if (!fs.existsSync(retakesPath)) {
            fs.mkdirSync(retakesPath, { recursive: true });
        }
        
        const filePath = path.join(retakesPath, `${quizName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(studentUsernames, null, 2));
        console.log(`Created retake file: ${filePath}`);
        
        // The file watcher will automatically sync to MongoDB
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error creating retake quiz:', err);
        res.status(500).json({ error: 'Failed to create retake quiz' });
    }
});

// Add route to manually trigger sync
router.post('/sync-retakes', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not authorized" });
    }

    try {
        const db = req.app.locals.db;
        await syncRetakes(db);
        console.log('Manual retakes sync completed');
        res.json({ success: true });
    } catch (err) {
        console.error('Error in manual retakes sync:', err);
        res.status(500).json({ error: 'Failed to sync retakes' });
    }
});

// Helper to get current IST time as Date object
function getISTNow() {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

// Route to get existing quizzes for student-specific assignment
router.get('/existing-quizzes', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Connect to MongoDB
    const client = new MongoClient("mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles");
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Get all quizzes from MongoDB
    const quizzesCollection = db.collection('quizzes');
    const quizzes = await quizzesCollection.find({}).toArray();
    
    await client.close();
    
    res.json(quizzes);
  } catch (err) {
    console.error('Error getting existing quizzes:', err);
    res.status(500).json({ error: 'Failed to get existing quizzes' });
  }
});

// Update quiz details
router.post('/update-quiz', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { quizName, newName, startTime, endTime, duration, totalQuestions, passingScore, instructions } = req.body;
        
        // Connect to MongoDB
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Get the quiz from MongoDB
        const quizzesCollection = db.collection('quizzes');
        const quiz = await quizzesCollection.findOne({ name: quizName });
        
        if (!quiz) {
            await client.close();
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Check if quiz has already started
        const now = getISTNow();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

        if (quiz.startTime <= currentTime) {
            await client.close();
            return res.status(400).json({ error: 'Cannot edit quiz after it has started' });
        }

        // Update quiz in MongoDB
        const updateResult = await quizzesCollection.updateOne(
            { name: quizName },
            { 
                $set: {
                    name: newName,
                    startTime,
                    endTime,
                    duration: parseInt(duration),
                    totalQuestions: parseInt(totalQuestions),
                    passingScore: parseInt(passingScore),
                    instructions: instructions || ''
                }
            }
        );

        if (updateResult.modifiedCount === 0) {
            await client.close();
            return res.status(500).json({ error: 'Failed to update quiz' });
        }

        // If quiz name was changed, update any references in other collections
        if (newName !== quizName) {
            // Update in attempts collection
            const attemptsCollection = db.collection('attempts');
            await attemptsCollection.updateMany(
                { quizName },
                { $set: { quizName: newName } }
            );

            // Update in manual_questions collection if it exists
            const manualQuestionsCollection = db.collection('manual_questions');
            await manualQuestionsCollection.updateMany(
                { quizName },
                { $set: { quizName: newName } }
            );
        }

        await client.close();
        res.json({ success: true, message: 'Quiz updated successfully' });
    } catch (error) {
        console.error('Error updating quiz:', error);
        res.status(500).json({ error: 'Failed to update quiz', message: error.message });
    }
});

// API endpoint to reply to a message
router.post('/messages/reply', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    const { messageId, replyContent } = req.body;
    
    if (!messageId || !replyContent) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Add reply to message
        const result = await db.collection('messages').updateOne(
            { _id: new ObjectId(messageId) },
            { 
                $push: { 
                    replies: {
                        content: replyContent,
                        timestamp: new Date(),
                        adminName: req.session.fname
                    }
                },
                $set: { read: true }
            }
        );
        
        await client.close();
        
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Reply sent successfully'
        });
    } catch (err) {
        console.error('Error sending reply:', err);
        res.status(500).json({ error: 'Failed to send reply' });
    }
});

// API endpoint to mark message as read
router.post('/messages/mark-read', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: "Not logged in" });
    }
    
    const { messageId } = req.body;
    
    if (!messageId) {
        return res.status(400).json({ error: 'Missing message ID' });
    }
    
    try {
        // Connect to MongoDB using admin-specific database
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        
        // Mark message as read
        const result = await db.collection('messages').updateOne(
            { _id: new ObjectId(messageId) },
            { $set: { read: true } }
        );
        
        await client.close();
        
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Message marked as read'
        });
    } catch (err) {
        console.error('Error marking message as read:', err);
        res.status(500).json({ error: 'Failed to mark message as read' });
    }
});

// API endpoint to get all class names and their student counts
router.get('/api/classes', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    const classes = [];
    const processedClasses = new Set(); // Track processed classes to avoid duplicates
    
    // Get all collections that start with 'class_'
    const collections = await db.listCollections().toArray();
    const classCollections = collections.filter(c => c.name.startsWith('class_'));
    
    // Process all class collections
    for (const collection of classCollections) {
      const className = collection.name.replace('class_', '');
      
      // Skip if already processed
      if (processedClasses.has(className)) {
        continue;
      }
      
      const count = await db.collection(collection.name).countDocuments();
      classes.push({ name: className, count });
      processedClasses.add(className);
    }
    
    // Sort classes: standard classes first (numerically), then custom classes (alphabetically)
    classes.sort((a, b) => {
      const aNum = parseInt(a.name);
      const bNum = parseInt(b.name);
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      } else if (!isNaN(aNum)) {
        return -1; // Standard classes first
      } else if (!isNaN(bNum)) {
        return 1; // Standard classes first
      } else {
        return a.name.localeCompare(b.name); // Alphabetical for custom classes
      }
    });
    
    await client.close();
    res.json(classes);
  } catch (err) {
    console.error('Error fetching classes:', err);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// Update /admin/stats/class-counts to return all classes
router.get('/stats/class-counts', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Get standard class collections
    const collections = await db.listCollections().toArray();
    const classCollections = collections.filter(c => c.name.startsWith('class_'));
    const classCounts = {};
    
    // Count students in standard classes
    for (const collection of classCollections) {
      const className = collection.name.replace('class_', '');
      const count = await db.collection(collection.name).countDocuments();
      classCounts[className] = count;
    }
    
    // Get custom classes for this admin
    const customClassesCollection = db.collection('custom_classes');
    const customClasses = await customClassesCollection.find({ adminId: req.session.adminId }).toArray();
    
    // Add custom classes to counts (they might already be in classCounts from above)
    for (const customClass of customClasses) {
      const collectionName = `class_${customClass.className}`;
      const count = await db.collection(collectionName).countDocuments();
      classCounts[customClass.className] = count;
    }
    
    await client.close();
    res.json(classCounts);
  } catch (error) {
    console.error('Error fetching class counts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint to get admin-specific custom classes
router.get('/api/custom-classes', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Get custom classes for this admin
    const customClassesCollection = db.collection('custom_classes');
    const customClasses = await customClassesCollection.find({ adminId: req.session.adminId }).toArray();
    
    await client.close();
    
    // Extract just the class names
    const classNames = customClasses.map(cls => cls.className);
    res.json(classNames);
  } catch (err) {
    console.error('Error fetching custom classes:', err);
    res.status(500).json({ error: 'Failed to fetch custom classes' });
  }
});

// API endpoint to add a custom class
router.post('/api/custom-classes', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { className } = req.body;
    
    if (!className || !className.trim()) {
      return res.status(400).json({ error: 'Class name is required' });
    }

    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Check if custom class already exists for this admin
    const customClassesCollection = db.collection('custom_classes');
    const existingClass = await customClassesCollection.findOne({ 
      adminId: req.session.adminId, 
      className: className.trim() 
    });
    
    if (existingClass) {
      await client.close();
      return res.status(400).json({ error: 'Custom class already exists' });
    }
    
    // Add new custom class
    await customClassesCollection.insertOne({
      adminId: req.session.adminId,
      className: className.trim(),
      createdAt: new Date()
    });
    
    await client.close();
    res.json({ success: true, className: className.trim() });
  } catch (err) {
    console.error('Error adding custom class:', err);
    res.status(500).json({ error: 'Failed to add custom class' });
  }
});

// API endpoint to delete a custom class
router.delete('/api/custom-classes/:className', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const className = decodeURIComponent(req.params.className);
    
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Check if there are any students in this custom class
    const collectionName = `class_${className}`;
    const studentCount = await db.collection(collectionName).countDocuments();
    
    // Delete the custom class
    const customClassesCollection = db.collection('custom_classes');
    const result = await customClassesCollection.deleteOne({ 
      adminId: req.session.adminId, 
      className: className 
    });
    
    if (result.deletedCount === 0) {
      await client.close();
      return res.status(404).json({ error: 'Custom class not found' });
    }
    
    // If there were students in the class, delete them from the user collection as well
    if (studentCount > 0) {
      try {
        // Get all students from the class collection
        const students = await db.collection(collectionName).find({}).toArray();
        
        // Delete students from the user collection (for authentication)
        for (const student of students) {
          await db.collection("user").deleteOne({ Username: student.Username });
        }
        
        console.log(`Deleted ${studentCount} students from class ${className}`);
      } catch (studentDeleteErr) {
        console.error('Error deleting students from user collection:', studentDeleteErr);
        // Continue with class deletion even if student deletion fails
      }
    }
    
    // Drop the collection if it exists
    try {
      await db.collection(collectionName).drop();
    } catch (dropErr) {
      // Collection might not exist, which is fine
      console.log(`Collection ${collectionName} doesn't exist or already dropped`);
    }
    
    await client.close();
    
    const message = studentCount > 0 
      ? `Custom class "${className}" and ${studentCount} student(s) deleted successfully`
      : `Custom class "${className}" deleted successfully`;
      
    res.json({ success: true, message: message });
  } catch (err) {
    console.error('Error deleting custom class:', err);
    res.status(500).json({ error: 'Failed to delete custom class' });
  }
});

// API endpoint to get all classes (standard + custom) for dropdowns
router.get('/api/all-classes', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Get custom classes for this admin
    const customClassesCollection = db.collection('custom_classes');
    const customClasses = await customClassesCollection.find({ adminId: req.session.adminId }).toArray();
    
    await client.close();
    
    // Standard classes
    const standardClasses = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    
    // Custom classes
    const customClassNames = customClasses.map(cls => cls.className);
    
    // Combine and sort
    const allClasses = [...standardClasses, ...customClassNames].sort((a, b) => {
      // Sort numerically for standard classes, alphabetically for custom classes
      const aNum = parseInt(a);
      const bNum = parseInt(b);
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      } else if (!isNaN(aNum)) {
        return -1; // Standard classes first
      } else if (!isNaN(bNum)) {
        return 1; // Standard classes first
      } else {
        return a.localeCompare(b); // Alphabetical for custom classes
      }
    });
    
    res.json(allClasses);
  } catch (err) {
    console.error('Error fetching all classes:', err);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// Custom Class Management Page
router.get('/custom-classes', (req, res) => {
  if (req.session.fname && req.session.role === 'admin') {
    res.sendFile(path.join(__dirname, "../public/custom-classes.html"));
  } else {
    res.redirect("/login");
  }
});

// API endpoint to get admin-specific custom classes with student counts
router.get('/api/custom-classes-with-counts', async (req, res) => {
  if (!req.session.fname || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(req.session.adminDb);
    
    // Get custom classes for this admin
    const customClassesCollection = db.collection('custom_classes');
    const customClasses = await customClassesCollection.find({ adminId: req.session.adminId }).toArray();
    
    // Get student counts for each custom class
    const classesWithCounts = [];
    for (const customClass of customClasses) {
      const collectionName = `class_${customClass.className}`;
      const studentCount = await db.collection(collectionName).countDocuments();
      classesWithCounts.push({
        className: customClass.className,
        studentCount: studentCount
      });
    }
    
    await client.close();
    res.json(classesWithCounts);
  } catch (err) {
    console.error('Error fetching custom classes with counts:', err);
    res.status(500).json({ error: 'Failed to fetch custom classes' });
  }
});

// API endpoint to get count of unread student messages
router.get('/api/unread-messages-count', async (req, res) => {
    if (!req.session.fname || req.session.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(req.session.adminDb);
        // Count messages where read: false
        const count = await db.collection('messages').countDocuments({ read: false });
        await client.close();
        res.json({ count });
    } catch (err) {
        console.error('Error fetching unread messages count:', err);
        res.status(500).json({ error: 'Failed to fetch unread messages count' });
    }
});

module.exports = router;
