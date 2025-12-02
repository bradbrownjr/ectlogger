#!/bin/bash

# ECTLogger Installation Script for Linux/macOS
# This script sets up the complete environment

echo "📦 ECTLogger Installation"
echo "========================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "⚠️  Please do not run as root"
   exit 1
fi

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    elif [ -f /etc/redhat-release ]; then
        OS="rhel"
    elif [ "$(uname)" == "Darwin" ]; then
        OS="macos"
    else
        OS="unknown"
    fi
}

# Install dependencies function
install_dependencies() {
    local pkg_manager=""
    local install_cmd=""
    
    detect_os
    
    case "$OS" in
        ubuntu|debian)
            pkg_manager="apt"
            install_cmd="sudo apt update && sudo apt install -y"
            ;;
        fedora|rhel|centos)
            pkg_manager="dnf"
            install_cmd="sudo dnf install -y"
            ;;
        macos)
            if ! command -v brew &> /dev/null; then
                echo "⚠️  Homebrew not found. Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            pkg_manager="brew"
            install_cmd="brew install"
            ;;
        *)
            echo "⚠️  Unsupported OS. Please install dependencies manually."
            return 1
            ;;
    esac
    
    echo "Detected OS: $OS"
    echo ""
    
    # Check and install Git
    if ! command -v git &> /dev/null; then
        echo "Git not found. Installing..."
        case "$OS" in
            ubuntu|debian)
                $install_cmd git
                ;;
            fedora|rhel|centos)
                $install_cmd git
                ;;
            macos)
                $install_cmd git
                ;;
        esac
    fi
    
    # Check and install Python
    if ! command -v python3 &> /dev/null; then
        echo "Python3 not found. Installing..."
        case "$OS" in
            ubuntu|debian)
                $install_cmd python3 python3-pip python3-venv python3-dev build-essential libssl-dev libffi-dev
                ;;
            fedora|rhel|centos)
                $install_cmd python3 python3-pip python3-devel gcc openssl-devel libffi-devel
                ;;
            macos)
                $install_cmd python3
                ;;
        esac
    fi
    
    # Check and install Node.js
    if ! command -v node &> /dev/null; then
        echo "Node.js not found. Installing Node.js 22.x LTS..."
        case "$OS" in
            ubuntu|debian)
                # Install Node.js 22.x LTS from NodeSource
                curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
                $install_cmd nodejs
                ;;
            fedora|rhel|centos)
                # Use NodeSource for Fedora/RHEL to get latest LTS
                curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
                $install_cmd nodejs
                ;;
            macos)
                # Homebrew installs latest stable by default
                $install_cmd node
                ;;
        esac
    fi
    
    # Check and install Rust (needed for some Python packages like cryptography)
    if ! command -v rustc &> /dev/null; then
        echo "Rust not found. Installing (needed for cryptography packages)..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    fi
    
    # Install additional build dependencies
    case "$OS" in
        ubuntu|debian)
            echo "Installing build dependencies..."
            $install_cmd pkg-config libssl-dev
            ;;
        fedora|rhel|centos)
            echo "Installing build dependencies..."
            $install_cmd pkg-config openssl-devel
            ;;
    esac
}

# Check for missing dependencies
MISSING_DEPS=()

if ! command -v git &> /dev/null; then
    MISSING_DEPS+=("Git")
fi

if ! command -v python3 &> /dev/null; then
    MISSING_DEPS+=("Python3")
fi

if ! command -v node &> /dev/null; then
    MISSING_DEPS+=("Node.js")
fi

if ! command -v rustc &> /dev/null; then
    MISSING_DEPS+=("Rust")
fi

# Offer to install missing dependencies
if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo "⚠️  Missing dependencies: ${MISSING_DEPS[*]}"
    echo ""
    echo "Would you like to install missing dependencies automatically? (Y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Nn]$ ]]; then
        install_dependencies
        if [ $? -ne 0 ]; then
            echo ""
            echo "❌ Automatic installation failed. Please install manually:"
            echo "  Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv python3-dev build-essential libssl-dev pkg-config"
            echo "  Fedora/RHEL: sudo dnf install python3 python3-pip python3-devel gcc openssl-devel pkg-config"
            echo "  macOS: brew install python3 node"
            echo ""
            echo "For Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
            exit 1
        fi
    else
        echo ""
        echo "Please install the following manually:"
        echo "  Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv python3-dev build-essential libssl-dev pkg-config nodejs"
        echo "  Fedora/RHEL: sudo dnf install python3 python3-pip python3-devel gcc openssl-devel pkg-config nodejs"
        echo "  macOS: brew install python3 node"
        echo ""
        echo "For Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        exit 1
    fi
