const { MongoClient } = require('mongodb');

// Connection URL
const url = 'mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles';
const client = new MongoClient(url);

// Database Name
const dbName = 'School';

async function main() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(dbName);
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('Collections in the database:');
    collections.forEach(collection => {
      console.log(` - ${collection.name}`);
    });
    
    // Check the user collection
    const userCollection = db.collection('user');
    const users = await userCollection.find({}).toArray();
    
    console.log('\nUser records:');
    users.forEach(user => {
      console.log(` - Username: ${user.Username}, Password: ${user.Password}`);
    });
    
    // Look for class collections
    const classCollections = collections.filter(c => c.name.startsWith('class_'));
    console.log('\nClass collections:');
    
    for (const collection of classCollections) {
      console.log(`\nStudents in ${collection.name}:`);
      const students = await db.collection(collection.name).find({}).toArray();
      students.forEach(student => {
        console.log(` - Name: ${student.name}, Username: ${student.username}, Class: ${student.class}`);
      });
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

main().catch(console.error); 