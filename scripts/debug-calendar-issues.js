const { MongoClient } = require('mongodb');

// Use environment variable for MongoDB connection
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

async function debugCalendarIssues() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('leave-manager');
    const users = db.collection('users');
    const leaveRequests = db.collection('leaveRequests');
    
    // Get all users
    const allUsers = await users.find({}).toArray();
    console.log('\n=== ALL USERS ===');
    allUsers.forEach(user => {
      console.log(`- ID: ${user._id}, Username: ${user.username}, FullName: ${user.fullName}, TeamId: ${user.teamId}, Role: ${user.role}`);
    });
    
    // Get all leave requests
    const allRequests = await leaveRequests.find({}).toArray();
    console.log('\n=== ALL LEAVE REQUESTS ===');
    allRequests.forEach(request => {
      console.log(`- ID: ${request._id}, UserId: ${request.userId}, Start: ${request.startDate}, End: ${request.endDate}, Status: ${request.status}, Reason: ${request.reason}`);
    });
    
    // Test member lookup for each request
    console.log('\n=== MEMBER LOOKUP TEST ===');
    allRequests.forEach(request => {
      const member = allUsers.find(u => u._id.toString() === request.userId);
      console.log(`Request ${request._id}:`);
      console.log(`  - Request UserId: ${request.userId} (type: ${typeof request.userId})`);
      console.log(`  - Member Found: ${!!member}`);
      if (member) {
        console.log(`  - Member ID: ${member._id} (type: ${typeof member._id})`);
        console.log(`  - Member Username: ${member.username}`);
        console.log(`  - Member FullName: ${member.fullName}`);
        console.log(`  - Member Role: ${member.role}`);
        console.log(`  - Member TeamId: ${member.teamId}`);
        console.log(`  - Member ShiftSchedule: ${member.shiftSchedule ? 'Present' : 'Missing'}`);
      } else {
        console.log(`  - No member found with ID: ${request.userId}`);
        console.log(`  - Available user IDs: ${allUsers.map(u => u._id.toString()).join(', ')}`);
      }
      console.log('');
    });
    
    // Test team-based member lookup
    console.log('\n=== TEAM-BASED LOOKUP TEST ===');
    const teams = [...new Set(allUsers.map(u => u.teamId).filter(Boolean))];
    teams.forEach(teamId => {
      console.log(`\nTeam: ${teamId}`);
      const teamMembers = allUsers.filter(u => u.teamId === teamId);
      console.log(`Members in team: ${teamMembers.length}`);
      teamMembers.forEach(member => {
        console.log(`  - ${member.username} (${member.fullName || 'No full name'}) - Role: ${member.role}`);
      });
      
      const teamRequests = allRequests.filter(r => {
        const member = allUsers.find(u => u._id.toString() === r.userId);
        return member && member.teamId === teamId;
      });
      console.log(`Leave requests for team: ${teamRequests.length}`);
      teamRequests.forEach(request => {
        const member = allUsers.find(u => u._id.toString() === request.userId);
        console.log(`  - ${member?.username || 'Unknown'} - ${request.reason} (${request.status})`);
      });
    });
    
  } catch (error) {
    console.error('Error debugging calendar issues:', error);
  } finally {
    await client.close();
  }
}

debugCalendarIssues();
