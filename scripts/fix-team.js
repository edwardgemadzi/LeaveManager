const { MongoClient } = require('mongodb');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local');
  process.exit(1);
}

async function fixTeam() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await client.connect();
    
    const db = client.db('leave-manager');
    
    // Find the team without a leaderId
    const team = await db.collection('teams').findOne({ leaderId: '' });
    if (!team) {
      console.log('❌ No team found without leaderId');
      return;
    }
    
    console.log(`🏢 Found team: ${team.name} (${team.teamUsername})`);
    
    // Find the leader user
    const leader = await db.collection('users').findOne({ teamId: team._id.toString(), role: 'leader' });
    if (!leader) {
      console.log('❌ No leader found for this team');
      return;
    }
    
    console.log(`👤 Found leader: ${leader.username}`);
    
    // Update the team with the leader ID
    await db.collection('teams').updateOne(
      { _id: team._id },
      { $set: { leaderId: leader._id.toString() } }
    );
    
    console.log('✅ Team updated with leader ID');
    
  } catch (error) {
    console.error('❌ Error fixing team:', error);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed.');
  }
}

fixTeam();
