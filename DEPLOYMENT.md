# Deployment Guide for Vercel

This comprehensive guide will help you deploy the Leave Manager application to Vercel's free hobby plan.

## Prerequisites

1. **MongoDB Atlas Account**: Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. **GitHub Account**: For version control and Vercel integration
3. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)

## Step 1: Set up MongoDB Atlas

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
   - Append your database name: `mongodb+srv://username:password@cluster.mongodb.net/leave-manager`

## Step 2: Prepare Your Code

1. Push your code to a GitHub repository
2. Make sure your `.env.local` file is in `.gitignore` (it should be by default)
3. Verify `.env.example` is committed (it should be, as it's a template)

## Step 3: Deploy to Vercel

1. **Import Project**
   - Go to [vercel.com](https://vercel.com) and sign in
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect it's a Next.js project

2. **Configure Environment Variables**
   - In the Vercel dashboard, go to your project settings
   - Navigate to "Environment Variables"
   - Add the following variables:

   | Variable | Value | Description |
   |----------|-------|-------------|
   | `MONGODB_URI` | `mongodb+srv://username:password@cluster.mongodb.net/leave-manager` | Your MongoDB Atlas connection string |
   | `JWT_SECRET` | `your-super-secret-jwt-key-at-least-32-characters-long` | A secure random string for JWT signing (generate with: `openssl rand -base64 32`) |
   | `NEXTAUTH_URL` | `https://your-app-name.vercel.app` | Your Vercel deployment URL (auto-set by Vercel) |
   | `ADMIN_ENABLED` | `false` | Set to false for production (admin panel is localhost only) |

3. **Deploy**
   - Click "Deploy" and wait for the build to complete
   - Vercel will provide you with a deployment URL

## Step 4: Test Your Deployment

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

## Environment Variables Reference

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
# Admin Panel (localhost only - set to false for production)
ADMIN_ENABLED=false
```

**⚠️ IMPORTANT**: Replace `username`, `password`, and `cluster` with your actual MongoDB Atlas credentials. Never commit real credentials to version control.

## Troubleshooting

### Common Issues and Solutions

#### 1. MongoDB Connection Errors
**Error**: `MongoServerError: Authentication failed`

**Solution**:
- Verify your MongoDB Atlas connection string format
- Check that the database user has read/write permissions
- Ensure IP whitelist includes `0.0.0.0/0` or Vercel's IP ranges
- Verify the database name in the connection string

#### 2. JWT Authentication Errors
**Error**: `JsonWebTokenError: invalid signature`

**Solution**:
- Ensure `JWT_SECRET` is set and is at least 32 characters
- Use a strong, random secret (generate with: `openssl rand -base64 32`)
- Verify the secret is the same across deployments if using multiple environments

#### 3. Build Errors
**Error**: Build fails during deployment

**Solution**:
- Check Vercel build logs for specific errors
- Ensure all dependencies are in `package.json`
- Verify TypeScript compilation is successful
- Check that all environment variables are set correctly

#### 4. Environment Variables Not Loading
**Error**: `process.env.MONGODB_URI is undefined`

**Solution**:
- Verify environment variables are set in Vercel dashboard
- Ensure variable names match exactly (case-sensitive)
- Redeploy after adding environment variables
- Check that variables are set for the correct environment (Production, Preview, Development)

## Performance Optimization for Free Plan

### Database Indexing
Add indexes on frequently queried fields in MongoDB Atlas:

```javascript
// Collection: users
// Indexes: 
{ username: 1 }
{ teamId: 1 }

// Collection: teams
// Indexes:
{ teamUsername: 1 }

// Collection: leaveRequests
// Indexes:
{ teamId: 1 }
{ userId: 1 }
{ status: 1 }
{ startDate: 1, endDate: 1 }
```

### Connection Pooling
- The app uses MongoDB's built-in connection pooling
- Connections are automatically managed by the MongoDB driver
- No additional configuration needed

### Static Generation
- Next.js App Router provides optimal performance
- Automatic code splitting and optimization
- Server-side rendering for dynamic content

### Vercel Free Plan Limits
- **Function Timeout**: 10 seconds (sufficient for this app)
- **Bandwidth**: 100GB/month (plenty for most use cases)
- **Build Time**: 45 minutes (more than enough)
- **Serverless Functions**: 100GB-hours (generous for this app)

## Security Best Practices

1. **Environment Variables**: Never commit secrets to Git
2. **JWT Secret**: Use a strong, random secret (at least 32 characters)
3. **Database Access**: Use least-privilege database users
4. **HTTPS**: Vercel provides SSL certificates automatically
5. **Input Validation**: The app validates all user inputs
6. **IP Whitelisting**: Configure MongoDB Atlas IP whitelist appropriately
7. **Admin Panel**: Keep `ADMIN_ENABLED=false` in production

### Production Security Checklist

- [ ] MongoDB Atlas IP whitelist configured
- [ ] Database user has minimal required permissions
- [ ] JWT secret is strong and unique
- [ ] HTTPS enabled (automatic with Vercel)
- [ ] Environment variables secured in Vercel dashboard
- [ ] No sensitive data in client-side code
- [ ] Input validation working on all forms
- [ ] Authentication required for protected routes
- [ ] `ADMIN_ENABLED` set to `false` for production

## Monitoring

### Vercel Analytics
- Use Vercel's built-in analytics to monitor usage
- Track function execution times
- Monitor API endpoint usage

### MongoDB Atlas Metrics
- Check MongoDB Atlas metrics for database performance
- Monitor connection counts
- Track query performance

### Function Logs
- Monitor API endpoint usage in Vercel dashboard
- Check for errors in function logs
- Set up alerts for high error rates

## Scaling Considerations

If you need to scale beyond the free plan:

1. **Vercel Pro**: $20/month for more bandwidth and functions
2. **MongoDB Atlas M10**: $57/month for dedicated cluster
3. **Consider caching**: Add Redis for session storage if needed
4. **Database optimization**: Review and optimize slow queries

## Post-Deployment

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

## Support Resources

- **Vercel Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **MongoDB Atlas Documentation**: [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)
- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
- **Project Security Documentation**: See `SECURITY_FEATURES.md` for detailed security implementation

## Success!

Once deployed, your Leave Manager application will be available at your Vercel URL and ready for team use!

**Next Steps**:
1. Share the application URL with your team
2. Create team leader accounts
3. Set up team members
4. Start managing leave requests!
