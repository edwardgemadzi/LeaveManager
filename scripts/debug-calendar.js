require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

async function debugCalendar() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db('leave-manager');
    
    console.log('=== DEBUGGING CALENDAR MEMBER NAMES ===\n');
    
    // Get all users
    const users = await db.collection('users').find({}).toArray();
    console.log('All users in database:');
    users.forEach(user => {
      console.log(`- ID: ${user._id}, Username: ${user.username}, FullName: ${user.fullName || 'N/A'}, TeamId: ${user.teamId}, Role: ${user.role}`);
    });
    
    console.log('\n=== LEAVE REQUESTS ===');
    
    // Get all leave requests
    const requests = await db.collection('leaveRequests').find({}).toArray();
    console.log('All leave requests:');
    requests.forEach(request => {
      console.log(`- ID: ${request._id}, UserId: ${request.userId}, Reason: ${request.reason}, Status: ${request.status}`);
    });
    
    console.log('\n=== TEAMS ===');
    
    // Get all teams
    const teams = await db.collection('teams').find({}).toArray();
    console.log('All teams:');
    teams.forEach(team => {
      console.log(`- ID: ${team._id}, Name: ${team.name}, TeamUsername: ${team.teamUsername}, LeaderId: ${team.leaderId}`);
    });
    
    console.log('\n=== MATCHING ANALYSIS ===');
    
    // Check if user IDs match between requests and users
    requests.forEach(request => {
      const user = users.find(u => u._id.toString() === request.userId);
      if (user) {
        console.log(`✅ Request ${request._id}: User found - ${user.username} (${user.fullName || 'No full name'})`);
      } else {
        console.log(`❌ Request ${request._id}: User NOT found for userId ${request.userId}`);
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

debugCalendar();
