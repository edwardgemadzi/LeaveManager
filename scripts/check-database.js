const { MongoClient } = require('mongodb');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local');
  process.exit(1);
}

async function checkDatabase() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await client.connect();
    
    const db = client.db('leave-manager');
    
    console.log('📋 Checking collections...');
    
    // Check users
    const users = await db.collection('users').find({}).toArray();
    console.log(`👥 Users found: ${users.length}`);
    users.forEach(user => {
      console.log(`  - ${user.username} (${user.role}) - TeamId: ${user.teamId}`);
    });
    
    // Check teams
    const teams = await db.collection('teams').find({}).toArray();
    console.log(`🏢 Teams found: ${teams.length}`);
    teams.forEach(team => {
      console.log(`  - ${team.name} (${team.teamUsername}) - LeaderId: ${team.leaderId}`);
    });
    
    // Check leave requests
    const requests = await db.collection('leaveRequests').find({}).toArray();
    console.log(`📅 Leave requests found: ${requests.length}`);
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed.');
  }
}

checkDatabase();
