#!/bin/bash

# ECTLogger Interactive Configuration Script for Linux/macOS

echo "🔧 ECTLogger Configuration Wizard"
echo "================================="
echo ""

# Check if .env already exists
if [ -f "backend/.env" ]; then
    echo "⚠️  backend/.env already exists!"
    echo "   Do you want to overwrite it? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Configuration cancelled."
        exit 0
    fi
fi

# Copy template
if [ ! -f ".env.example" ]; then
    echo "✗ .env.example not found!"
    exit 1
fi

cp .env.example backend/.env
echo "✓ Created backend/.env from template"
echo ""

# Generate SECRET_KEY
echo "🔑 Generating secure SECRET_KEY..."
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
if [ -n "$SECRET_KEY" ]; then
    # Use different sed syntax for Linux vs macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" backend/.env
    else
        sed -i "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" backend/.env
    fi
    echo "✓ SECRET_KEY generated and saved"
else
    echo "⚠️  Could not generate SECRET_KEY automatically"
    echo "   Please edit backend/.env and add a secure secret key"
fi

# ============================================
# STEP 1: Frontend URL (needed for email defaults)
# ============================================
echo ""
echo "🌐 Application URL Configuration"
echo "================================="
echo ""

# Detect LAN IP address
LAN_IP=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
elif command -v hostname &> /dev/null; then
    # Linux - try hostname -I first, then fallback to ip command
    LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -z "$LAN_IP" ]; then
        LAN_IP=$(ip route get 1 2>/dev/null | grep -oP 'src \K\S+' || echo "localhost")
    fi
else
    LAN_IP="localhost"
fi

# Clean up any whitespace
LAN_IP=$(echo "$LAN_IP" | xargs)

