# 🚀 Vercel Deployment Guide for Leave Manager

Your Leave Manager application has been successfully pushed to GitHub and is ready for Vercel deployment!

## 📋 Pre-Deployment Checklist

### ✅ Security Verification
- [x] `.gitignore` properly configured to exclude sensitive files
- [x] No environment variables committed to repository
- [x] `.env.local` and `.env.example` properly ignored
- [x] Security documentation created (`SECURITY.md`)
- [x] All sensitive data protected

### ✅ Code Quality
- [x] All TypeScript errors resolved
- [x] ESLint configuration in place
- [x] Comprehensive error handling
- [x] Input validation implemented
- [x] Authentication and authorization working

## 🎯 Step-by-Step Vercel Deployment

### Step 1: Set up MongoDB Atlas

1. **Create MongoDB Atlas Account**
   - Go to [mongodb.com/atlas](https://www.mongodb.com/atlas)
   - Sign up for a free account
   - Create a new cluster (M0 Sandbox is free)

2. **Configure Database Access**
   - Go to "Database Access" in your Atlas dashboard
   - Create a new database user with read/write permissions
   - Note down the username and password

3. **Configure Network Access**
   - Go to "Network Access" in your Atlas dashboard
   - Add IP address `0.0.0.0/0` to allow all IPs (required for Vercel)
   - Or add Vercel's specific IP ranges if you prefer

4. **Get Connection String**
   - Go to "Clusters" and click "Connect"
   - Choose "Connect your application"
   - Copy the connection string (it looks like: `mongodb+srv://username:password@cluster.mongodb.net/`)

### Step 2: Deploy to Vercel

1. **Import Project**
   - Go to [vercel.com](https://vercel.com) and sign in
   - Click "New Project"
   - Import your GitHub repository: `edwardgemadzi/LeaveManager`
   - Vercel will auto-detect it's a Next.js project

2. **Configure Environment Variables**
   - In the Vercel dashboard, go to your project settings
   - Navigate to "Environment Variables"
   - Add the following variables:

   | Variable | Value | Description |
   |----------|-------|-------------|
   | `MONGODB_URI` | `mongodb+srv://username:password@cluster.mongodb.net/leave-manager` | Your MongoDB Atlas connection string |
   | `JWT_SECRET` | `your-super-secret-jwt-key-at-least-32-characters-long` | A secure random string for JWT signing |
   | `NEXTAUTH_URL` | `https://your-app-name.vercel.app` | Your Vercel deployment URL (auto-set) |

3. **Deploy**
   - Click "Deploy" and wait for the build to complete
   - Vercel will provide you with a deployment URL

### Step 3: Test Your Deployment

1. **Visit Your App**
   - Go to your Vercel deployment URL
   - You should see the Leave Manager landing page

2. **Create a Team Leader Account**
   - Click "Create Team" or "Register as Leader"
   - Fill in the registration form
   - Verify the account is created successfully

3. **Test Core Features**
   - Login with your leader account
   - Create a team member account
   - Test leave request submission and approval
   - Verify calendar functionality
   - Check leave balance calculations

## 🔧 Environment Variables Reference

### Required Variables

```bash
# MongoDB Atlas Connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/leave-manager?retryWrites=true&w=majority

# JWT Secret (generate a strong, random secret)
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long

# Next.js Configuration
NEXTAUTH_URL=https://your-app-name.vercel.app
```

### Optional Variables

```bash
# For additional security (optional)
NEXTAUTH_SECRET=your-nextauth-secret-here
```

## 🛠️ Troubleshooting

### Common Issues and Solutions

#### 1. MongoDB Connection Errors
**Error**: `MongoServerError: Authentication failed`

**Solution**:
- Verify your MongoDB Atlas connection string
- Check that the database user has read/write permissions
- Ensure IP whitelist includes `0.0.0.0/0`

#### 2. JWT Authentication Errors
**Error**: `JsonWebTokenError: invalid signature`

**Solution**:
- Ensure `JWT_SECRET` is set and is at least 32 characters
- Use a strong, random secret (you can generate one with: `openssl rand -base64 32`)

#### 3. Build Errors
**Error**: Build fails during deployment

**Solution**:
- Check Vercel build logs for specific errors
- Ensure all dependencies are in `package.json`
- Verify TypeScript compilation is successful

#### 4. Environment Variables Not Loading
**Error**: `process.env.MONGODB_URI is undefined`

**Solution**:
- Verify environment variables are set in Vercel dashboard
- Ensure variable names match exactly (case-sensitive)
- Redeploy after adding environment variables

## 📊 Performance Optimization

### For Vercel Free Plan

1. **Database Indexing**
   ```javascript
   // Add these indexes in MongoDB Atlas for better performance:
   // Collection: users
   // Indexes: { username: 1 }, { teamId: 1 }
   
   // Collection: teams  
   // Indexes: { teamUsername: 1 }
   
   // Collection: leaveRequests
   // Indexes: { teamId: 1 }, { userId: 1 }, { status: 1 }
   ```

2. **Connection Optimization**
   - The app uses MongoDB's built-in connection pooling
   - Connections are automatically managed by the MongoDB driver

3. **Static Generation**
   - Next.js App Router provides optimal performance
   - Automatic code splitting and optimization

## 🔒 Security Best Practices

### Production Security Checklist

- [ ] MongoDB Atlas IP whitelist configured
- [ ] Database user has minimal required permissions
- [ ] JWT secret is strong and unique
- [ ] HTTPS enabled (automatic with Vercel)
- [ ] Environment variables secured
- [ ] No sensitive data in client-side code
- [ ] Input validation working on all forms
- [ ] Authentication required for protected routes

### Monitoring

- **Vercel Analytics**: Monitor usage and performance
- **MongoDB Atlas Metrics**: Track database performance
- **Function Logs**: Monitor API endpoint usage

## 🚀 Post-Deployment

### 1. Custom Domain (Optional)
- Add a custom domain in Vercel dashboard
- Update `NEXTAUTH_URL` environment variable
- SSL certificate is automatically provided

### 2. Database Backup
- Enable MongoDB Atlas automated backups
- Set up regular backup schedules
- Test backup restoration procedures

### 3. Monitoring Setup
- Set up Vercel analytics
- Monitor MongoDB Atlas metrics
- Configure alerts for errors or high usage

## 📞 Support Resources

- **Vercel Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **MongoDB Atlas Documentation**: [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)
- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
- **Project Repository**: [github.com/edwardgemadzi/LeaveManager](https://github.com/edwardgemadzi/LeaveManager)

## 🎉 Success!

Once deployed, your Leave Manager application will be available at your Vercel URL and ready for team use!

**Next Steps**:
1. Share the application URL with your team
2. Create team leader accounts
3. Set up team members
4. Start managing leave requests!

---

**Repository**: [https://github.com/edwardgemadzi/LeaveManager.git](https://github.com/edwardgemadzi/LeaveManager.git)
**Deployment**: Ready for Vercel deployment
**Security**: ✅ All sensitive data protected
