const mongoose = require('mongoose');

// Define the schema for a question
const questionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    options: {
        type: [String],
        required: true,
        validate: {
            validator: function(v) {
                return v.length === 4; // Exactly 4 options required
            },
            message: 'Exactly 4 options are required'
        }
    },
    correctAnswer: {
        type: Number,
        required: true,
        min: 0,
        max: 3
    }
});

// Define the schema for a section
const sectionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    file: {
        type: String,
        required: true
    },
    questions: {
        type: [questionSchema],
        required: true,
        validate: {
            validator: function(v) {
                return v.length > 0;
            },
            message: 'At least one question is required per section'
        }
    }
});

// Define the main quiz schema
const quizSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    class: {
        type: String,
        required: true
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['manual', 'excel']
    },
    sections: {
        type: [sectionSchema],
        required: true,
        validate: {
            validator: function(v) {
                return v.length > 0;
            },
            message: 'At least one section is required'
        }
    },
    isStudentSpecific: {
        type: Boolean,
        default: false
    },
    allowedStudents: {
        type: [String],
        default: []
    },
    negativeMarking: {
        type: Number,
        required: true,
        min: 0,
        max: 1,
        default: 0
    },
    questionMarks: {
        type: Number,
        required: true,
        min: 1,
        default: 1
    }
}, {
    timestamps: true
});

// Create indexes for better query performance
// quizSchema.index({ name: 1 }); // Removed to avoid duplicate index warning
quizSchema.index({ class: 1 });
quizSchema.index({ type: 1 });
quizSchema.index({ startTime: 1, endTime: 1 });

const Quiz = mongoose.model('Quiz', quizSchema);

module.exports = Quiz; 