# ECTLogger
## A Modern Radio Net Logger for Emergency Communications Teams and SKYWARN Spotter Nets

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

ECTLogger is a production-ready, web-based net logging application designed specifically for Emergency Communications Teams, SKYWARN spotter nets, and amateur radio net control operations. Built with modern technology, it provides real-time check-in tracking, multi-frequency support, and comprehensive net management capabilities.

<a href="assets/screenshots/Check-in%20Log.png">
  <img src="assets/screenshots/Check-in%20Log.png" alt="Check-in Log" width="100%">
</a>

*Multi-frequency/band check-ins, in dark and light mode!*

## ✨ Features

- **🔐 Secure Authentication** - Frictionless sign-in with magic link email authentication + OAuth (Google, Microsoft, GitHub)
- **📻 Multi-Frequency Support** - Track stations across multiple frequencies and modes
- **⚡ Real-Time Updates** - WebSocket-powered live check-ins and status updates
- **👥 Role-Based Access** - Admin, NCS, Logger, User, and Guest roles
- **📧 Email Notifications** - Automatic net start notifications and invitations
- **📱 Mobile Responsive** - Works seamlessly on phones, tablets, and desktops
- **🎨 Modern UI** - Clean Material Design interface
- **💾 Flexible Database** - SQLite, PostgreSQL, or MySQL support
- **🔄 Recheck Tracking** - Automatically track stations checking in multiple times
- **📊 Custom Fields** - Admins can create custom fields for specific net requirements
- **📝 Complete Net Logs** - Automatic log generation and email delivery

## 🔒 Security

ECTLogger implements comprehensive security measures to protect your data and prevent common vulnerabilities:

- **Input Validation** - All inputs validated with strict length limits and format checking
- **XSS Protection** - HTML sanitization and security headers prevent script injection
- **SQL Injection Prevention** - SQLAlchemy ORM with parameterized queries
- **Rate Limiting** - 200 requests/minute per IP prevents abuse and DDoS attacks
- **Authenticated WebSockets** - JWT token required for real-time connections
- **OWASP Top 10** - Protected against the most critical web application security risks

For complete security documentation, deployment best practices, and vulnerability reporting, see **[SECURITY.md](SECURITY.md)**.

## 🚀 Quick Start

### Linux/macOS
```bash
### ⚡ One-Line Install (Debian/Ubuntu)

Fresh system? Run this single command to download and install everything:

```bash
curl -fsSL https://raw.githubusercontent.com/bradbrownjr/ectlogger/main/bootstrap.sh | bash
```

This installs all prerequisites (Git, Python, Node.js), clones the repository, and runs the installer.

### Linux/macOS (Manual)
```bash
# 1. Clone the repository
git clone https://github.com/bradbrownjr/ectlogger.git
cd ectlogger

# 2. Make scripts executable and install
chmod +x *.sh
./install.sh

# 3. Configure and start
./configure.sh
./start.sh

# 4. Open http://localhost:3000 and sign in!
```

### Windows
```powershell
# 1. Clone the repository
git clone https://github.com/bradbrownjr/ectlogger.git
cd ectlogger

# 2. Run the setup script
.\start.ps1

