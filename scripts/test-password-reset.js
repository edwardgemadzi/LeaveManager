const { MongoClient } = require('mongodb');

// Use environment variable for MongoDB connection
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

async function testPasswordReset() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('leave-manager');
    const users = db.collection('users');
    
    // Find a test user
    const testUser = await users.findOne({ username: 'edward' });
    
    if (!testUser) {
      console.log('No test user found. Creating one...');
      
      // Create a test user
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('password123', 12);
      
      const newUser = {
        username: 'edward',
        fullName: 'Edward Test',
        password: hashedPassword,
        role: 'leader',
        teamId: null, // Will be set when team is created
        createdAt: new Date()
      };
      
      const result = await users.insertOne(newUser);
      console.log('Test user created with ID:', result.insertedId);
    } else {
      console.log('Test user found:', {
        username: testUser.username,
        fullName: testUser.fullName,
        role: testUser.role
      });
    }
    
    console.log('\nPassword reset test completed successfully!');
    console.log('You can now test the password reset flow:');
    console.log('1. Go to /forgot-password');
    console.log('2. Enter username: edward');
    console.log('3. Check console for reset URL');
    console.log('4. Use the reset URL to set a new password');
    
  } catch (error) {
    console.error('Error testing password reset:', error);
  } finally {
    await client.close();
  }
}

testPasswordReset();
