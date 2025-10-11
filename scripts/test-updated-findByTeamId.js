const { MongoClient, ObjectId } = require('mongodb');

// Use environment variable for MongoDB connection
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

async function testUpdatedFindByTeamId() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('leave-manager');
    const users = db.collection('users');
    
    // Test the teamId that we know has multiple members
    const teamId = '68ea840d6feb79d57d86d1a0';
    
    console.log(`\n=== Testing Updated findByTeamId for team: ${teamId} ===`);
    
    // Test the updated query logic
    console.log('\nUpdated query with $or (string and ObjectId):');
    const results = await users.find({
      $or: [
        { teamId: teamId },
        { teamId: new ObjectId(teamId) }
      ]
    }).toArray();
    
    console.log(`Found ${results.length} users:`);
    results.forEach(user => {
      console.log(`  - ${user.username} (${user.fullName}) - Role: ${user.role} - TeamId: ${user.teamId} (type: ${typeof user.teamId})`);
    });
    
    // Verify we found all expected users
    const expectedUsers = ['danamanor', 'francisbentum', 'abbeywinifred', 'isabelkarsa', 'edgemadzi'];
    const foundUsernames = results.map(u => u.username);
    const missingUsers = expectedUsers.filter(username => !foundUsernames.includes(username));
    
    if (missingUsers.length === 0) {
      console.log('\n✅ SUCCESS: Found all expected users!');
    } else {
      console.log('\n❌ MISSING USERS:', missingUsers);
    }
    
  } catch (error) {
    console.error('Error testing updated findByTeamId:', error);
  } finally {
    await client.close();
  }
}

testUpdatedFindByTeamId();
