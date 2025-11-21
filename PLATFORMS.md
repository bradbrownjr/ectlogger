# Cross-Platform Setup Guide

ECTLogger works on Linux, macOS, and Windows. Choose your platform below.

## 🐧 Linux / 🍎 macOS

### Quick Start
```bash
# Make scripts executable
chmod +x *.sh

# Install everything
./install.sh

# Configure
./configure.sh

# Start
./start.sh
```

### Scripts Available
- `install.sh` - Complete installation and setup
- `configure.sh` - Interactive configuration wizard
- `verify-setup.sh` - Verify installation
- `start.sh` - Start both backend and frontend servers

### Manual Commands
```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

## 🪟 Windows

### Quick Start
```powershell
# Run startup script (installs and starts)
.\start.ps1
```

### Scripts Available
- `start.ps1` - Install dependencies and start servers
- `configure.ps1` - Interactive configuration wizard
- `verify-setup.ps1` - Verify installation

### Manual Commands
```powershell
# Backend
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

## 📧 Email Configuration (All Platforms)

### Using Configuration Script

**Linux/macOS:**
```bash
./configure.sh
```

**Windows:**
```powershell
.\configure.ps1
```

### Manual Configuration

1. Copy template:
   - Linux/macOS: `cp .env.example backend/.env`
   - Windows: `Copy-Item .env.example backend\.env`

2. Edit `backend/.env` and set:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   ```

3. Generate SECRET_KEY:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

## 🗄️ Database Options (All Platforms)

### SQLite (Default)
No setup needed! Works out of the box.

```env
DATABASE_URL=sqlite:///./ectlogger.db
```

### PostgreSQL

**Install:**
- Linux: `sudo apt install postgresql postgresql-contrib`
- macOS: `brew install postgresql`
- Windows: Download from postgresql.org

**Setup:**
```sql
CREATE DATABASE ectlogger;
CREATE USER your_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE ectlogger TO your_user;
```

**Configure:**
```env
DATABASE_URL=postgresql+asyncpg://your_user:your_password@localhost/ectlogger
```

### MySQL

**Install:**
- Linux: `sudo apt install mysql-server`
- macOS: `brew install mysql`
- Windows: Download from mysql.com

**Setup:**
```sql
CREATE DATABASE ectlogger;
CREATE USER 'your_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON ectlogger.* TO 'your_user'@'localhost';
```

**Configure:**
```env
DATABASE_URL=mysql+aiomysql://your_user:your_password@localhost/ectlogger
```

## 🚀 Starting the Application

### Automated Start

**Linux/macOS:**
```bash
./start.sh
```

**Windows:**
```powershell
.\start.ps1
```

Both servers will start automatically. Access at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Manual Start

**Backend (Linux/macOS):**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Backend (Windows):**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend (All Platforms):**
```bash
cd frontend
npm run dev
```

## ✅ Verification

Check your installation:

**Linux/macOS:**
```bash
./verify-setup.sh
```

**Windows:**
```powershell
.\verify-setup.ps1
```

## 🐛 Common Issues

### Permission Denied (Linux/macOS)
```bash
chmod +x *.sh
```

### Port Already in Use
Stop other services on ports 8000 or 3000, or modify the ports in configuration.

### Python Not Found
- Linux: `sudo apt install python3 python3-pip python3-venv`
- macOS: `brew install python3`
- Windows: Download from python.org

### Node.js Not Found
- Linux: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs`
- macOS: `brew install node`
- Windows: Download from nodejs.org

### Email Not Sending
- For Gmail, use an App Password (not regular password)
- Enable 2-Step Verification first
- Check firewall settings

## 📝 First User Setup

After signing in for the first time, make yourself an admin:

### Using SQLite (Default)

**Linux/macOS:**
```bash
cd backend
source venv/bin/activate
python3 -c "
from app.database import AsyncSessionLocal, engine
from app.models import User, UserRole
from sqlalchemy import select
import asyncio

async def make_admin(email):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.role = UserRole.ADMIN
            await session.commit()
            print(f'✓ {email} is now an admin')
        else:
            print(f'✗ User not found: {email}')

asyncio.run(make_admin('your@email.com'))
"
```

Or use a SQLite browser tool to edit the `users` table directly.

## 🌐 Production Deployment

### Linux with systemd

1. Create service file: `/etc/systemd/system/ectlogger.service`
2. Enable: `sudo systemctl enable ectlogger`
3. Start: `sudo systemctl start ectlogger`

### Using Docker (All Platforms)

Create `Dockerfile` and `docker-compose.yml` for containerized deployment.

### Reverse Proxy

Use nginx or Apache to proxy requests to the backend and serve the frontend.

## 📚 Next Steps

- See [QUICKSTART.md](QUICKSTART.md) for quick setup
- See [SETUP.md](SETUP.md) for detailed installation
- See [DEVELOPMENT.md](DEVELOPMENT.md) for development info
- See [README.md](README.md) for feature overview

## 🆘 Getting Help

1. Run verification script to check setup
2. Check terminal output for errors
3. Review documentation files
4. Check API docs at http://localhost:8000/docs
5. Open an issue on GitHub
