require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

async function updateGraceName() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const usersCollection = db.collection('users');
    
    // Find Grace by username "MwanziaGrace"
    const graceUser = await usersCollection.findOne({
      username: 'MwanziaGrace'
    });
    
    if (!graceUser) {
      console.log('Grace Nduku not found in database');
      return;
    }
    
    console.log('Found user:', {
      _id: graceUser._id,
      username: graceUser.username,
      currentFullName: graceUser.fullName
    });
    
    // Capitalize the full name
    const capitalizedName = graceUser.fullName.replace(/\b\w/g, l => l.toUpperCase());
    
    if (capitalizedName === graceUser.fullName) {
      console.log('Name is already properly capitalized');
      return;
    }
    
    // Update both the name and make username lowercase
    const lowercaseUsername = graceUser.username.toLowerCase();
    const result = await usersCollection.updateOne(
      { _id: graceUser._id },
      { 
        $set: { 
          fullName: capitalizedName,
          username: lowercaseUsername
        } 
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`✅ Successfully updated Grace's profile:`);
      console.log(`   - Name: "${graceUser.fullName}" → "${capitalizedName}"`);
      console.log(`   - Username: "${graceUser.username}" → "${lowercaseUsername}"`);
    } else {
      console.log('❌ Failed to update profile');
    }
    
  } catch (error) {
    console.error('Error updating Grace\'s name:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

updateGraceName();
