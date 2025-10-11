// Script to update Francis' full name via API
// This requires the application to be running and a valid leader token

const fetch = require('node-fetch');

async function updateFrancisViaAPI() {
  try {
    // You would need to get a valid leader token first
    // This is just a template - in practice, you'd need to login as a leader first
    const token = 'YOUR_LEADER_TOKEN_HERE';
    const francisUserId = '68ea7b743946baa03a70b6f5'; // Francis' user ID from the logs
    
    const response = await fetch(`http://localhost:3000/api/users/${francisUserId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        fullName: 'Francis Bentum'
      })
    });
    
    if (response.ok) {
      console.log('✅ Francis updated successfully!');
      const result = await response.json();
      console.log('Result:', result);
    } else {
      console.error('❌ Failed to update Francis:', response.status, response.statusText);
      const error = await response.text();
      console.error('Error:', error);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

console.log('To update Francis via API:');
console.log('1. Login as a team leader in the application');
console.log('2. Get the JWT token from localStorage');
console.log('3. Replace YOUR_LEADER_TOKEN_HERE with the actual token');
console.log('4. Run this script');
console.log('');
console.log('Alternatively, you can update Francis directly in the database or through the application UI.');

// Uncomment the line below to run the update (after setting the token)
// updateFrancisViaAPI();
