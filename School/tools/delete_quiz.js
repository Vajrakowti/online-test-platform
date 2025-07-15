const { MongoClient } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'School';
const QUIZ_COLLECTION = 'quizzes';
const QUIZ_NAME = process.argv[2];

if (!QUIZ_NAME) {
  console.error('Please provide the quiz name to delete as an argument.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const result = await db.collection(QUIZ_COLLECTION).deleteOne({ name: QUIZ_NAME });
    if (result.deletedCount === 1) {
      console.log(`Quiz '${QUIZ_NAME}' deleted successfully.`);
    } else {
      console.log(`Quiz '${QUIZ_NAME}' not found.`);
    }
  } catch (err) {
    console.error('Error deleting quiz:', err);
  } finally {
    await client.close();
  }
}

main(); 