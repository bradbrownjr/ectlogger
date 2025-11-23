# ECTLogger Production Deployment Guide

This guide covers deploying ECTLogger to production with SSL/HTTPS using a reverse proxy.

## Overview

For production deployment, you'll serve both the frontend and backend through a reverse proxy on the same domain. This provides:

- ✅ **SSL/HTTPS** - Secure encrypted connections
- ✅ **Same-origin** - No CORS issues or cross-site blocking
- ✅ **Single domain** - Professional URL structure
- ✅ **Backend protection** - Not directly exposed to internet
- ✅ **Easy SSL certificates** - Automated with Let's Encrypt

## Architecture

```
Internet → Reverse Proxy (SSL) → {
    /           → Frontend (built static files)
    /api/       → Backend API (port 8000)
    /ws/        → WebSocket (port 8000)
}
```

Example: `https://ectlogger.example.com/` serves frontend, API at `https://ectlogger.example.com/api/`

---

## Option 1: Caddy (Recommended - Easiest)

Caddy automatically handles SSL certificates via Let's Encrypt.

### 1. Install Caddy

**Debian/Ubuntu:**
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### 2. Build Frontend

```bash
cd ~/ectlogger/frontend
npm run build
```

This creates `frontend/dist/` with optimized static files.

### 3. Configure Production Settings

**Update `frontend/.env`:**
```bash
VITE_API_URL=https://ectlogger.example.com/api
```

**Update `backend/.env`:**
```bash
FRONTEND_URL=https://ectlogger.example.com
```

**Rebuild frontend after changing .env:**
```bash
cd ~/ectlogger/frontend
npm run build
```

### 4. Create Caddyfile

```bash
sudo nano /etc/caddy/Caddyfile
```

**Add this configuration:**
```caddy
ectlogger.example.com {
    # Automatic HTTPS via Let's Encrypt
    
    # Serve frontend static files
    root * /home/bradb/ectlogger/frontend/dist
    
    # API endpoints - proxy to backend
    handle /api/* {
        reverse_proxy localhost:8000
    }
    
    # WebSocket for real-time updates
    handle /ws/* {
        reverse_proxy localhost:8000
    }
    
    # Serve frontend for all other routes (SPA routing)
    handle {
        try_files {path} /index.html
        file_server
    }
    
    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
    }
}
```

**Replace `/home/bradb/ectlogger` with your actual path!**

### 5. Update Backend to Use /api Prefix

Edit `backend/app/main.py` to add API prefix:

```python
app = FastAPI(
    title=settings.app_name, 
    version="1.0.0",
    root_path="/api"  # Add this line
)
```

### 6. Start Services

**Reload Caddy:**
```bash
sudo systemctl reload caddy
```

**Start ECTLogger backend:**
```bash
sudo systemctl start ectlogger
# Or manually: cd ~/ectlogger && ./start.sh
```

### 7. Access Your Application

Navigate to: `https://ectlogger.example.com`

Caddy automatically obtains and renews SSL certificates!

---

## Option 2: Nginx with Let's Encrypt

### 1. Install Nginx and Certbot

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

### 2. Build Frontend

```bash
cd ~/ectlogger/frontend
npm run build
```

### 3. Configure Production Settings

**Update `frontend/.env`:**
```bash
VITE_API_URL=https://ectlogger.example.com/api
```

**Update `backend/.env`:**
```bash
FRONTEND_URL=https://ectlogger.example.com
```

**Rebuild frontend:**
```bash
cd ~/ectlogger/frontend
npm run build
```

