---
title: Manual installation
summary: Every step the quick start performs, done by hand, for when you need to understand or adapt what it did.
kind: How-to
audience: Server operators
owner: KC1JMH
revised: 2026-09-25
review_by: 2027-09-19
applies_to: ECTLogger, self-hosted
permalink: /docs/MANUAL-INSTALLATION/
---

# Manual installation

> 📌 **New users**: Start with **[Quick Start Guide](QUICKSTART.md)** for an easier automated setup!

This guide covers manual step-by-step installation for advanced users, developers, or deployment environments where the automated scripts aren't suitable.

## Overview

ECTLogger is a modern web-based net logger for Emergency Communications Teams and SKYWARN spotter nets. It features real-time check-ins, multi-frequency support, and comprehensive net management.

## Technology Stack

- **Backend**: Python FastAPI with SQLAlchemy ORM
- **Frontend**: React with TypeScript and Material-UI (MUI)
- **Database**: SQLite (default), PostgreSQL or MySQL supported
- **Authentication**: OAuth2 (Google, Microsoft, GitHub) + Magic Link email authentication
- **Real-time**: WebSockets for live updates

## Prerequisites

- Python 3.11 or higher
- Node.js 18 or higher
- Git

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/ectlogger.git
cd ectlogger
```

### 2. Backend Setup

#### Create Python Virtual Environment

**Linux/macOS:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

**Windows:**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

#### Install Dependencies

```bash
pip install -r requirements.txt
```

#### Configure Environment Variables

Copy the example environment file:

**Linux/macOS:**
```bash
cp .env.example backend/.env
```

**Windows:**
```powershell
Copy-Item .env.example backend\.env
```

Edit `backend/.env` file with your settings:

```env
# Database (SQLite by default)
DATABASE_URL=sqlite:///./ectlogger.db

# Security - GENERATE A STRONG SECRET KEY!
SECRET_KEY=your-very-secure-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440  # 24 hours; only used before any admin has saved Session Settings.
                                   # The real session lifetime (default 90 days, with rolling renewal)
                                   # is set in Admin > Security > Session Settings instead.

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Email Configuration (Required for authentication)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@ectlogger.com
SMTP_FROM_NAME=ECTLogger

# OAuth Providers (Optional - configure as needed)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Frontend Serving (Production only)
# Set to true when using Caddy/Nginx to serve static files from frontend/dist/
# SKIP_VITE=true
```

**Important Notes:**
- Generate a secure SECRET_KEY using: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
- For Gmail SMTP, you need to create an "App Password" in your Google Account settings
- OAuth providers are optional and can be added later

#### Initialize Database

The database will be automatically created on first run. No manual initialization needed.

### 3. Frontend Setup

Open a new terminal window:

```powershell
cd frontend
```

#### Install Dependencies

```powershell
npm install
```

#### Configure Frontend Environment (Optional)

Create `.env.local` file if you need to customize the API URL:

```env
VITE_API_URL=http://localhost:8000/api
```

> **Note**: The `/api` suffix is required. All backend routes are prefixed with `/api` for reverse proxy compatibility.

## Running the Application

### Start Backend Server

**Linux/macOS:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Windows:**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at: http://localhost:8000
API documentation: http://localhost:8000/docs

### Start Frontend Development Server

In a separate terminal:

```bash
cd frontend
npm run dev
```

The application will be available at: http://localhost:3000

### Quick Start Scripts

**Linux/macOS:**
```bash
chmod +x *.sh
./install.sh    # One-time setup
./configure.sh  # Configure email and database
./start.sh      # Start both servers
```

**Windows:**
```powershell
.\start.ps1     # Install and start
```

## First Time Setup

1. Open your browser to http://localhost:3000
2. Click "Send Magic Link"
3. Enter your email address
4. Check your email for the magic link
5. Click the link to sign in
6. Your account will be created automatically

## Setting Up OAuth Providers (Optional)

> **Not currently functional.** Client registration for Google/Microsoft/GitHub exists
> (`backend/app/routers/auth.py`), but the callback route that exchanges the authorization
> code for a token is an unimplemented stub (`HTTPException(501)`). Configuring the values
> below registers the client but sign-in via any of these providers will fail at the
> callback step. Magic link and password (see [PASSWORD-MFA.md](PASSWORD-MFA.md)) are the
> only working sign-in methods today. See [SECURITY.md](SECURITY.md) for detail.

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:8000/auth/oauth/google/callback`
6. Copy Client ID and Secret to `.env` file

