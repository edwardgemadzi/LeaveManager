# Deployment Guide for Vercel

This guide will help you deploy the Leave Manager application to Vercel's free hobby plan.

## Prerequisites

1. **MongoDB Atlas Account**: Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. **GitHub Account**: For version control and Vercel integration
3. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)

## Step 1: Set up MongoDB Atlas

1. Create a new MongoDB Atlas cluster (free tier available)
2. Create a database user with read/write permissions
3. Whitelist all IP addresses (0.0.0.0/0) for Vercel deployment
4. Get your connection string (it will look like: `mongodb+srv://username:password@cluster.mongodb.net/`)

## Step 2: Prepare Your Code

1. Push your code to a GitHub repository
2. Make sure your `.env.local` file is in `.gitignore` (it should be by default)

## Step 3: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Vercel will auto-detect it's a Next.js project
5. Add the following environment variables in the Vercel dashboard:

### Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `MONGODB_URI` | `mongodb+srv://username:password@cluster.mongodb.net/leave-manager` | Your MongoDB Atlas connection string |
| `JWT_SECRET` | `your-super-secret-jwt-key-at-least-32-characters-long` | A secure random string for JWT signing |
| `NEXTAUTH_URL` | `https://your-app-name.vercel.app` | Your Vercel deployment URL (auto-set) |

### Important Notes for Vercel Free Plan:

- **Function Timeout**: 10 seconds (sufficient for this app)
- **Bandwidth**: 100GB/month (plenty for most use cases)
- **Build Time**: 45 minutes (more than enough)
- **Serverless Functions**: 100GB-hours (generous for this app)

## Step 4: Configure MongoDB Connection

1. In your MongoDB Atlas dashboard, go to "Network Access"
2. Add IP address `0.0.0.0/0` to allow all IPs (required for Vercel)
3. In "Database Access", create a user with read/write permissions
4. Use this user in your connection string

## Step 5: Test Your Deployment

1. Visit your Vercel URL
2. Try creating a team leader account
3. Test the registration and login flow
4. Verify the calendar and request features work

## Troubleshooting

### Common Issues:

1. **MongoDB Connection Errors**:
   - Check your connection string format
   - Ensure IP whitelist includes 0.0.0.0/0
   - Verify database user permissions

2. **JWT Errors**:
   - Make sure JWT_SECRET is set and is at least 32 characters
   - Check that the secret is the same across deployments

3. **Build Errors**:
   - Check the Vercel build logs
   - Ensure all dependencies are in package.json
   - Verify TypeScript compilation

### Performance Optimization for Free Plan:

1. **Database Indexing**: Add indexes on frequently queried fields:
   ```javascript
   // In MongoDB Atlas, create indexes on:
   // users: { username: 1 }, { teamId: 1 }
   // teams: { teamUsername: 1 }
   // leaveRequests: { teamId: 1 }, { userId: 1 }, { status: 1 }
   ```

2. **Connection Pooling**: The app uses MongoDB's built-in connection pooling

3. **Static Generation**: The app uses Next.js App Router for optimal performance

## Monitoring

- Use Vercel's built-in analytics to monitor usage
- Check MongoDB Atlas metrics for database performance
- Monitor function execution times in Vercel dashboard

## Scaling Considerations

If you need to scale beyond the free plan:

1. **Vercel Pro**: $20/month for more bandwidth and functions
2. **MongoDB Atlas M10**: $57/month for dedicated cluster
3. **Consider caching**: Add Redis for session storage if needed

## Security Best Practices

1. **Environment Variables**: Never commit secrets to Git
2. **JWT Secret**: Use a strong, random secret
3. **Database Access**: Use least-privilege database users
4. **HTTPS**: Vercel provides SSL certificates automatically
5. **Input Validation**: The app validates all user inputs

## Support

- **Vercel Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **MongoDB Atlas Documentation**: [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)
- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
