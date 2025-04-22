const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

// Connection URL
const url = 'mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/?retryWrites=true&w=majority&appName=VajraFiles';
const client = new MongoClient(url);

// Database Name
const dbName = 'School';

// Test credentials
const testUsername = process.argv[2] || 'test_user';
const currentPassword = process.argv[3] || 'oldpass';
const newPassword = process.argv[4] || 'newpass';

async function main() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(dbName);
    const userCollection = db.collection('user');
    
    // Step 1: Check if test user exists
    console.log(`\nStep 1: Checking if user ${testUsername} exists...`);
    const user = await userCollection.findOne({ Username: testUsername });
    
    if (!user) {
      console.log(`User ${testUsername} not found in database. Creating test user...`);
      await userCollection.insertOne({
        Username: testUsername,
        Password: currentPassword
      });
      console.log(`Test user created with password: ${currentPassword}`);
    } else {
      console.log(`User found: ${testUsername}, current password: ${user.Password}`);
    }
    
    // Step 2: Try to change password via API
    console.log(`\nStep 2: Changing password via API...`);
    try {
      const apiURL = 'http://localhost:7001/api/change-password';
      
      console.log(`Sending request to: ${apiURL}`);
      console.log(`Request data: {
        username: ${testUsername}, 
        currentPassword: ${currentPassword}, 
        newPassword: ${newPassword}
      }`);
      
      const response = await fetch(apiURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: testUsername,
          currentPassword: currentPassword,
          newPassword: newPassword
        })
      });
      
      const data = await response.json();
      console.log('API Response:', data);
    } catch (error) {
      console.error('API request failed:', error);
    }
    
    // Step 3: Verify database was updated
    console.log(`\nStep 3: Verifying database update...`);
    const updatedUser = await userCollection.findOne({ Username: testUsername });
    console.log(`User in database: ${updatedUser.Username}, Password: ${updatedUser.Password}`);
    
    if (updatedUser.Password === newPassword) {
      console.log('SUCCESS: Password was correctly updated in the database');
    } else {
      console.log('ERROR: Password was NOT updated in the database!');
    }
    
    // Step 4: Verify login with new password
    console.log(`\nStep 4: Verify you can login with the new password: ${newPassword}`);
    console.log(`Open http://localhost:7001/login and try to login with:\nUsername: ${testUsername}\nPassword: ${newPassword}`);
    
  } catch (err) {
    console.error('Script error:', err);
  } finally {
    await client.close();
    console.log('\nMongoDB connection closed');
  }
}

if (require.main === module) {
  console.log('Password Change Test');
  console.log('===================');
  console.log(`Testing with: Username=${testUsername}, CurrentPass=${currentPassword}, NewPass=${newPassword}`);
  main().catch(console.error);
} 