# 3. Open http://localhost:3000 and sign in!
```

See [QUICKSTART.md](QUICKSTART.md) for detailed instructions.

## 📚 Documentation

### Getting Started
- **[QUICKSTART.md](QUICKSTART.md)** - Get up and running in 5 minutes (recommended!)
- **[MANUAL-INSTALLATION.md](MANUAL-INSTALLATION.md)** - Step-by-step manual installation for advanced users

### Deployment
- **[PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md)** - Deploy to production with SSL/reverse proxy
- **[SECURITY.md](SECURITY.md)** - Security features and best practices

### Configuration
- **[MAGIC-LINK-CONFIGURATION.md](MAGIC-LINK-CONFIGURATION.md)** - Configure magic link expiration for extended operations
- **[EMAIL-DELIVERABILITY.md](EMAIL-DELIVERABILITY.md)** - Email setup, troubleshooting, and spam prevention
- **[LOGGING.md](LOGGING.md)** - Configure log levels and debug output

### Development
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development guide and architecture

## 🛠️ Technology Stack

# Technology
- **Frontend**: React with TypeScript and Material-UI (MUI)
- **Backend**: Python FastAPI with async/await support
- **Database**: SQLAlchemy ORM (SQLite, PostgreSQL, MySQL)
- **Authentication**: OAuth2 + Magic Link email authentication
- **Real-Time**: WebSockets for live updates
- **Email**: SMTP with HTML templates

## 👥 User Roles

ECTLogger has two types of roles: **global roles** (system-wide) and **net roles** (per-net assignments).

### Global Roles
- 🛡️ **Admin** - Full system access, user management, view all nets, configure custom fields
- 👤 **User** - Create nets, check into nets, receive notifications
- 👁️ **Guest** - View-only access to public nets (no account required)

### Net Roles
When a user creates a net, they automatically become its **NCS (Net Control Station)**. The net creator can then assign these roles to other users for that specific net:

- 👑 **NCS** - Full control of the net: start/close, manage check-ins, assign roles
- 📋 **Logger** - Log check-ins and manage station status
- 📡 **Relay** - Check in stations on behalf of others (for contacts NCS can't hear directly)

This means any registered user can run their own nets without needing admin privileges. A user might be a regular participant in one net while serving as NCS for another.

## 🎯 Key Capabilities

### Multi-Frequency Net Support
Net loggers typically track one frequency, but ECT and SKYWARN nets often move between frequencies to meet participants where they are. ECTLogger tracks:
- Multiple frequencies per net
- Active frequency indication
- Per-station frequency tracking
- Real-time frequency change notifications

### Station Status Tracking
Visual indicators for:
- ✅ Checked In
- 👂 Just Listening
- 📻 Available
- ⏸️ Away
- 👋 Checked Out
- 🔄 Recheck (returning stations)

### Role Assignments
- Designate NCS, loggers, and relay stations
- Multiple NCS support for large nets
- Relay station tracking for extended coverage

## 📋 Net Workflow

### 1. Create Net
- User creates a new net with name and description
- Define communication plan (frequencies, modes, talkgroups)
- Configure required and optional check-in fields
- Assign net roles (NCS, Logger, Relay) to other users
- Save as draft for later editing

### 2. Schedule Net (Optional)
- Set date, time, and timezone for the net
- Configure recurring schedule (daily, weekly, monthly)
- Set up **NCS rotation** - automatically assign NCS duties across scheduled instances
- System sends reminders to assigned NCS before their scheduled net
- Scheduled nets auto-start at the configured time

### 3. Start Net
- NCS starts the net manually, or it auto-starts if scheduled
- Email notifications sent to subscribers
- Real-time WebSocket connections established
- Guests can view, users can participate

### 4. Log Check-ins
- NCS or designated logger enters check-ins
- Stations can self-check-in via web interface
- Support for relay stations (checking in contacts NCS can't hear)
- Real-time updates to all connected clients
- Edit or delete check-ins as needed

### 5. Track Participation
- Monitor station status changes
- Track frequency usage per station
- Identify recheck stations
- View check-in timeline

### 6. Close Net
- NCS or logger closes the net
- Complete log generated automatically
- Log emailed to NCS in text format
- Net archived for reports and history

## 📝 Check-in Fields

### Required Fields
- Call sign
- Name
- Location

- **SKYWARN spotter number** - For weather net tracking
- **Weather observation** - Current conditions
- **Power source** - Battery, generator, grid, etc.
- **Feedback** - Signal reports, comments
- **Notes** - Additional information

### Custom Fields
- Admins create custom fields for the system
- Field types: text, number, textarea, select dropdown
- NCS selects which custom fields to use when creating a net
- Set fields as required or optional per net
- Flexible for different net types and requirements

## 🖥️ System Requirements

- **Server**: Windows, Linux, or macOS
- **Python**: 3.9 or higher
- **Node.js**: 18 or higher
- **Database**: SQLite (included) or PostgreSQL/MySQL
- **Browser**: Modern browser (Chrome, Firefox, Safari, Edge)

## 📦 Installation

See [MANUAL-INSTALLATION.md](MANUAL-INSTALLATION.md) for complete installation instructions.

### Quick Install

**Linux/macOS:**
```bash
chmod +x *.sh
./install.sh      # Automated installation
./configure.sh    # Interactive configuration
./start.sh        # Start the application
```

**Optional: Install as systemd service (Linux):**
```bash
./install-service.sh  # Install systemd service
sudo systemctl start ectlogger
```

**Windows:**
```powershell
.\start.ps1       # Automated installation and startup
```

### Manual Install

```bash
# 1. Install backend dependencies
cd backend
python3 -m venv venv
source venv/bin/activate  # Linux/macOS
# OR: .\venv\Scripts\Activate.ps1  # Windows
pip install -r requirements.txt

