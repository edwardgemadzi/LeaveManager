# Leave Manager

A comprehensive leave management application built with Next.js, MongoDB, and Tailwind CSS. This application allows team leaders to manage their team's leave requests and team members to submit and track their leave requests.

## Features

### Team Leaders
- Create and manage teams
- Approve or reject leave requests from team members
- Make requests on behalf of team members
- View team calendar with all leave requests
- Configure team settings (concurrent leave limits, max leave per year, carryover settings)
- Dashboard with team overview and pending requests
- **Analytics Dashboard** - View comprehensive team analytics including:
  - Leave usage patterns and frequency
  - Grouped analytics by working days/shift schedules
  - Year-end projections and carryover calculations
  - Competition metrics for shared leave days
- Manage team members and their leave balances
- Emergency leave request handling
- Bulk leave request operations

### Team Members
- Join existing teams using team username
- Submit leave requests with custom shift schedules
- View personal leave balance and request history
- Access team calendar to see all team leave requests
- Dashboard with personal leave information
- **Personal Analytics** - View your own analytics including:
  - Remaining leave balance and usable days
  - Competition context (members sharing same schedule)
  - Surplus balance calculations
  - Year-end projections

### Shared Features
- Team-specific calendar highlighting leave requests
- Role-based access control
- JWT authentication
- Responsive design with Tailwind CSS
- Shift schedule support for different work patterns
- Real-time updates via Server-Sent Events (SSE) with polling fallback
- Leave carryover from previous year (configurable)
- Subgroup support for organizing team members
- Contact form for feedback

### Admin Panel (Localhost Only - Not Included in Repository)
- Admin dashboard for managing users and teams
- User management (create, edit, delete users)
- Team management (create, edit, delete teams)
- Password reset functionality
- **Note**: Admin features are not included in this repository. They are intentionally excluded from version control as they are for localhost development only. Admin features require `ADMIN_ENABLED=true` environment variable and are only accessible from localhost.

## Tech Stack

- **Frontend**: Next.js 15 with App Router, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: MongoDB Atlas
- **Authentication**: JWT tokens with bcrypt password hashing
- **Calendar**: React Big Calendar
- **Styling**: Tailwind CSS
- **Icons**: Heroicons React
- **Validation**: Joi schema validation
- **Rate Limiting**: Express Rate Limit
- **Testing**: Playwright (E2E tests)

## Getting Started

### Prerequisites

- Node.js 18+ 
- MongoDB Atlas account
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd LeaveManager
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory:
```env
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
NEXTAUTH_URL=http://localhost:3000
ADMIN_ENABLED=false
```

**Environment Variables:**
- `MONGODB_URI`: Your MongoDB Atlas connection string (required)
- `JWT_SECRET`: A secure random string for JWT signing, at least 32 characters (required)
- `NEXTAUTH_URL`: Your application URL (required)
- `ADMIN_ENABLED`: Set to `true` to enable admin panel on localhost (optional, default: false)

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing

This project includes comprehensive end-to-end tests using Playwright.

### Install Playwright Browsers
```bash
npm run test:install
```

### Run Tests
```bash
# Run all tests
npm test

# Run tests in UI mode
npm run test:ui

# Run tests in headed mode (see browser)
npm run test:headed

# Run tests in debug mode
npm run test:debug

# View test report
npm run test:report
```

See `tests/README.md` for detailed testing documentation.

## Deployment on Vercel

This application is optimized for deployment on Vercel's free hobby plan:

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add your environment variables in Vercel dashboard
4. Deploy!

### Environment Variables for Vercel:
- `MONGODB_URI`: Your MongoDB Atlas connection string
- `JWT_SECRET`: A secure random string for JWT signing (at least 32 characters)
- `NEXTAUTH_URL`: Your Vercel deployment URL (auto-set by Vercel)
- `ADMIN_ENABLED`: Set to `false` for production (admin panel is localhost only)

See `DEPLOYMENT.md` for detailed deployment instructions.

## Usage

### For Team Leaders:
1. Register as a team leader and create a new team
2. Share your team username with team members
3. Configure team settings (leave limits, carryover settings, subgroups)
4. Review and approve/reject leave requests
5. Monitor team calendar and analytics
6. Manage team members and their leave balances

### For Team Members:
1. Register as a team member using your team's username
2. Set up your shift schedule during registration
3. Submit leave requests
4. View your leave balance and request history
5. Check team calendar for conflicts
6. Monitor your personal analytics

