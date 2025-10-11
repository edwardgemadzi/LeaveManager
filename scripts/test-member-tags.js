const { MongoClient } = require('mongodb');

// Use environment variable for MongoDB connection
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

async function testMemberTags() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('leave-manager');
    const users = db.collection('users');
    
    // Find all members
    const members = await users.find({ role: 'member' }).toArray();
    
    console.log(`Found ${members.length} members:`);
    
    members.forEach(member => {
      console.log(`- ${member.username}: shiftTag = ${member.shiftTag || 'unassigned'}`);
    });
    
    // Test updating a member's shift tag
    if (members.length > 0) {
      const testMember = members[0];
      console.log(`\nTesting shift tag update for ${testMember.username}...`);
      
      const newTag = testMember.shiftTag === 'day' ? 'night' : 'day';
      
      const result = await users.updateOne(
        { _id: testMember._id },
        { $set: { shiftTag: newTag } }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`✅ Successfully updated ${testMember.username} shift tag to: ${newTag}`);
        
        // Verify the update
        const updatedMember = await users.findOne({ _id: testMember._id });
        console.log(`✅ Verified: ${updatedMember.username} now has shiftTag: ${updatedMember.shiftTag}`);
      } else {
        console.log(`❌ Failed to update shift tag for ${testMember.username}`);
      }
    }
    
    console.log('\nMember tags test completed!');
    
  } catch (error) {
    console.error('Error testing member tags:', error);
  } finally {
    await client.close();
  }
}

testMemberTags();