### 4. Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/ectlogger
```

**Add this configuration:**
```nginx
server {
    listen 80;
    server_name ectlogger.example.com;
    
    # Root directory for frontend static files
    root /home/bradb/ectlogger/frontend/dist;
    index index.html;
    
    # Frontend SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

**Replace `/home/bradb/ectlogger` with your actual path!**

### 5. Enable Site and Test

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/ectlogger /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 6. Obtain SSL Certificate

```bash
sudo certbot --nginx -d ectlogger.example.com
```

Follow the prompts. Certbot will automatically configure SSL and set up auto-renewal.

### 7. Update Backend for API Prefix

Edit `backend/app/main.py`:

```python
app = FastAPI(
    title=settings.app_name, 
    version="1.0.0",
    root_path="/api"  # Add this line
)
```

### 8. Start Backend

```bash
sudo systemctl start ectlogger
```

### 9. Access Your Application

Navigate to: `https://ectlogger.example.com`

---

## Option 3: Apache with Let's Encrypt

### 1. Install Apache and Certbot

```bash
sudo apt update
sudo apt install apache2 certbot python3-certbot-apache
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers
```

### 2. Build Frontend

```bash
cd ~/ectlogger/frontend
npm run build
```

### 3. Configure Production Settings

**Update `frontend/.env`:**
```bash
VITE_API_URL=https://ectlogger.example.com/api
```

**Update `backend/.env`:**
```bash
FRONTEND_URL=https://ectlogger.example.com
```

**Rebuild:**
```bash
cd ~/ectlogger/frontend
npm run build
```

### 4. Create Apache Configuration

```bash
sudo nano /etc/apache2/sites-available/ectlogger.conf
```

**Add this configuration:**
```apache
<VirtualHost *:80>
    ServerName ectlogger.example.com
    DocumentRoot /home/bradb/ectlogger/frontend/dist
    
    <Directory /home/bradb/ectlogger/frontend/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        # SPA routing
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
    
    # Backend API
    ProxyPass /api/ http://127.0.0.1:8000/
    ProxyPassReverse /api/ http://127.0.0.1:8000/
    
    # WebSocket
    ProxyPass /ws/ ws://127.0.0.1:8000/ws/
    ProxyPassReverse /ws/ ws://127.0.0.1:8000/ws/
    
    # Security headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set X-XSS-Protection "1; mode=block"
</VirtualHost>
```

### 5. Enable Site

```bash
sudo a2ensite ectlogger
sudo systemctl reload apache2
```

### 6. Obtain SSL Certificate

```bash
sudo certbot --apache -d ectlogger.example.com
```

### 7. Update Backend for API Prefix

Edit `backend/app/main.py`:

```python
app = FastAPI(
    title=settings.app_name, 
    version="1.0.0",
    root_path="/api"  # Add this line
)
```

### 8. Start Backend and Access

```bash
sudo systemctl start ectlogger
```

Navigate to: `https://ectlogger.example.com`

---

## Security Hardening

### 1. Restrict Backend to Localhost Only

Since the reverse proxy forwards requests, the backend doesn't need to listen on all interfaces.

**Edit systemd service or start.sh:**
```bash
# Change from:
uvicorn app.main:app --host 0.0.0.0 --port 8000

# To:
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 2. Firewall Rules

Only expose ports 80 and 443:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. Database Security

For production, use PostgreSQL instead of SQLite:

```bash
# Install PostgreSQL
sudo apt install postgresql

# Create database and user
sudo -u postgres psql
CREATE DATABASE ectlogger;
CREATE USER ectlogger WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE ectlogger TO ectlogger;
\q

# Update backend/.env
DATABASE_URL=postgresql+asyncpg://ectlogger:secure_password@localhost/ectlogger
```

### 4. Regular Updates

Set up automatic security updates:

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## DNS Configuration

Point your domain to your server:

```
Type: A Record
Host: ectlogger (or @)
Value: YOUR_SERVER_IP
TTL: 3600
```

Wait for DNS propagation (up to 24-48 hours, usually minutes).

---

## Monitoring and Maintenance

### Check Application Status

```bash
# Service status
sudo systemctl status ectlogger

# View logs
sudo journalctl -u ectlogger -f

# Reverse proxy logs
sudo journalctl -u caddy -f    # Caddy
sudo tail -f /var/log/nginx/error.log  # Nginx
sudo tail -f /var/log/apache2/error.log  # Apache
```

### SSL Certificate Renewal

**Caddy**: Automatic, no action needed

**Certbot**: Auto-renewal is configured, test with:
```bash
sudo certbot renew --dry-run
```

### Backup Database

```bash
# SQLite
cp ~/ectlogger/ectlogger.db ~/backups/ectlogger-$(date +%Y%m%d).db

# PostgreSQL
pg_dump -U ectlogger ectlogger > ~/backups/ectlogger-$(date +%Y%m%d).sql
```

---

## Troubleshooting

### API Not Working

1. Check backend is running: `sudo systemctl status ectlogger`
2. Test API directly: `curl http://localhost:8000/docs`
3. Check reverse proxy logs
4. Verify `root_path="/api"` in `backend/app/main.py`

### Frontend Shows Wrong URL

1. Rebuild frontend after changing `.env`:
   ```bash
   cd ~/ectlogger/frontend
   npm run build
   ```

2. Verify `frontend/.env` has correct `VITE_API_URL`

### WebSocket Connection Failed

1. Check proxy configuration includes WebSocket upgrade headers
2. Verify `/ws/` path is proxied correctly
3. Check firewall isn't blocking WebSocket connections

### SSL Certificate Issues

```bash
# Check certificate
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal
```

---

## Performance Optimization

### Enable Gzip Compression (Nginx)

Add to server block:
```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

### Enable Caching (Nginx)

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### Database Connection Pooling

Already configured in SQLAlchemy settings. For high traffic, consider:
- Increasing pool size in `backend/app/database.py`
- Using PostgreSQL with pgBouncer

---

## Need Help?

- Check logs: `sudo journalctl -u ectlogger -f`
- Review SECURITY.md for security best practices
- See TROUBLESHOOTING-EMAIL.md for email issues
- Check QUICKSTART.md for basic setup

For production support, ensure you have:
- ✅ SSL/HTTPS enabled
- ✅ Firewall configured
- ✅ Regular backups
- ✅ Monitoring in place
- ✅ Security updates enabled
