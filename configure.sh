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

# SMTP User
echo "SMTP User (your email address):"
read -r smtp_user

# SMTP Password
echo "SMTP Password (for Gmail, use an App Password):"
read -rs smtp_password
echo ""

# SMTP From Email
echo "From Email (press Enter for noreply@ectlogger.com):"
read -r smtp_from
smtp_from=${smtp_from:-noreply@ectlogger.com}

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
