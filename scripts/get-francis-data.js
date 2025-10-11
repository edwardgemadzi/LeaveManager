const { MongoClient } = require('mongodb');

// Use the same connection string as in the app
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

async function getFrancisData() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('leave-manager');
    const users = db.collection('users');
    const leaveRequests = db.collection('leaveRequests');
    const teams = db.collection('teams');
    
    // Find Francis
    console.log('\n🔍 Searching for Francis...');
    const francis = await users.findOne({ username: 'francisbentum' });
    
    if (!francis) {
      console.log('❌ Francis not found!');
      return;
    }
    
    console.log('\n👤 Francis User Data:');
    console.log('=====================================');
    console.log(JSON.stringify(francis, null, 2));
    
    // Get Francis' team information
    if (francis.teamId) {
      console.log('\n🏢 Francis Team Data:');
      console.log('=====================================');
      const team = await teams.findOne({ _id: francis.teamId });
      if (team) {
        console.log(JSON.stringify(team, null, 2));
      } else {
        console.log('❌ Team not found for Francis');
      }
    }
    
    // Get Francis' leave requests
    console.log('\n📅 Francis Leave Requests:');
    console.log('=====================================');
    const francisRequests = await leaveRequests.find({ userId: francis._id.toString() }).toArray();
    
    if (francisRequests.length > 0) {
      francisRequests.forEach((request, index) => {
        console.log(`\nRequest ${index + 1}:`);
        console.log(JSON.stringify(request, null, 2));
      });
    } else {
      console.log('📝 No leave requests found for Francis');
    }
    
    // Get all team members
    console.log('\n👥 All Team Members:');
    console.log('=====================================');
    const allMembers = await users.find({ teamId: francis.teamId }).toArray();
    allMembers.forEach((member, index) => {
      console.log(`\nMember ${index + 1}:`);
      console.log(`  Username: ${member.username}`);
      console.log(`  Full Name: ${member.fullName || 'Not set'}`);
      console.log(`  Role: ${member.role}`);
      console.log(`  Shift Schedule: ${member.shiftSchedule ? JSON.stringify(member.shiftSchedule) : 'Not set'}`);
      console.log(`  Created: ${member.createdAt}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Database connection closed');
  }
}

getFrancisData();