# 2. Install frontend dependencies
cd ../frontend
npm install

# 3. Configure environment
cp .env.example backend/.env
# Edit backend/.env with your settings
```

## 🔄 Migration

Use `migrate.sh` (Linux/macOS) or `migrate.ps1` (Windows) to change host addresses when moving between environments (e.g., LAN development to production) without modifying other configuration settings.

### Quick Migration Examples

**Linux/macOS:**
```bash
# Production domain (with reverse proxy)
./migrate.sh --host ect.example.com

# LAN IP (development)
./migrate.sh --lan-ip 192.168.1.100
```

**Windows PowerShell:**
```powershell
# Production domain (with reverse proxy)
.\migrate.ps1 -Host ect.example.com

# LAN IP (development)
.\migrate.ps1 -LanIP 192.168.1.100
```

The script automatically updates `backend/.env` and `frontend/.env`, and configures the Vite allowed hosts for security.

See [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md) for complete deployment instructions.

## 🔧 Configuration

Key configuration in `backend/.env`:

```env
# Database
DATABASE_URL=sqlite:///./ectlogger.db

# Security (generate secure key!)
SECRET_KEY=your-secret-key-here

# Email (required for authentication)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Magic Link Configuration
MAGIC_LINK_EXPIRE_DAYS=30  # Valid for 30 days (great for long events!)

# Logging
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR

# OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
MICROSOFT_CLIENT_ID=your-microsoft-client-id
GITHUB_CLIENT_ID=your-github-client-id
```

## 🌐 API Documentation

When the backend is running, access interactive API documentation at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🧪 Testing

```bash
# Backend tests
cd backend
source venv/bin/activate  # Linux/macOS
# OR: .\venv\Scripts\Activate.ps1  # Windows
pytest

# Frontend tests
cd frontend
npm test
```

## 🚢 Production Deployment

1. Set production environment variables
2. Use PostgreSQL or MySQL database
3. Configure SSL/TLS certificates
4. Set up reverse proxy (nginx/Apache)
5. Build frontend: `npm run build`
6. Use production WSGI server (gunicorn)

See [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md) for detailed deployment guide.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

This means you can:
- ✅ Use commercially
- ✅ Modify
- ✅ Distribute
- ✅ Use privately

With the requirement to:
- 📝 Include copyright notice and license
- 📝 Provide attribution to original authors

## 🙏 Acknowledgments

Built for the amateur radio and emergency communications community.

Special thanks to all NCS operators, loggers, and participants who make emergency communication nets possible.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/ectlogger/issues)
- **Documentation**: See QUICKSTART.md and DEVELOPMENT.md
- **Questions**: Open a discussion on GitHub

## 🗺️ Roadmap

Future enhancements planned:
- [ ] Participant station mapping (in development)
- [ ] Progressive Web App (PWA) for offline capability
- [ ] SMS notifications via Twilio/AWS SNS
- [ ] Advanced reporting and analytics
- [ ] Export logs in multiple formats (CSV, PDF)
- [ ] Mobile native apps (iOS/Android)
- [ ] Integration with amateur radio logging software
- [ ] Voice check-in via phone bridge
- [ ] Automated NCS assistant features

### Stretch Goals
- [ ] [TUI/Packet Radio Client](docs/concepts/TUI-PACKET-CLIENT.md) - Terminal-based client for packet radio and low-bandwidth operations

## ✅ Tested Environments

| Environment | Status | Notes |
|-------------|--------|-------|
| **Debian Trixie** | ✅ Tested | Python 3.13, production with Caddy reverse proxy |
| **Windows Server** | ⬜ Untested | Should work with PowerShell scripts |
| **Host Migration** | ✅ Tested | LAN to production domain migration |

---

**73 and stay safe!** 📻