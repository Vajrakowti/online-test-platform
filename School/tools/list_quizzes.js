const { MongoClient } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'School';
const QUIZ_COLLECTION = 'quizzes';

async function main() {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const quizzes = await db.collection(QUIZ_COLLECTION).find({}).toArray();
    if (!quizzes.length) {
      console.log('No quizzes found.');
      return;
    }
    quizzes.forEach(q => {
      const sectionCount = q.sections ? q.sections.length : 0;
      const questionCount = q.sections && q.sections[0] && q.sections[0].questions ? q.sections[0].questions.length : 0;
      console.log(`Name: ${q.name}\n  Type: ${q.type}\n  Start: ${q.startTime}\n  End: ${q.endTime}\n  Sections: ${sectionCount}\n  Questions in first section: ${questionCount}`);
      console.log('Full quiz object:', JSON.stringify(q, null, 2));
      console.log('-----------------------------');
    });
  } catch (err) {
    console.error('Error listing quizzes:', err);
  } finally {
    await client.close();
  }
}

main(); 