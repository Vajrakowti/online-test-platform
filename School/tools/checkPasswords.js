const { MongoClient } = require('mongodb');
const readline = require('readline');

// Connection URL
const url = 'mongodb://localhost:27017';
const client = new MongoClient(url);

// Database Name
const dbName = 'School';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(dbName);
    const userCollection = db.collection('user');
    
    // Show all users and their passwords
    const users = await userCollection.find({}).toArray();
    console.log('\nCurrent user credentials:');
    users.forEach((user, index) => {
      console.log(`${index + 1}. Username: ${user.Username}, Password: ${user.Password}`);
    });
    
    // Options menu
    console.log('\nOptions:');
    console.log('1. Reset a user password');
    console.log('2. Verify a user password');
    console.log('3. Exit');
    
    rl.question('\nSelect an option (1-3): ', async (option) => {
      switch(option) {
        case '1':
          // Reset password
          rl.question('Enter username: ', async (username) => {
            rl.question('Enter new password: ', async (newPassword) => {
              try {
                const result = await userCollection.updateOne(
                  { Username: username },
                  { $set: { Password: newPassword } }
                );
                
                if (result.matchedCount === 0) {
                  console.log('User not found!');
                } else if (result.modifiedCount === 0) {
                  console.log('Password unchanged (may be the same as current password)');
                } else {
                  console.log('Password updated successfully!');
                  
                  // Verify the update
                  const updatedUser = await userCollection.findOne({ Username: username });
                  console.log(`Updated user: Username=${updatedUser.Username}, Password=${updatedUser.Password}`);
                }
                
                rl.close();
                await client.close();
              } catch (err) {
                console.error('Error updating password:', err);
                rl.close();
                await client.close();
              }
            });
          });
          break;
          
        case '2':
          // Verify a user password
          rl.question('Enter username: ', async (username) => {
            rl.question('Enter password to verify: ', async (password) => {
              try {
                const user = await userCollection.findOne({ 
                  Username: username,
                  Password: password
                });
                
                if (user) {
                  console.log('Password is correct!');
                } else {
                  // Check if user exists
                  const userExists = await userCollection.findOne({ Username: username });
                  if (userExists) {
                    console.log('User exists but password is incorrect');
                    console.log(`Actual password: ${userExists.Password}`);
                  } else {
                    console.log('User does not exist');
                  }
                }
                
                rl.close();
                await client.close();
              } catch (err) {
                console.error('Error verifying password:', err);
                rl.close();
                await client.close();
              }
            });
          });
          break;
          
        case '3':
          console.log('Exiting...');
          rl.close();
          await client.close();
          break;
          
        default:
          console.log('Invalid option');
          rl.close();
          await client.close();
      }
    });
    
  } catch (err) {
    console.error('Error:', err);
    rl.close();
    await client.close();
  }
}

// Handle program termination
rl.on('close', () => {
  console.log('Operation complete. Goodbye!');
});

main().catch(console.error); 