fi

# Final verification
echo ""
echo "Verifying installations..."
if ! command -v python3 &> /dev/null; then
    echo "✗ Python3 still not found!"
    exit 1
fi
echo "✓ Python3 found: $(python3 --version)"

if ! command -v node &> /dev/null; then
    echo "✗ Node.js still not found!"
    exit 1
fi
echo "✓ Node.js found: $(node --version)"

if ! command -v rustc &> /dev/null; then
    echo "⚠️  Rust not found (may be needed for some packages)"
else
    echo "✓ Rust found: $(rustc --version)"
fi

echo ""
echo "🔧 Setting up backend..."

# Create virtual environment
if [ ! -d "backend/venv" ]; then
    echo "Creating Python virtual environment..."
    cd backend
    python3 -m venv venv
    cd ..
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt
cd ..
echo "✓ Backend dependencies installed"

echo ""
echo "🔧 Setting up frontend..."

# Install frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies (this may take a few minutes)..."
    cd frontend
    npm install
    cd ..
    echo "✓ Frontend dependencies installed"
else
    echo "✓ Frontend dependencies already installed"
fi

echo ""
echo "🔧 Configuration..."

# Make scripts executable
chmod +x *.sh 2>/dev/null
echo "✓ Scripts made executable"

# Step 1: Configuration
CONFIG_DONE=false
if [ -f "backend/.env" ]; then
    echo "✓ Configuration file found (backend/.env)"
    echo ""
    read -p "Would you like to reconfigure? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        ./configure.sh
    fi
    CONFIG_DONE=true
    echo ""
else
    echo ""
    echo "⚠️  Configuration needed!"
    echo ""
    read -p "Would you like to configure now? (Y/n) " -n 1 -r
    echo ""
    echo ""
    if [[ ! "$REPLY" =~ ^[Nn]$ ]]; then
        ./configure.sh
        CONFIG_DONE=true
    else
        echo "⚠️  WARNING: Application cannot start without configuration!"
        echo "ℹ️  You must run ./configure.sh before starting the application"
    fi
    echo ""
fi

# Step 2: Service Installation (only if configured and systemd available)
SERVICE_INSTALLED=false
if command -v systemctl &> /dev/null; then
    if [ "$CONFIG_DONE" = true ]; then
        echo ""
        echo "================================="
        echo "🔧 Systemd Service Setup"
        echo "================================="
        echo ""
        echo "Would you like to install ECTLogger as a system service?"
        echo "This allows ECTLogger to:"
    echo "  • Start automatically on boot"
    echo "  • Run in the background"
    echo "  • Be managed with systemctl commands"
    echo ""
    read -p "Install as service? (y/n) " -n 1 -r
    echo ""
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Get current directory and user
        INSTALL_DIR=$(pwd)
        CURRENT_USER=$(whoami)
        
        echo "📍 Installation directory: $INSTALL_DIR"
        echo "👤 Service will run as: $CURRENT_USER"
        echo ""
        
        # Create service file
        SERVICE_FILE="/tmp/ectlogger.service"
        cat > "$SERVICE_FILE" << EOF
[Unit]
Description=ECTLogger - ECT/SKYWARN Net Logger
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
Group=$CURRENT_USER
WorkingDirectory=$INSTALL_DIR
Environment="PATH=$INSTALL_DIR/backend/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="NODE_PATH=$INSTALL_DIR/frontend/node_modules"
ExecStart=/bin/bash $INSTALL_DIR/start.sh --service
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
        
        echo "📝 Installing systemd service..."
        
        # Copy service file to systemd directory
        sudo cp "$SERVICE_FILE" /etc/systemd/system/ectlogger.service
        
        # Set permissions
        sudo chmod 644 /etc/systemd/system/ectlogger.service
        
        # Reload systemd
        sudo systemctl daemon-reload
        
        echo "✓ Service installed"
        echo ""
        
        # Ask if user wants to enable on boot
        read -p "Enable ECTLogger to start on boot? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo systemctl enable ectlogger
            echo "✓ Service enabled for auto-start on boot"
        else
            echo "ℹ️  Service not enabled. Run 'sudo systemctl enable ectlogger' to enable."
        fi
        
        SERVICE_INSTALLED=true
        echo ""
    else
        echo "ℹ️  Skipping service installation. You can install later by running: ./install-service.sh"
        echo ""
    fi
    else
        echo ""
        echo "⚠️  Cannot install service: Application must be configured first"
        echo "   Run ./configure.sh then ./install-service.sh to set up the service"
        echo ""
    fi
