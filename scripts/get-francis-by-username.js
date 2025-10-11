// Script to get Francis' data by username via API
const fetch = require('node-fetch');

async function getFrancisData() {
  try {
    console.log('🔍 Getting Francis data by username: francisbentum');
    
    // First, let's try to get team data which includes all members
    const teamResponse = await fetch('http://localhost:3000/api/team', {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // You'll need to replace this with a valid token
      }
    });
    
    if (teamResponse.ok) {
      const teamData = await teamResponse.json();
      console.log('\n📊 Team Data:');
      console.log('=====================================');
      console.log(JSON.stringify(teamData, null, 2));
      
      // Find Francis in the members array
      const francis = teamData.members?.find(member => member.username === 'francisbentum');
      
      if (francis) {
        console.log('\n👤 Francis Found in Team Members:');
        console.log('=====================================');
        console.log(JSON.stringify(francis, null, 2));
      } else {
        console.log('\n❌ Francis not found in team members');
      }
    } else {
      console.log('❌ Failed to get team data:', teamResponse.status, teamResponse.statusText);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Alternative: Get Francis data by making a login request first
async function getFrancisDataWithLogin() {
  try {
    console.log('\n🔐 Attempting to login as Francis to get his data...');
    
    // Try to login as Francis
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'francisbentum',
        password: 'password123' // Default password
      })
    });
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('\n✅ Login successful!');
      console.log('Francis User Data:');
      console.log('=====================================');
      console.log(JSON.stringify(loginData.user, null, 2));
      
      // Now get team data with the token
      const teamResponse = await fetch('http://localhost:3000/api/team', {
        headers: {
          'Authorization': `Bearer ${loginData.token}`
        }
      });
      
      if (teamResponse.ok) {
        const teamData = await teamResponse.json();
        console.log('\n🏢 Team Data:');
        console.log('=====================================');
        console.log(JSON.stringify(teamData, null, 2));
        
        // Get Francis' leave requests
        const requestsResponse = await fetch(`http://localhost:3000/api/leave-requests?teamId=${loginData.user.teamId}`, {
          headers: {
            'Authorization': `Bearer ${loginData.token}`
          }
        });
        
        if (requestsResponse.ok) {
          const requests = await requestsResponse.json();
          const francisRequests = requests.filter(req => req.userId === loginData.user.id);
          
          console.log('\n📅 Francis Leave Requests:');
          console.log('=====================================');
          if (francisRequests.length > 0) {
            francisRequests.forEach((request, index) => {
              console.log(`\nRequest ${index + 1}:`);
              console.log(JSON.stringify(request, null, 2));
            });
          } else {
            console.log('📝 No leave requests found for Francis');
          }
        }
      }
    } else {
      console.log('❌ Login failed:', loginResponse.status, loginResponse.statusText);
      const errorData = await loginResponse.json();
      console.log('Error details:', errorData);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

console.log('🚀 Getting Francis data by username: francisbentum');
console.log('');

// Try the login approach first
getFrancisDataWithLogin();