## Security

This application implements comprehensive security features:

- **Rate Limiting**: Protection against brute force attacks
- **Input Validation**: Joi schema validation on all endpoints
- **CORS Protection**: Configured for production domain
- **Security Headers**: XSS, clickjacking, and MIME type sniffing protection
- **Password Security**: Strong password requirements with bcrypt hashing
- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access Control**: Leader vs Member permissions
- **Team Isolation**: Users can only access their team's data
- **Error Handling**: No sensitive information in error responses

See `SECURITY_FEATURES.md` for detailed security implementation documentation.

## Database Schema

### Users Collection
- `_id`: Unique identifier
- `username`: User's login username
- `password`: Hashed password
- `role`: 'leader' or 'member'
- `teamId`: Reference to team
- `shiftSchedule`: Work pattern for members
- `fullName`: User's full name
- `manualLeaveBalance`: Optional manual balance override (leaders only)
- `carryoverFromPreviousYear`: Carryover balance from previous year
- `carryoverExpiryDate`: Optional expiry date for carryover days
- `createdAt`: Registration timestamp

### Teams Collection
- `_id`: Unique identifier
- `name`: Team display name
- `teamUsername`: Unique team identifier for joining
- `leaderId`: Reference to team leader
- `settings`: Team configuration (leave limits, carryover settings, subgroups)
- `createdAt`: Team creation timestamp

### LeaveRequests Collection
- `_id`: Unique identifier
- `userId`: Reference to user making request
- `teamId`: Reference to team
- `startDate`: Leave start date
- `endDate`: Leave end date
- `reason`: Leave reason
- `status`: 'pending', 'approved', or 'rejected'
- `requestedBy`: For leader requests on behalf of members
- `createdAt`: Request timestamp
- `updatedAt`: Last update timestamp

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register-leader` - Team leader registration
- `POST /api/auth/register-member` - Team member registration
- `POST /api/auth/change-password` - Change user password

### Leave Requests
- `GET /api/leave-requests?teamId={id}` - Get team leave requests
- `POST /api/leave-requests` - Create leave request
- `PATCH /api/leave-requests/{id}` - Update request status (leaders only)
- `DELETE /api/leave-requests/{id}` - Delete/cancel leave request
- `POST /api/leave-requests/bulk` - Bulk leave request operations
- `POST /api/leave-requests/emergency` - Emergency leave request (leaders only)

### Team Management
- `GET /api/team` - Get team information and members
- `PATCH /api/team` - Update team settings (leaders only)
- `GET /api/team/partial-overlap` - Get members with partial schedule overlap

### Analytics
- `GET /api/analytics?year={year}` - Get analytics data (role-specific)

### Dashboard
- `GET /api/dashboard` - Get dashboard data (role-specific)

### Users
- `GET /api/users/{id}` - Get user information
- `PATCH /api/users/{id}` - Update user (leaders can update member balances)
- `GET /api/users/profile` - Get current user profile
- `PATCH /api/users/profile` - Update current user profile
- `PATCH /api/users/{id}/schedule` - Update user shift schedule

### Events (Real-time Updates)
- `GET /api/events` - Server-Sent Events stream for real-time team updates

### Contact
- `POST /api/contact` - Submit contact form

### Audit
- `GET /api/audit?teamId={id}` - Get audit logs (leaders only)

### Admin (Localhost Only - Not Included in Repository)
**Note**: Admin API endpoints are not included in this repository. They are intentionally excluded from version control as they are for localhost development only. If you need admin functionality, you would need to implement these endpoints separately.

The following endpoints would be available if admin features were included:
- `GET /api/admin/users` - Get all users
- `GET /api/admin/teams` - Get all teams
- `GET /api/admin/users/{id}` - Get user details
- `PATCH /api/admin/users/{id}` - Update user
- `POST /api/admin/users/{id}/reset-password` - Reset user password
- `GET /api/admin/teams/{id}` - Get team details
- `PATCH /api/admin/teams/{id}` - Update team
- `GET /api/admin/teams/{id}/members` - Get team members

### Migration (Localhost Only)
- `POST /api/migrate/year-end-carryover` - Update carryover for all teams or specific team

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (run `npm test`)
5. Submit a pull request

## License

This project is licensed under the MIT License.
