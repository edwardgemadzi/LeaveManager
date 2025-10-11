const { MongoClient } = require('mongodb');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local');
  process.exit(1);
}

async function clearDatabase() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await client.connect();
    
    const db = client.db('leave-manager');
    
    console.log('🗑️  Clearing database collections...');
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log(`📋 Found ${collections.length} collections:`, collections.map(c => c.name));
    
    // Drop all collections
    for (const collection of collections) {
      await db.collection(collection.name).drop();
      console.log(`✅ Dropped collection: ${collection.name}`);
    }
    
    console.log('🎉 Database cleared successfully!');
    console.log('💡 You can now test the application with a fresh database.');
    
  } catch (error) {
    console.error('❌ Error clearing database:', error);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed.');
  }
}

clearDatabase();
