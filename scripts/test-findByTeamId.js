const { MongoClient } = require('mongodb');

// Use environment variable for MongoDB connection
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

async function testFindByTeamId() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('leave-manager');
    const users = db.collection('users');
    
    // Test the teamId that we know has multiple members
    const teamId = '68ea840d6feb79d57d86d1a0';
    
    console.log(`\n=== Testing findByTeamId for team: ${teamId} ===`);
    
    // Test 1: Direct query with string teamId
    console.log('\n1. Direct query with string teamId:');
    const results1 = await users.find({ teamId: teamId }).toArray();
    console.log(`Found ${results1.length} users:`);
    results1.forEach(user => {
      console.log(`  - ${user.username} (${user.fullName}) - Role: ${user.role}`);
    });
    
    // Test 2: Query with $or (current implementation)
    console.log('\n2. Query with $or:');
    const results2 = await users.find({
      $or: [
        { teamId: teamId },
        { teamId: { $eq: teamId } }
      ]
    }).toArray();
    console.log(`Found ${results2.length} users:`);
    results2.forEach(user => {
      console.log(`  - ${user.username} (${user.fullName}) - Role: ${user.role}`);
    });
    
    // Test 3: Check all users and their teamIds
    console.log('\n3. All users and their teamIds:');
    const allUsers = await users.find({}).toArray();
    allUsers.forEach(user => {
      console.log(`  - ${user.username}: teamId = ${user.teamId} (type: ${typeof user.teamId})`);
    });
    
    // Test 4: Check if teamId is stored as ObjectId
    console.log('\n4. Testing ObjectId conversion:');
    const { ObjectId } = require('mongodb');
    if (ObjectId.isValid(teamId)) {
      console.log(`teamId ${teamId} is a valid ObjectId`);
      const objectIdResults = await users.find({ teamId: new ObjectId(teamId) }).toArray();
      console.log(`Found ${objectIdResults.length} users with ObjectId teamId:`);
      objectIdResults.forEach(user => {
        console.log(`  - ${user.username} (${user.fullName}) - Role: ${user.role}`);
      });
    } else {
      console.log(`teamId ${teamId} is not a valid ObjectId`);
    }
    
  } catch (error) {
    console.error('Error testing findByTeamId:', error);
  } finally {
    await client.close();
  }
}

testFindByTeamId();
