# Self-Hosting ECTLogger

ECTLogger is available as a hosted service at **[app.ectlogger.us](https://app.ectlogger.us)**, but you can also run your own instance on your own server.

## Why Self-Host?

You might want to self-host ECTLogger if you:

- Need to operate in an **air-gapped or offline environment**
- Want **full control** over your data and infrastructure
- Have **specific security or compliance requirements**
- Want to **customize** the application for your organization
- Are running **training exercises** or testing scenarios

## System Requirements

### Hardware

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| **RAM** | 2 GB | 4 GB+ |
| **Storage** | 2 GB | 10 GB+ |
| **CPU** | 1 core | 2+ cores |

> ⚠️ **Servers with <2GB RAM** will struggle during frontend builds. See [Production Deployment](PRODUCTION-DEPLOYMENT.md#low-memory-systems-2gb-ram) for workarounds.

### Software

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Python** | 3.9+ | 3.11+ |
| **Node.js** | 18+ | 22 LTS |
| **Database** | SQLite (included) | PostgreSQL or MySQL |
| **OS** | Linux, macOS, Windows | Debian/Ubuntu Linux |

### Browser Support

Modern browsers: Chrome, Firefox, Safari, Edge (latest versions)

## Technology Stack

- **Frontend**: React with TypeScript and Material-UI (MUI)
- **Backend**: Python FastAPI with async/await support
- **Database**: SQLAlchemy ORM (SQLite, PostgreSQL, MySQL)
- **Authentication**: OAuth2 + Magic Link email authentication
- **Real-Time**: WebSockets for live updates
- **Email**: SMTP with HTML templates

## Installation Options

### Quick Start (Recommended)

The fastest way to get ECTLogger running:

```bash
curl -fsSL https://raw.githubusercontent.com/bradbrownjr/ectlogger/main/bootstrap.sh | bash
```

This single command:
- Installs all prerequisites (Git, Python, Node.js)
- Clones the repository
- Runs the interactive installer

See **[Quick Start Guide](QUICKSTART.md)** for detailed instructions.

### Manual Installation

For environments where the automated installer isn't suitable:

See **[Manual Installation Guide](MANUAL-INSTALLATION.md)** for step-by-step instructions.

### Production Deployment

For internet-facing deployments with SSL/HTTPS:

See **[Production Deployment Guide](PRODUCTION-DEPLOYMENT.md)** for:
- Caddy or Nginx reverse proxy setup
- Automatic SSL certificates
- systemd service configuration
- Fail2Ban integration
- Security hardening

## Configuration

### Required Configuration

At minimum, you need to configure email for magic link authentication:

```env
# backend/.env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=ECTLogger
```

Use `./configure.sh` (Linux/macOS) or `.\configure.ps1` (Windows) for interactive configuration.

### Optional Configuration

| Feature | Documentation |
|---------|---------------|
| Magic link expiration | [MAGIC-LINK-CONFIGURATION.md](MAGIC-LINK-CONFIGURATION.md) |
| OAuth providers | [MANUAL-INSTALLATION.md](MANUAL-INSTALLATION.md#oauth-configuration) |
| Database (PostgreSQL/MySQL) | [MANUAL-INSTALLATION.md](MANUAL-INSTALLATION.md#database-configuration) |
| Logging levels | [LOGGING.md](LOGGING.md) |

## Running ECTLogger

### Development Mode

```bash
# Linux/macOS
./start.sh

# Windows
.\start.ps1
```

Access at: http://localhost:3000

### Production Mode

With systemd service installed:

```bash
sudo systemctl start ectlogger
sudo systemctl enable ectlogger  # Start on boot
```

Access via your configured domain with HTTPS.

## Migration Between Environments

Use the migration scripts to move between development and production:

```bash
# Linux/macOS - Switch to production domain
./migrate.sh --host ect.example.com

# Windows - Switch to LAN IP
.\migrate.ps1 -LanIP 192.168.1.100
```

See [Production Deployment](PRODUCTION-DEPLOYMENT.md) for complete migration instructions.

## Updating

Pull the latest changes and restart:

```bash
cd ~/ectlogger
git pull
./install.sh  # Reinstall dependencies if needed
sudo systemctl restart ectlogger
```

## Backup & Recovery

### Database Backup

SQLite (default):
```bash
cp backend/ectlogger.db backup/ectlogger-$(date +%Y%m%d).db
```

PostgreSQL:
```bash
pg_dump ectlogger > backup/ectlogger-$(date +%Y%m%d).sql
```

### Configuration Backup

```bash
cp backend/.env backup/
cp frontend/.env backup/
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Email not sending | Check SMTP credentials; use App Password for Gmail |
| Port already in use | Check for other services on ports 8000/3000 |
| Permission denied | Ensure scripts are executable: `chmod +x *.sh` |
| Out of memory | Add swap space or use a larger server |

### Getting Help

- Check the [API documentation](http://localhost:8000/docs) when running
- Review logs: `journalctl -u ectlogger -f` (systemd)
- Open an issue on [GitHub](https://github.com/bradbrownjr/ectlogger/issues)

## Next Steps

- **[Quick Start](QUICKSTART.md)** — Get running in 5 minutes
- **[Production Deployment](PRODUCTION-DEPLOYMENT.md)** — Deploy with SSL
- **[Security](SECURITY.md)** — Security best practices
- **[Development Guide](DEVELOPMENT.md)** — Contribute to ECTLogger
