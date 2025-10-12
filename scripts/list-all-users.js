require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

async function listAllUsers() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const usersCollection = db.collection('users');
    
    const users = await usersCollection.find({}).toArray();
    
    console.log(`Found ${users.length} users:`);
    users.forEach((user, index) => {
      console.log(`${index + 1}. Username: ${user.username}, Full Name: ${user.fullName || 'Not set'}, Role: ${user.role}`);
    });
    
  } catch (error) {
    console.error('Error listing users:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

listAllUsers();