fi

# Step 3: Fail2Ban Setup (optional, only on Linux with apt/dnf)
FAIL2BAN_SETUP=false
if [ "$CONFIG_DONE" = true ] && [ -f /etc/os-release ]; then
    detect_os
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" || "$OS" == "fedora" || "$OS" == "rhel" || "$OS" == "centos" ]]; then
        echo ""
        echo "================================="
        echo "🛡️  Fail2Ban Security Setup"
        echo "================================="
        echo ""
        echo "Fail2Ban can automatically block IPs that make too many"
        echo "failed authentication attempts."
        echo ""
        read -p "Would you like to set up Fail2Ban protection? (y/n) " -n 1 -r
        echo ""
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # Get current user for log directory ownership
            CURRENT_USER=$(whoami)
            
            # Install Fail2Ban if not present
            if ! command -v fail2ban-client &> /dev/null; then
                echo "📦 Installing Fail2Ban..."
                case "$OS" in
                    ubuntu|debian)
                        sudo apt-get update -qq
                        sudo apt-get install -y fail2ban
                        ;;
                    fedora|rhel|centos)
                        sudo dnf install -y fail2ban
                        ;;
                esac
                echo "✓ Fail2Ban installed"
            else
                echo "✓ Fail2Ban already installed"
            fi
            
            # Create log directory
            echo "📁 Setting up log directory..."
            sudo mkdir -p /var/log/ectlogger
            sudo chown "$CURRENT_USER":"$CURRENT_USER" /var/log/ectlogger
            touch /var/log/ectlogger/app.log
            echo "✓ Log directory created: /var/log/ectlogger"
            
            # Add LOG_FILE to .env if not present
            if ! grep -q "LOG_FILE=" backend/.env 2>/dev/null; then
                echo "LOG_FILE=/var/log/ectlogger/app.log" >> backend/.env
                echo "✓ LOG_FILE added to backend/.env"
            else
                echo "✓ LOG_FILE already configured"
            fi
            
            # Copy Fail2Ban configuration
            echo "📝 Installing Fail2Ban configuration..."
            sudo cp fail2ban/filter.d/ectlogger.conf /etc/fail2ban/filter.d/
            sudo cp fail2ban/jail.d/ectlogger.conf /etc/fail2ban/jail.d/
            echo "✓ Fail2Ban filter and jail configuration installed"
            
            # Set up sudoers for fail2ban-client access from web app
            echo "🔐 Setting up sudo permissions for fail2ban-client..."
            SUDOERS_FILE="/etc/sudoers.d/ectlogger-fail2ban"
            echo "# Allow ECTLogger user to run fail2ban-client without password" | sudo tee "$SUDOERS_FILE" > /dev/null
            echo "# This enables the Security tab in the admin UI to show Fail2Ban status" | sudo tee -a "$SUDOERS_FILE" > /dev/null
            echo "$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-client status ectlogger" | sudo tee -a "$SUDOERS_FILE" > /dev/null
            echo "$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-client set ectlogger unbanip *" | sudo tee -a "$SUDOERS_FILE" > /dev/null
            sudo chmod 440 "$SUDOERS_FILE"
            echo "✓ Sudoers configured for fail2ban-client"
            
            # Enable and restart Fail2Ban
            sudo systemctl enable fail2ban 2>/dev/null
            sudo systemctl restart fail2ban
            
            # Verify ectlogger jail is active
            sleep 2
            if sudo fail2ban-client status 2>/dev/null | grep -q "ectlogger"; then
                echo "✓ ECTLogger jail is active"
                FAIL2BAN_SETUP=true
            else
                echo "⚠️  ECTLogger jail may not be active. Check: sudo fail2ban-client status"
            fi
            
            echo ""
            echo "Fail2Ban settings (can be customized in /etc/fail2ban/jail.d/ectlogger.conf):"
            echo "  • Max failed attempts: 5"
            echo "  • Time window: 10 minutes"
            echo "  • Ban duration: 1 hour"
            echo ""
            
            # If Caddy is already installed, offer to add Caddy protection too
            if command -v caddy &> /dev/null; then
                echo "🌐 Caddy detected! Would you like to add Fail2Ban protection for Caddy too?"
                echo "   This blocks scanners probing for WordPress, PHPMyAdmin, exploits, etc."
                read -p "Add Caddy Fail2Ban protection? (Y/n) " -n 1 -r
                echo ""
                
                if [[ ! "$REPLY" =~ ^[Nn]$ ]]; then
                    # Create Caddy log directory
                    sudo mkdir -p /var/log/caddy
                    sudo chown caddy:caddy /var/log/caddy 2>/dev/null || sudo chown root:root /var/log/caddy
                    
                    # Install Caddy Fail2Ban filter and jail
                    sudo cp fail2ban/filter.d/caddy-ectlogger.conf /etc/fail2ban/filter.d/
                    sudo cp fail2ban/jail.d/caddy-ectlogger.conf /etc/fail2ban/jail.d/
                    
                    # Restart Fail2Ban
                    sudo systemctl restart fail2ban
                    
                    sleep 2
                    if sudo fail2ban-client status 2>/dev/null | grep -q "caddy-ectlogger"; then
                        echo "✓ Caddy Fail2Ban protection enabled"
                    else
                        echo "⚠️  Caddy jail may need Caddy to start logging first"
                    fi
                    
                    echo ""
                    echo "⚠️  Note: Make sure your Caddyfile includes logging:"
                    echo "     log {"
                    echo "         output file /var/log/caddy/access.log"
                    echo "         format json"
                    echo "     }"
                    echo ""
                fi
            fi
        else
            echo "ℹ️  Skipping Fail2Ban setup. See FAIL2BAN.md for manual installation."
            echo ""
        fi
    fi
