# Leave Manager

A comprehensive leave management application built with Next.js, MongoDB, and Tailwind CSS. This application allows team leaders to manage their team's leave requests and team members to submit and track their leave requests.

## Features

### Team Leaders
- Create and manage teams
- Approve or reject leave requests from team members
- Make requests on behalf of team members
- View team calendar with all leave requests
- Configure team settings (concurrent leave limits, max leave per year)
- Dashboard with team overview and pending requests

### Team Members
- Join existing teams using team username
- Submit leave requests with custom shift schedules
- View personal leave balance and request history
- Access team calendar to see all team leave requests
- Dashboard with personal leave information

### Shared Features
- Team-specific calendar highlighting leave requests
- Role-based access control
- JWT authentication
- Responsive design with Tailwind CSS
- Shift schedule support for different work patterns

## Tech Stack

- **Frontend**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: MongoDB Atlas
- **Authentication**: JWT tokens
- **Calendar**: React Big Calendar
- **Styling**: Tailwind CSS

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
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment on Vercel

This application is optimized for deployment on Vercel's free hobby plan:

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add your environment variables in Vercel dashboard
4. Deploy!

### Environment Variables for Vercel:
- `MONGODB_URI`: Your MongoDB Atlas connection string
- `JWT_SECRET`: A secure random string for JWT signing
- `NEXTAUTH_URL`: Your Vercel deployment URL (auto-set by Vercel)

## Usage

### For Team Leaders:
1. Register as a team leader and create a new team
2. Share your team username with team members
3. Configure team settings (leave limits)
4. Review and approve/reject leave requests
5. Monitor team calendar

### For Team Members:
1. Register as a team member using your team's username
2. Set up your shift schedule during registration
3. Submit leave requests
4. View your leave balance and request history
5. Check team calendar for conflicts

## Database Schema

### Users Collection
- `_id`: Unique identifier
- `username`: User's login username
- `password`: Hashed password
- `role`: 'leader' or 'member'
- `teamId`: Reference to team
- `shiftSchedule`: Work pattern for members
- `createdAt`: Registration timestamp

### Teams Collection
- `_id`: Unique identifier
- `name`: Team display name
- `teamUsername`: Unique team identifier for joining
- `leaderId`: Reference to team leader
- `settings`: Team configuration (leave limits)
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

### Leave Requests
- `GET /api/leave-requests?teamId={id}` - Get team leave requests
- `POST /api/leave-requests` - Create leave request
- `PATCH /api/leave-requests/{id}` - Update request status (leaders only)

### Team Management
- `GET /api/team` - Get team information and members
- `PATCH /api/team` - Update team settings (leaders only)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.