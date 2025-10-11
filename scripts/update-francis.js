const { MongoClient } = require('mongodb');

// Use environment variable for MongoDB connection
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

async function updateFrancis() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db('leave-manager');
    const users = db.collection('users');
    
    // Find Francis
    const francis = await users.findOne({ username: 'francisbentum' });
    console.log('Current Francis data:', JSON.stringify(francis, null, 2));
    
    if (!francis) {
      console.log('Francis not found!');
      return;
    }
    
    // Update Francis with full name
    const result = await users.updateOne(
      { username: 'francisbentum' },
      { $set: { fullName: 'Francis Bentum' } }
    );
    
    console.log('Update result:', result);
    
    // Verify the update
    const updatedFrancis = await users.findOne({ username: 'francisbentum' });
    console.log('Updated Francis data:', JSON.stringify(updatedFrancis, null, 2));
    
  } catch (error) {
    console.error('Error updating Francis:', error);
  } finally {
    await client.close();
  }
}

updateFrancis();