fi

# Step 4: Caddy Reverse Proxy Setup (optional, only on Linux)
CADDY_SETUP=false
if [ "$CONFIG_DONE" = true ] && [ -f /etc/os-release ]; then
    detect_os
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" || "$OS" == "fedora" || "$OS" == "rhel" || "$OS" == "centos" ]]; then
        echo ""
        echo "================================="
        echo "🌐 Caddy Reverse Proxy Setup"
        echo "================================="
        echo ""
        echo "Caddy can serve as a reverse proxy with automatic HTTPS."
        echo "This is recommended for production deployments."
        echo ""
        read -p "Would you like to set up Caddy as a reverse proxy? (y/n) " -n 1 -r
        echo ""
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # Install Caddy if not present
            if ! command -v caddy &> /dev/null; then
                echo "📦 Installing Caddy..."
                case "$OS" in
                    ubuntu|debian)
                        sudo apt-get update -qq
                        sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
                        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
                        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
                        sudo apt-get update -qq
                        sudo apt-get install -y caddy
                        ;;
                    fedora|rhel|centos)
                        sudo dnf install -y 'dnf-command(copr)'
                        sudo dnf copr enable -y @caddy/caddy
                        sudo dnf install -y caddy
                        ;;
                esac
                echo "✓ Caddy installed"
            else
                echo "✓ Caddy already installed"
            fi
            
            # Try to get domain from FRONTEND_URL in .env
            DEFAULT_CADDY_DOMAIN=""
            if [ -f "backend/.env" ]; then
                FRONTEND_URL=$(grep "^FRONTEND_URL=" backend/.env | cut -d'=' -f2)
                if [ -n "$FRONTEND_URL" ]; then
                    # Extract domain from URL (remove protocol and port)
                    DEFAULT_CADDY_DOMAIN=$(echo "$FRONTEND_URL" | sed -E 's|^https?://||' | sed -E 's|:[0-9]+.*||' | sed -E 's|/.*||')
                fi
            fi
            
            # Get domain name
            echo ""
            echo "Enter the domain name for ECTLogger (e.g., ectlogger.example.com):"
            echo "  • For automatic HTTPS, enter a real domain pointing to this server"
            echo "  • For local/testing, enter 'localhost' or leave blank"
            if [ -n "$DEFAULT_CADDY_DOMAIN" ] && [ "$DEFAULT_CADDY_DOMAIN" != "localhost" ]; then
                echo ""
                read -p "Domain (press Enter for $DEFAULT_CADDY_DOMAIN): " CADDY_DOMAIN
                CADDY_DOMAIN=${CADDY_DOMAIN:-$DEFAULT_CADDY_DOMAIN}
            else
                read -p "Domain: " CADDY_DOMAIN
            fi
            
            if [ -z "$CADDY_DOMAIN" ]; then
                CADDY_DOMAIN="localhost"
            fi
            
            # Create Caddy configuration
            CADDYFILE="/etc/caddy/Caddyfile"
            CADDY_CONFIG_BLOCK="
