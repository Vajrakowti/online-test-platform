const express = require('express');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'School/public')));

// Session configuration
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: 'mongodb://localhost:27017/lms',
        ttl: 24 * 60 * 60 // 1 day
    }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/lms', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// Import routes
const adminRoutes = require('./School/routes/admin');
const studentRoutes = require('./School/routes/student');
const startQuizRoutes = require('./School/routes/startquiz');
const paymentRoutes = require('./School/routes/payment');
const changePasswordRoutes = require('./School/routes/change-password');

// Use routes
app.use('/admin', adminRoutes);
app.use('/student', studentRoutes);
app.use('/start', startQuizRoutes);
app.use('/payment', paymentRoutes);
app.use('/change-password', changePasswordRoutes);

// Default route
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 