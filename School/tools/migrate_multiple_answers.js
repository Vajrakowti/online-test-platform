const { MongoClient } = require('mongodb');
const url = 'mongodb://localhost:27017';

async function migrateMultipleAnswers() {
    let client;
    try {
        console.log('Starting migration to support multiple correct answers...');
        
        client = new MongoClient(url);
        await client.connect();
        
        // Get all databases
        const adminDb = client.db('admin');
        const databases = await adminDb.admin().listDatabases();
        
        for (const dbInfo of databases.databases) {
            const dbName = dbInfo.name;
            
            // Skip system databases
            if (dbName === 'admin' || dbName === 'local' || dbName === 'config') {
                continue;
            }
            
            console.log(`Processing database: ${dbName}`);
            const db = client.db(dbName);
            const quizzesCollection = db.collection('quizzes');
            
            // Find all quizzes
            const quizzes = await quizzesCollection.find({}).toArray();
            
            for (const quiz of quizzes) {
                console.log(`Processing quiz: ${quiz.name}`);
                let hasChanges = false;
                
                // Process sections if they exist
                if (quiz.sections && Array.isArray(quiz.sections)) {
                    for (const section of quiz.sections) {
                        if (section.questions && Array.isArray(section.questions)) {
                            for (const question of section.questions) {
                                // Check if correctAnswer is a single number (old format)
                                if (typeof question.correctAnswer === 'number') {
                                    console.log(`  Converting single answer [${question.correctAnswer}] to array for question: ${question.question.substring(0, 50)}...`);
                                    question.correctAnswer = [question.correctAnswer];
                                    hasChanges = true;
                                }
                            }
                        }
                    }
                }
                
                // Process questions directly on quiz (for manual quizzes)
                if (quiz.questions && Array.isArray(quiz.questions)) {
                    for (const question of quiz.questions) {
                        // Check if correctAnswer is a single number (old format)
                        if (typeof question.correctAnswer === 'number') {
                            console.log(`  Converting single answer [${question.correctAnswer}] to array for question: ${question.question.substring(0, 50)}...`);
                            question.correctAnswer = [question.correctAnswer];
                            hasChanges = true;
                        }
                    }
                }
                
                // Update the quiz if changes were made
                if (hasChanges) {
                    await quizzesCollection.updateOne(
                        { _id: quiz._id },
                        { $set: quiz }
                    );
                    console.log(`  Updated quiz: ${quiz.name}`);
                }
            }
        }
        
        console.log('Migration completed successfully!');
        
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    } finally {
        if (client) {
            await client.close();
        }
    }
}

// Run migration if this script is executed directly
if (require.main === module) {
    migrateMultipleAnswers()
        .then(() => {
            console.log('Migration script completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateMultipleAnswers }; 