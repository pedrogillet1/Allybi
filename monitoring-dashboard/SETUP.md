# Koda Monitoring Dashboard - Standalone Application

A standalone React application for monitoring Koda's telemetry data, user activity, system health, and performance metrics.

## Overview

This is a completely independent monitoring dashboard application that runs separately from the main Koda webapp. It provides real-time insights into:

- System Health & Overview
- Intent Classification Analysis
- RAG Retrieval Performance
- Error Tracking & Fallbacks
- User Activity & Engagement
- Database & Encryption Status

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Backend API running on `http://localhost:5000`

## Installation

Dependencies are already installed. If you need to reinstall:

```bash
npm install
```

## Configuration

The application is configured to run on port 3001 (via `.env` file):

```
PORT=3001
```

## Running the Application

Start the development server:

```bash
npm start
```

The application will open at `http://localhost:3001`

## Project Structure

```
monitoring-dashboard/
├── src/
│   ├── components/
│   │   ├── Login.jsx                    # Authentication component
│   │   └── dashboard/
│   │       ├── charts/                  # Chart components
│   │       │   ├── SimpleBarChart.jsx
│   │       │   └── SimpleLineChart.jsx
│   │       ├── layout/                  # Layout components
│   │       │   ├── Header.jsx
│   │       │   ├── Sidebar.jsx
│   │       │   ├── PageLayout.jsx
│   │       │   └── index.js
│   │       ├── pages/                   # Dashboard pages
│   │       │   ├── Overview.jsx
│   │       │   ├── IntentAnalysis.jsx
│   │       │   ├── Retrieval.jsx
│   │       │   ├── Errors.jsx
│   │       │   ├── Users.jsx
│   │       │   ├── Database.jsx
│   │       │   └── index.js
│   │       ├── ui/                      # UI components
│   │       │   ├── Card.jsx
│   │       │   ├── ErrorMessage.jsx
│   │       │   ├── LoadingSpinner.jsx
│   │       │   └── MetricCard.jsx
│   │       └── dashboard.css
│   ├── context/
│   │   └── AuthContext.jsx              # Authentication state management
│   ├── services/
│   │   └── api.js                       # API service layer
│   ├── types/
│   │   └── telemetry.js                 # TypeScript-style type definitions
│   ├── App.js                           # Main app with routing
│   ├── index.js                         # Entry point
│   └── index.css                        # Global styles
├── .env                                 # Environment configuration
└── package.json
```

## Authentication

The application requires authentication to access the dashboard:

1. Navigate to `http://localhost:3001/login`
2. Enter your credentials (email/password)
3. The app will POST to `http://localhost:5000/api/auth/login`
4. On success, JWT token is stored in localStorage
5. Protected routes require authentication

### Authentication Flow

- **Login Component**: Simple form with email/password
- **AuthContext**: Manages authentication state across the app
- **Protected Routes**: All dashboard pages require authentication
- **Token Storage**: JWT token stored in localStorage
- **Logout**: Available in sidebar, clears token and redirects to login

## Routes

### Public Routes
- `/login` - Authentication page

### Protected Routes (requires authentication)
- `/` - Overview dashboard
- `/intent-analysis` - Intent classification metrics
- `/retrieval` - RAG retrieval performance
- `/errors` - Error tracking and fallbacks
- `/users` - User activity and engagement
- `/database` - Database status and encryption

## API Integration

The dashboard fetches data from the backend API at `http://localhost:5000`:

- `GET /api/dashboard/overview` - System health and metrics
- `GET /api/dashboard/intent-analysis` - Intent classification data
- `GET /api/dashboard/retrieval` - Retrieval performance data
- `GET /api/dashboard/errors` - Error tracking data
- `GET /api/dashboard/users` - User activity data
- `GET /api/dashboard/database` - Database status data

## Key Features

### Authentication
- Secure JWT-based authentication
- Protected routes with automatic redirects
- Persistent sessions via localStorage
- User-friendly login interface

### Dashboard Pages
- **Overview**: System health, request volume, intent distribution
- **Intent Analysis**: Classification accuracy, confidence, fallback rates
- **Retrieval**: RAG performance, chunk retrieval, vector search metrics
- **Errors**: Error tracking, trends, service-specific errors
- **Users**: Active users, query volume, engagement metrics
- **Database**: Storage, encryption status, ZK verification

### UI Components
- Responsive design with custom utility classes
- Loading states and error handling
- Interactive charts (Recharts library)
- Metric cards with change indicators
- Sidebar navigation with active state

## Development

### Building for Production

```bash
npm run build
```

Creates an optimized production build in the `build/` directory.

### Running Tests

```bash
npm test
```

### Custom Styling

The application uses a custom utility class system (similar to Tailwind CSS) defined in `index.css`. Color variables are defined in CSS custom properties for easy theming.

## Dependencies

- **react**: ^19.2.3
- **react-router-dom**: ^7.12.0 - Routing and navigation
- **recharts**: ^3.6.0 - Data visualization
- **lucide-react**: ^0.562.0 - Icon library

## Notes

- The app is completely standalone and independent from the main Koda webapp
- All imports are correctly configured for the new file structure
- The API base URL is `/api/dashboard` (proxied to localhost:5000)
- Authentication tokens are managed via AuthContext
- Custom CSS utility classes provide styling without Tailwind CSS dependency

## Troubleshooting

### Port Already in Use
If port 3001 is already in use, update the `.env` file with a different port:
```
PORT=3002
```

### API Connection Issues
Ensure the backend API is running on `http://localhost:5000`. Check CORS settings if encountering cross-origin errors.

### Authentication Issues
- Clear localStorage if experiencing stale token issues
- Verify backend `/api/auth/login` endpoint is working
- Check that JWT token format matches expected structure

## Future Enhancements

- Real-time updates via WebSocket
- Export data functionality
- Advanced filtering and search
- User preferences and settings
- Mobile-responsive optimizations
