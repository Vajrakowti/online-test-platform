const { MongoClient } = require('mongodb');

// Connection URL
const url = 'mongodb+srv://vajraOnlineTest:vajra@vajrafiles.qex2ed7.mongodb.net/School';
const client = new MongoClient(url);

async function verifyPasswordChange(username) {
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        
        const db = client.db('School');
        
        // Check user collection
        const user = await db.collection('user').findOne({ Username: username });
        console.log('\nUser collection:');
        if (user) {
            console.log('Username:', user.Username);
            console.log('Password:', user.Password);
            console.log('Class:', user.class);
        } else {
            console.log('User not found in user collection');
        }
        
        if (user?.class) {
            // Check class collection
            const classCollection = `class_${user.class}`;
            const student = await db.collection(classCollection).findOne({ username: username.toLowerCase() });
            console.log('\nClass collection:', classCollection);
            if (student) {
                console.log('Username:', student.username);
                console.log('Password:', student.password);
            } else {
                console.log('Student not found in class collection');
            }
        }
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.close();
    }
}

// Get username from command line argument
const username = process.argv[2];
if (!username) {
    console.log('Please provide a username as an argument');
    process.exit(1);
}

console.log('Verifying password for user:', username);
verifyPasswordChange(username); 