echo "Detected LAN IP: $LAN_IP"
echo ""
echo "Frontend URL - Where users will access the application:"
echo ""
echo "For testing/LAN use:"
echo "  - http://$LAN_IP:3000 (recommended for local network)"
echo "  - http://localhost:3000 (local machine only)"
echo ""
echo "For production (with reverse proxy and HTTPS):"
echo "  - https://ectlogger.example.com"
echo "  - https://nets.example.org"
echo ""
echo "Enter Frontend URL (press Enter for http://$LAN_IP:3000):"
read -r frontend_url
frontend_url=${frontend_url:-http://$LAN_IP:3000}

# Extract domain from frontend URL for use in email config
# Remove protocol (http:// or https://)
APP_DOMAIN=$(echo "$frontend_url" | sed -E 's|^https?://||' | sed -E 's|:[0-9]+.*||' | sed -E 's|/.*||')

# Update .env file with frontend URL
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|FRONTEND_URL=.*|FRONTEND_URL=$frontend_url|" backend/.env
else
    sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=$frontend_url|" backend/.env
fi

echo ""
echo "✓ Frontend URL configured: $frontend_url"
echo "  (Domain: $APP_DOMAIN)"
echo ""

# ============================================
# STEP 2: Email Configuration  
# ============================================
echo ""
echo "📧 Email Configuration (Required for authentication)"
echo "===================================================="
echo ""

# SMTP Host
echo "SMTP Host (press Enter for smtp.gmail.com):"
read -r smtp_host
smtp_host=${smtp_host:-smtp.gmail.com}

# SMTP Port
echo "SMTP Port (press Enter for 587):"
read -r smtp_port
smtp_port=${smtp_port:-587}

# SMTP User (required)
echo "SMTP User (your email address):"
read -r smtp_user
while [ -z "$smtp_user" ]; do
    echo "⚠️  Email address is required!"
    echo "SMTP User (your email address):"
    read -r smtp_user
done

# SMTP Password (required)
echo "SMTP Password (for Gmail, use an App Password):"
read -rs smtp_password
echo ""
while [ -z "$smtp_password" ]; do
    echo "⚠️  Password is required!"
    echo "SMTP Password (for Gmail, use an App Password):"
    read -rs smtp_password
    echo ""
done

# SMTP From Email - use domain from frontend URL
DEFAULT_FROM_EMAIL="noreply@$APP_DOMAIN"
echo "From Email (press Enter for $DEFAULT_FROM_EMAIL):"
read -r smtp_from
smtp_from=${smtp_from:-$DEFAULT_FROM_EMAIL}

# Update .env file
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|SMTP_HOST=.*|SMTP_HOST=$smtp_host|" backend/.env
    sed -i '' "s|SMTP_PORT=.*|SMTP_PORT=$smtp_port|" backend/.env
    sed -i '' "s|SMTP_USER=.*|SMTP_USER=$smtp_user|" backend/.env
    sed -i '' "s|SMTP_PASSWORD=.*|SMTP_PASSWORD=$smtp_password|" backend/.env
    sed -i '' "s|SMTP_FROM_EMAIL=.*|SMTP_FROM_EMAIL=$smtp_from|" backend/.env
else
    # Linux
    sed -i "s|SMTP_HOST=.*|SMTP_HOST=$smtp_host|" backend/.env
    sed -i "s|SMTP_PORT=.*|SMTP_PORT=$smtp_port|" backend/.env
    sed -i "s|SMTP_USER=.*|SMTP_USER=$smtp_user|" backend/.env
    sed -i "s|SMTP_PASSWORD=.*|SMTP_PASSWORD=$smtp_password|" backend/.env
    sed -i "s|SMTP_FROM_EMAIL=.*|SMTP_FROM_EMAIL=$smtp_from|" backend/.env
fi

echo ""
echo "✓ Email configuration saved"
echo ""

# ============================================
# STEP 3: Backend API URL Configuration
# ============================================

# Derive default backend URL from frontend URL
# If frontend is https://app.example.com -> backend is https://app.example.com/api
# If frontend is http://192.168.1.1:3000 -> backend is http://192.168.1.1:8000/api
if [[ "$frontend_url" == *":3000"* ]]; then
    # Development mode with port - switch to port 8000
    DEFAULT_BACKEND_URL=$(echo "$frontend_url" | sed 's/:3000/:8000/')/api
else
    # Production mode - same domain with /api path
    DEFAULT_BACKEND_URL="${frontend_url}/api"
fi

echo "🔗 Backend API URL Configuration"
echo "================================="
echo ""
echo "Backend API URL - Where the frontend will connect to the API:"
echo ""
echo "For production (recommended):"
echo "  - ${frontend_url}/api (same domain as frontend)"
echo ""
echo "For development/testing:"
echo "  - http://$LAN_IP:8000/api"
echo ""
echo "Enter Backend API URL (press Enter for $DEFAULT_BACKEND_URL):"
read -r backend_url
backend_url=${backend_url:-$DEFAULT_BACKEND_URL}

# Create frontend/.env
cat > frontend/.env << EOF
VITE_API_URL=$backend_url
EOF

echo "✓ Frontend configured to connect to: $backend_url"
echo ""

# Database choice
echo "💾 Database Configuration"
echo "========================="
echo ""
echo "Choose database:"
echo "1) SQLite (default, no setup needed)"
echo "2) PostgreSQL"
echo "3) MySQL"
echo ""
echo "Enter choice (1-3, press Enter for SQLite):"
read -r db_choice

case $db_choice in
    2)
        echo "PostgreSQL connection string:"
        echo "Example: postgresql+asyncpg://user:password@localhost/ectlogger"
        read -r db_url
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=$db_url|" backend/.env
        else
            sed -i "s|DATABASE_URL=.*|DATABASE_URL=$db_url|" backend/.env
        fi
        echo "✓ PostgreSQL configured"
        ;;
    3)
        echo "MySQL connection string:"
        echo "Example: mysql+aiomysql://user:password@localhost/ectlogger"
        read -r db_url
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=$db_url|" backend/.env
        else
            sed -i "s|DATABASE_URL=.*|DATABASE_URL=$db_url|" backend/.env
        fi
        echo "✓ MySQL configured"
        ;;
    *)
        echo "✓ Using SQLite (default)"
        ;;
esac

echo ""
echo "================================="
echo "✓ Configuration complete!"
echo ""
echo "Your settings have been saved to backend/.env"
echo ""
echo "Next steps:"
echo "1. Run ./start.sh to start the application"
echo "2. Open http://localhost:3000 in your browser"
echo "3. Use your configured email to sign in"
echo ""
echo "For Gmail users:"
echo "- Enable 2-Step Verification in Google Account"
echo "- Generate an App Password (not your regular password)"
echo "- Use that App Password in the configuration"
echo ""