### Microsoft OAuth

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to Azure Active Directory > App registrations
3. Register new application
4. Add redirect URI: `http://localhost:8000/auth/oauth/microsoft/callback`
5. Create client secret
6. Copy Application (client) ID and secret to `.env` file

### GitHub OAuth

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create new OAuth App
3. Set callback URL: `http://localhost:8000/auth/oauth/github/callback`
4. Copy Client ID and generate Client Secret
5. Add to `.env` file

## Database Options

### Using PostgreSQL

1. Install PostgreSQL
   ```bash
   # Ubuntu/Debian
   sudo apt install postgresql postgresql-contrib
   
   # macOS
   brew install postgresql
   ```

2. Create database:
   ```bash
   sudo -u postgres createdb ectlogger
   sudo -u postgres createuser your_username
   ```

3. Update `backend/.env`:
   ```env
   DATABASE_URL=postgresql+asyncpg://username:password@localhost/ectlogger
   ```

### Using MySQL

1. Install MySQL
   ```bash
   # Ubuntu/Debian
   sudo apt install mysql-server
   
   # macOS
   brew install mysql
   ```

2. Create database:
   ```sql
   CREATE DATABASE ectlogger;
   CREATE USER 'your_user'@'localhost' IDENTIFIED BY 'password';
   GRANT ALL PRIVILEGES ON ectlogger.* TO 'your_user'@'localhost';
   ```

3. Update `backend/.env`:
   ```env
   DATABASE_URL=mysql+aiomysql://username:password@localhost/ectlogger
   ```

## Production Deployment

### Backend Deployment

1. Set `APP_ENV=production` in `backend/.env`
2. Run the backend with uvicorn directly, without `--reload` — this project does not use
   gunicorn or a WSGI worker manager anywhere:
   ```bash
   cd backend
   source venv/bin/activate
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   The `install-service.sh` script (or the systemd section below) wraps this same command
   in a managed service instead of running it in a terminal.
3. Set up reverse proxy (nginx, Apache, or Caddy — see [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md))
4. Enable HTTPS with SSL certificates (Let's Encrypt)
5. Configure firewall rules

### Frontend Deployment

```bash
cd frontend
npm run build
```

The `dist` folder contains production-ready static files.

> **Important:** If using a reverse proxy (Caddy, nginx) to serve the frontend, ensure the web server user can read the files. Home directories are typically mode 700, which prevents access:
> ```bash
> # Make directories traversable for the web server
> chmod 755 /home/your-user
> chmod 755 /path/to/ectlogger
> chmod 755 /path/to/ectlogger/frontend
> chmod -R a+rX /path/to/ectlogger/frontend/dist
> ```

### systemd Service (Linux)

Run `./install-service.sh` from the repo root — it detects the current user and install
path and writes `/etc/systemd/system/ectlogger.service` for you, running the backend (and,
unless `SKIP_VITE=true`, the frontend dev server) through `start.sh --service`:

```bash
./install-service.sh
```

Enable and start:
```bash
sudo systemctl enable ectlogger
sudo systemctl start ectlogger
```

Serve with:
- Nginx
- Apache
- Caddy
- Any static file hosting service

### Environment Variables for Production

Update these settings:
- Set strong `SECRET_KEY`
- Use production database (PostgreSQL recommended)
- Configure production SMTP server
- Set `FRONTEND_URL` to your domain
- Enable HTTPS
- Configure OAuth redirect URIs for your domain

## Troubleshooting

### Email Not Sending

- Verify SMTP credentials
- For Gmail, use an App Password — Google removed the "less secure app access" toggle for
  personal accounts, so an App Password is the only way to authenticate
- Check firewall settings for SMTP port

### Database Connection Errors

- Ensure database server is running
- Verify connection string in `DATABASE_URL`
- Check database user permissions

### WebSocket Connection Issues

- Ensure both frontend and backend are running
- Check CORS settings in `backend/app/main.py`
- Verify WebSocket URL in frontend

### Import Errors

The lint errors you're seeing are expected before dependencies are installed. They will resolve after running:
- Backend: `pip install -r requirements.txt`
- Frontend: `npm install`

## User Roles

- **Guest**: View-only access to active nets
- **User**: Can check in to nets, participate in chat
- **NCS**: Can create and manage nets, designate loggers
- **Admin**: Full system access, user management

> 💡 **Note**: The first user to sign in is automatically granted Administrator privileges. Make sure to sign in before making the server publicly accessible.

## Support and Documentation

- API Documentation: http://localhost:8000/docs (when backend is running)
- GitHub Issues: Report bugs and feature requests
- README.md: Feature overview and requirements

## License

MIT License - See LICENSE file for details
