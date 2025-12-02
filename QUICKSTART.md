# ECTLogger - Quick Start Guide

## 🚀 Get Started in 5 Minutes

## ⚡ Speedrun Install (Recommended for Fresh Systems)

**One command to download, then run the installer:**

```bash
curl -fsSL https://raw.githubusercontent.com/bradbrownjr/ectlogger/main/bootstrap.sh | bash
```

This downloads the installer and shows you the command to run it. Just copy and run the command shown - the interactive installer will:

- Install Git, Python 3, Node.js 22 LTS, and build tools
- Clone the ECTLogger repository to `~/ectlogger`
- Set up the Python virtual environment and install dependencies
- Walk you through email configuration (for magic link authentication)
- Optionally set up ECTLogger as a system service

Works on Debian, Ubuntu, Fedora, RHEL, Rocky, and macOS.

After it completes, just run `./start.sh` to launch!

---

## 📋 Manual Installation

If you prefer to install manually or the speedrun doesn't work for your system:

### Prerequisites
- Python 3.9+ installed
- Node.js 18+ installed
- Email account for sending notifications (Gmail recommended)

### Step 1: Download & Setup

#### Linux/macOS
```bash
# Clone the repository
git clone https://github.com/bradbrownjr/ectlogger.git
cd ectlogger

# Make scripts executable
chmod +x *.sh

# Run the installation script
./install.sh
```

#### Windows (PowerShell)
```powershell
# Clone the repository
git clone https://github.com/bradbrownjr/ectlogger.git
cd ectlogger

# Run the startup script (it will install everything automatically)
.\start.ps1
```

The scripts will:
- Create Python virtual environment
- Install all backend dependencies
- Install all frontend dependencies
- Start both servers

### Step 2: Configure Email

Before first use, configure email settings using the interactive wizard:

#### Linux/macOS
```bash
./configure.sh
```

#### Windows (PowerShell)
```powershell
.\configure.ps1
```

Or manually:
1. Copy `.env.example` to `backend/.env`
2. Edit `backend/.env` and set your email credentials

**For Gmail:**
- Go to Google Account Settings
- Security → 2-Step Verification → App passwords
- Generate an app password and use it in `SMTP_PASSWORD`

### Step 3: Access the Application

Open your browser to:
- **Application**: http://localhost:3000
- **API Documentation**: http://localhost:8000/docs

### Step 4: First Login

1. Enter your email address
2. Click "Send Magic Link"
3. Check your email
4. Click the link to sign in
5. You're in! 🎉

## Start the Application

#### Linux/macOS
```bash
./start.sh
```

#### Windows (PowerShell)
```powershell
.\start.ps1
```

## Manual Start (Alternative)

If you prefer to start servers manually:

### Linux/macOS Backend
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Windows Backend
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (all platforms)
```bash
cd frontend
npm run dev
```

## Common Issues

### Port Already in Use
- Close other applications using ports 8000 or 3000
- Or modify ports in the configuration

### Email Not Sending
- Verify SMTP credentials in `.env`
- For Gmail, use an App Password (not your regular password)
- Check that 2-Step Verification is enabled for Gmail

### Dependencies Installation Failed
- Ensure Python and Node.js are in your PATH
- Try running installation manually:
  ```powershell
  cd backend
  pip install -r requirements.txt
  cd ..\frontend
  npm install
  ```

## ⚠️ First Login - Administrator Setup

**Important**: The first user to sign in is automatically granted Administrator privileges. Before making your server publicly accessible, you should:

1. Complete first-time setup and configure email
2. Access the application and sign in with your email
3. Verify you have admin access (you'll see the Admin panel in the navigation)
4. Only then expose the server to the network/internet

This ensures the server owner becomes the administrator before anyone else can access the system.

## What's Next?

See the full documentation:
- **[MANUAL-INSTALLATION.md](MANUAL-INSTALLATION.md)** - Step-by-step manual installation
- **[PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md)** - Deploy with SSL/HTTPS
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development guide and project structure
- **[README.md](README.md)** - Feature overview and requirements

## Getting Help

- Check the API documentation at http://localhost:8000/docs
- Review the documentation files for detailed configuration
- Open an issue on GitHub