# ECTLogger - Added by install.sh
$CADDY_DOMAIN {
    # Access logging for Fail2Ban integration
    log {
        output file /var/log/caddy/access.log {
            roll_size 100mb
            roll_keep 5
        }
        format json
    }
    
    # Serve frontend static files
    root * $(pwd)/frontend/dist
    file_server
    
    # Proxy API and WebSocket requests to backend
    handle /api/* {
        reverse_proxy localhost:8000
    }
    
    handle /ws/* {
        reverse_proxy localhost:8000
    }
    
    handle /docs* {
        reverse_proxy localhost:8000
    }
    
    handle /openapi.json {
        reverse_proxy localhost:8000
    }
    
    # Try files, fallback to index.html for SPA routing
    try_files {path} /index.html
    
    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }
    
    # Compression
    encode gzip
}
"
            
            # Check if domain already exists in Caddyfile
            if [ -f "$CADDYFILE" ] && grep -q "^$CADDY_DOMAIN {" "$CADDYFILE" 2>/dev/null; then
                echo ""
                echo "⚠️  Configuration for '$CADDY_DOMAIN' already exists in Caddyfile."
                read -p "Replace existing configuration? (y/n) " -n 1 -r
                echo ""
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    # Remove existing block (from domain line to next domain or EOF)
                    sudo sed -i "/^$CADDY_DOMAIN {/,/^[a-zA-Z]/{ /^[a-zA-Z].*{/!d }" "$CADDYFILE"
                    echo "$CADDY_CONFIG_BLOCK" | sudo tee -a "$CADDYFILE" > /dev/null
                    echo "✓ Caddyfile updated"
                else
                    echo "ℹ️  Keeping existing configuration"
                fi
            else
                # Append to existing Caddyfile or create new one
                echo "$CADDY_CONFIG_BLOCK" | sudo tee -a "$CADDYFILE" > /dev/null
                echo "✓ Caddyfile configured for $CADDY_DOMAIN"
            fi
            
            # Build frontend for production if not already built
            if [ ! -d "frontend/dist" ]; then
                echo ""
                echo "📦 Building frontend for production..."
                cd frontend
                npm run build
                cd ..
                echo "✓ Frontend built"
            fi
            
            # Validate Caddy configuration
            echo ""
            echo "🔍 Validating Caddy configuration..."
            if sudo caddy validate --config "$CADDYFILE" 2>/dev/null; then
                echo "✓ Caddy configuration is valid"
            else
                echo "⚠️  Caddy configuration may have issues. Check: sudo caddy validate --config $CADDYFILE"
            fi
            
            # Enable and restart Caddy
            sudo systemctl enable caddy 2>/dev/null
            sudo systemctl restart caddy
            
            # Verify Caddy is running
            sleep 2
            if systemctl is-active --quiet caddy; then
                echo "✓ Caddy is running"
                CADDY_SETUP=true
            else
                echo "⚠️  Caddy may not be running. Check: sudo systemctl status caddy"
            fi
            
            # Show access info
            echo ""
            if [ "$CADDY_DOMAIN" = "localhost" ]; then
                echo "🌐 ECTLogger will be available at: http://localhost"
            else
                echo "🌐 ECTLogger will be available at: https://$CADDY_DOMAIN"
                echo "   (Caddy will automatically obtain SSL certificate)"
            fi
            echo ""
            
            # Integrate with Fail2Ban if it's installed or was just set up
            if [ "$FAIL2BAN_SETUP" = true ] || command -v fail2ban-client &> /dev/null; then
                echo "🛡️  Integrating Caddy with Fail2Ban..."
                
                # Create Caddy log directory
                sudo mkdir -p /var/log/caddy
                sudo chown caddy:caddy /var/log/caddy 2>/dev/null || sudo chown root:root /var/log/caddy
                echo "✓ Caddy log directory created: /var/log/caddy"
                
                # Install Caddy Fail2Ban filter and jail
                sudo cp fail2ban/filter.d/caddy-ectlogger.conf /etc/fail2ban/filter.d/
                sudo cp fail2ban/jail.d/caddy-ectlogger.conf /etc/fail2ban/jail.d/
                echo "✓ Caddy Fail2Ban filter and jail installed"
                
                # Restart Fail2Ban to pick up new config
                sudo systemctl restart fail2ban
                
                # Verify Caddy jail is active
                sleep 2
                if sudo fail2ban-client status 2>/dev/null | grep -q "caddy-ectlogger"; then
                    echo "✓ Caddy Fail2Ban jail is active"
                else
                    echo "⚠️  Caddy jail may need a restart. Check: sudo fail2ban-client status"
                fi
                
                echo ""
                echo "🛡️  Caddy + Fail2Ban Integration:"
                echo "  • Bans scanners probing for WordPress, PHPMyAdmin, etc."
                echo "  • Bans path traversal and SQL injection attempts"
                echo "  • Default: 24-hour ban after 3 suspicious requests"
                echo ""
            fi
        else
            echo "ℹ️  Skipping Caddy setup. See PRODUCTION-DEPLOYMENT.md for manual configuration."
            echo ""
        fi
    fi
fi

echo ""
echo "================================="
echo "✅ Installation Complete!"
echo "================================="
echo ""

# Show next steps based on what was done
if [ "$CONFIG_DONE" = false ]; then
    echo "📋 Next steps:"
    echo "1. Configure the application: ./configure.sh"
    if [ "$SERVICE_INSTALLED" = true ]; then
        echo "2. Start the service: sudo systemctl start ectlogger"
    else
        echo "2. Start the application: ./start.sh"
    fi
elif [ "$SERVICE_INSTALLED" = true ]; then
    echo "🎉 ECTLogger is ready to use!"
    echo ""
    echo "📋 To start ECTLogger, choose one option:"
    echo ""
    echo "Option 1 - Start via systemd service (recommended):"
    echo "  sudo systemctl start ectlogger"
    echo ""
    echo "Option 2 - Run directly in terminal:"
    echo "  ./start.sh"
    echo ""
    echo "Additional service commands:"
    echo "  Stop:    sudo systemctl stop ectlogger"
    echo "  Restart: sudo systemctl restart ectlogger"
    echo "  Status:  sudo systemctl status ectlogger"
    echo "  Logs:    sudo journalctl -u ectlogger -f"
    echo ""
    echo "To uninstall the service:"
    echo "  sudo systemctl stop ectlogger"
    echo "  sudo systemctl disable ectlogger"
    echo "  sudo rm /etc/systemd/system/ectlogger.service"
    echo "  sudo systemctl daemon-reload"
else
    echo "🎉 ECTLogger is ready to use!"
    echo ""
    echo "📋 To start the application:"
    echo "  ./start.sh"
fi

# Show Fail2Ban info if set up
if [ "$FAIL2BAN_SETUP" = true ]; then
    echo ""
    echo "🛡️  Fail2Ban Protection Active"
    echo "  App jail:   sudo fail2ban-client status ectlogger"
    if [ "$CADDY_SETUP" = true ] || (command -v caddy &> /dev/null && [ -f /etc/fail2ban/jail.d/caddy-ectlogger.conf ]); then
        echo "  Caddy jail: sudo fail2ban-client status caddy-ectlogger"
    fi
    echo "  Logs:       sudo tail -f /var/log/fail2ban.log"
    echo "  App Log:    tail -f /var/log/ectlogger/app.log"
fi

# Show Caddy info if set up
if [ "$CADDY_SETUP" = true ]; then
    echo ""
    echo "🌐 Caddy Reverse Proxy Active"
    echo "  Status:     sudo systemctl status caddy"
    echo "  Logs:       sudo journalctl -u caddy -f"
    echo "  Access Log: tail -f /var/log/caddy/access.log"
    echo "  Config:     /etc/caddy/Caddyfile"
fi

echo ""
if [ "$CADDY_SETUP" = true ]; then
    if [ "$CADDY_DOMAIN" = "localhost" ]; then
        echo "🌐 Access the application at: http://localhost"
    else
        echo "🌐 Access the application at: https://$CADDY_DOMAIN"
    fi
else
    echo "🌐 Access the application at:"
    echo "  Frontend: http://localhost:3000"
    echo "  API Docs: http://localhost:8000/docs"
fi
echo ""
echo "📚 For help, see QUICKSTART.md or MANUAL-INSTALLATION.md"
