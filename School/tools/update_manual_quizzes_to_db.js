const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// CONFIGURATION
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'School'; // Changed to match existing DB name
const QUIZ_COLLECTION = 'quizzes';

const manualDir = path.join(__dirname, '../manual-questions');

async function main() {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const quizzes = db.collection(QUIZ_COLLECTION);

    const files = fs.readdirSync(manualDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(manualDir, file);
      let quizData;
      try {
        quizData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
        continue;
      }
      if (!Array.isArray(quizData) || quizData.length === 0) {
        console.warn(`Skipping ${file}: not an array or empty.`);
        continue;
      }
      // Use filename as quiz name (remove -manual.json)
      const quizName = file.replace(/-manual\.json$/, '');
      // Build quiz object for DB
      const questionsArr = quizData.map(q => ({
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        optionImages: q.optionImages || [null, null, null, null],
      }));
      const quizDoc = {
        name: quizName,
        class: '10', // Set default or customize as needed
        startTime: new Date(Date.now() + 60 * 1000), // Starts in 1 min
        endTime: new Date(Date.now() + 60 * 60 * 1000), // Ends in 1 hour
        type: 'manual',
        questions: questionsArr,
        sections: [
          {
            name: 'Questions',
            description: 'Manual Questions',
            file: '',
            questions: questionsArr,
            negativeMarking: 0
          }
        ],
        negativeMarking: 0,
        questionMarks: 1
      };
      // Upsert into DB
      await quizzes.updateOne(
        { name: quizDoc.name },
        { $set: quizDoc },
        { upsert: true }
      );
      console.log(`Updated quiz in DB: ${quizDoc.name}`);
    }
    console.log('All manual quizzes updated in DB.');
  } catch (err) {
    console.error('Error updating quizzes:', err);
  } finally {
    await client.close();
  }
}

main(); 