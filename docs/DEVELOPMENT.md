# ECTLogger Development Guide

## Project Structure

```
ectlogger/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI application entry point
│   │   ├── config.py            # Configuration settings
│   │   ├── database.py          # Database connection and session
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── schemas.py           # Pydantic schemas for validation
│   │   ├── auth.py              # Authentication utilities
│   │   ├── dependencies.py      # FastAPI dependencies
│   │   ├── email_service.py     # Email notification service
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── auth.py          # Authentication endpoints
│   │       ├── users.py         # User management endpoints
│   │       ├── nets.py          # Net management endpoints
│   │       ├── check_ins.py     # Check-in endpoints
│   │       └── frequencies.py   # Frequency management endpoints
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── Navbar.tsx       # Navigation bar component
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx  # Authentication context
│   │   ├── pages/
│   │   │   ├── Login.tsx        # Login page
│   │   │   ├── Dashboard.tsx    # Main dashboard
│   │   │   ├── NetView.tsx      # Net details and check-ins
│   │   │   └── CreateNet.tsx    # Create new net
│   │   ├── services/
│   │   │   └── api.ts           # API client and endpoints
│   │   ├── App.tsx              # Main application component
│   │   ├── main.tsx             # Application entry point
│   │   └── vite-env.d.ts        # TypeScript declarations
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── .env.example
├── .gitignore
├── LICENSE
├── README.md
└── MANUAL-INSTALLATION.md
```

## Key Features Implemented

### Authentication
- Magic link email authentication
- OAuth2 support (Google, Microsoft, GitHub)
- JWT token-based authentication
- Role-based access control (Admin, NCS, User, Guest)

### Net Management
- Create, update, and delete nets
- Start and close nets
- Multi-frequency support with active frequency tracking
- Net status tracking (Draft, Scheduled, Active, Closed)
- NCS, logger, and relay role assignments

### Check-ins
- Create check-ins with required and optional fields
- Recheck tracking (stations checking in multiple times)
- Real-time updates via WebSocket
- Status tracking (Checked In, Listening, Available, Away, Checked Out)
- Frequency tracking per check-in

### Real-time Features
- WebSocket connections for live net updates
- Instant check-in notifications
- Real-time frequency changes
- Live chat functionality (backend ready, frontend can be extended)

### Email Notifications
- Magic link authentication emails
- Net start notifications to subscribers
- Net invitation emails
- Net closure logs emailed to NCS

## API Endpoints

### Authentication (`/auth`)
- `POST /auth/magic-link/request` - Request magic link
- `POST /auth/magic-link/verify` - Verify magic link
- `GET /auth/oauth/{provider}` - OAuth login
- `GET /auth/oauth/{provider}/callback` - OAuth callback
- `GET /auth/me` - Get current user

### Users (`/users`)
- `GET /users/me` - Get current user profile
- `PUT /users/me` - Update current user profile
- `GET /users/` - List all users (admin)
- `GET /users/{user_id}` - Get user by ID
- `PUT /users/{user_id}/role` - Update user role (admin)

### Nets (`/nets`)
- `POST /nets/` - Create net
- `GET /nets/` - List nets (with status filter)
- `GET /nets/{net_id}` - Get net details
- `PUT /nets/{net_id}` - Update net
- `POST /nets/{net_id}/start` - Start net
- `POST /nets/{net_id}/close` - Close net
- `DELETE /nets/{net_id}` - Delete net

### Check-ins (`/check-ins`)
- `POST /check-ins/nets/{net_id}/check-ins` - Create check-in
- `GET /check-ins/nets/{net_id}/check-ins` - List check-ins
- `GET /check-ins/check-ins/{check_in_id}` - Get check-in
- `PUT /check-ins/check-ins/{check_in_id}` - Update check-in
- `DELETE /check-ins/check-ins/{check_in_id}` - Delete check-in

### Frequencies (`/frequencies`)
- `POST /frequencies/` - Create frequency
- `GET /frequencies/` - List frequencies
- `GET /frequencies/{frequency_id}` - Get frequency
- `DELETE /frequencies/{frequency_id}` - Delete frequency

### WebSocket
- `WS /ws/nets/{net_id}` - Real-time net updates

## Database Models

### User
- Authentication and profile information
- Role assignment (Admin, NCS, User, Guest)
- Email and SMS notification preferences
- SKYWARN spotter number

### Net
- Net metadata and status
- Owner and frequency assignments
- Start and close timestamps
- Active frequency tracking

### CheckIn
- Station information (callsign, name, location)
- Required and optional fields
- Status and recheck tracking
- Frequency assignment per check-in

### Frequency
- Frequency and mode information
- Many-to-many relationship with nets

### NetRole
- User role assignments for specific nets
- NCS, Logger, Relay designations

### CustomField & CustomFieldValue
- Dynamic form field creation
- Field type support (text, number, textarea, select)
- Per-net field requirements

### ChatMessage
- Real-time chat for active nets
- Message history

## Adding New Features

### Adding a New Field to Check-ins

1. **Backend**: Update `models.py`
   ```python
   # In CheckIn model
   new_field = Column(String(255))
   ```

2. **Backend**: Update `schemas.py`
   ```python
   # In CheckInBase schema
   new_field: Optional[str] = None
   ```

3. **Frontend**: Update check-in form in `NetView.tsx`
   ```tsx
   <TextField
     label="New Field"
     value={checkInForm.new_field}
     onChange={(e) => setCheckInForm({...checkInForm, new_field: e.target.value})}
   />
   ```

### Adding Custom Reports

1. Create new router in `backend/app/routers/reports.py`
2. Add database queries for report data
3. Create frontend page in `frontend/src/pages/Reports.tsx`
4. Add route to `App.tsx`

### Adding SMS Notifications

1. Integrate SMS service (Twilio, AWS SNS)
2. Update `email_service.py` to include SMS sending
3. Add SMS gateway configuration to user profiles
4. Update notification triggers to send both email and SMS

## Testing

### Backend Testing

```powershell
cd backend
pip install pytest pytest-asyncio httpx
pytest
```

### Frontend Testing

```powershell
cd frontend
npm install --save-dev vitest @testing-library/react
npm test
```

## Code Style

### Backend (Python)
- Follow PEP 8
- Use type hints
- Async/await for database operations
- Comprehensive error handling

### Frontend (TypeScript)
- Use TypeScript strict mode
- Functional components with hooks
- Material-UI design system
- Proper prop typing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

## Common Development Tasks

### Adding a New Page

1. Create component in `frontend/src/pages/`
2. Add route in `App.tsx`
3. Add navigation link if needed

### Adding a New API Endpoint

1. Define schema in `schemas.py`
2. Add route in appropriate router file
3. Update API client in `frontend/src/services/api.ts`
4. Use in frontend components

### Database Migrations (Future Enhancement)

Consider adding Alembic for database migrations:
```powershell
cd backend
alembic init alembic
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

## Performance Considerations

- Use database indexes on frequently queried fields
- Implement pagination for large lists
- Use WebSocket selectively to reduce server load
- Cache frequently accessed data
- Optimize database queries with proper relationships

## Security Best Practices

- Always use HTTPS in production
- Validate all user inputs
- Use parameterized queries (SQLAlchemy handles this)
- Implement rate limiting for API endpoints
- Regularly update dependencies
- Use environment variables for sensitive data
- Implement proper CORS policies
