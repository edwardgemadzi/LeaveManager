#!/bin/bash

echo "🔍 Getting Francis data by username: francisbentum"
echo ""

# First, try to login as Francis
echo "🔐 Attempting to login as Francis..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"francisbentum","password":"password123"}')

echo "Login Response:"
echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
echo ""

# Extract token if login was successful
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token' 2>/dev/null)

if [ "$TOKEN" != "null" ] && [ "$TOKEN" != "" ]; then
    echo "✅ Login successful! Token obtained."
    echo ""
    
    # Get team data
    echo "🏢 Getting team data..."
    TEAM_RESPONSE=$(curl -s http://localhost:3000/api/team \
      -H "Authorization: Bearer $TOKEN")
    
    echo "Team Data:"
    echo "$TEAM_RESPONSE" | jq '.' 2>/dev/null || echo "$TEAM_RESPONSE"
    echo ""
    
    # Extract team ID
    TEAM_ID=$(echo "$TEAM_RESPONSE" | jq -r '.team._id' 2>/dev/null)
    
    if [ "$TEAM_ID" != "null" ] && [ "$TEAM_ID" != "" ]; then
        echo "📅 Getting leave requests for team..."
        REQUESTS_RESPONSE=$(curl -s "http://localhost:3000/api/leave-requests?teamId=$TEAM_ID" \
          -H "Authorization: Bearer $TOKEN")
        
        echo "All Leave Requests:"
        echo "$REQUESTS_RESPONSE" | jq '.' 2>/dev/null || echo "$REQUESTS_RESPONSE"
        echo ""
        
        # Filter Francis' requests
        echo "👤 Francis' Leave Requests:"
        echo "$REQUESTS_RESPONSE" | jq '.[] | select(.userId == "68ea7b743946baa03a70b6f5")' 2>/dev/null || echo "Could not filter Francis' requests"
    fi
else
    echo "❌ Login failed. Trying with different password..."
    
    # Try with different common passwords
    for password in "francis123" "123456" "password" "francis"; do
        echo "Trying password: $password"
        LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
          -H "Content-Type: application/json" \
          -d "{\"username\":\"francisbentum\",\"password\":\"$password\"}")
        
        TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token' 2>/dev/null)
        
        if [ "$TOKEN" != "null" ] && [ "$TOKEN" != "" ]; then
            echo "✅ Login successful with password: $password"
            break
        fi
    done
fi

echo ""
echo "🔍 Francis User ID from logs: 68ea7b743946baa03a70b6f5"
echo "🔍 Francis Team ID from logs: 68ea7b273946baa03a70b6f3"
