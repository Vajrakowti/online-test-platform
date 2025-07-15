const { MongoClient } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'School';
const QUIZ_COLLECTION = 'quizzes';

async function main() {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const result = await db.collection(QUIZ_COLLECTION).updateMany(
      { type: 'manual' },
      { $set: { startTime: fiveMinutesAgo, endTime: twoHoursLater } }
    );
    console.log(`Updated ${result.modifiedCount} manual quizzes to be available now.`);
  } catch (err) {
    console.error('Error updating quiz times:', err);
  } finally {
    await client.close();
  }
}

main(); 