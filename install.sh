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
    echo "📋 Service commands:"
    echo "  Start:   sudo systemctl start ectlogger"
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

echo ""
echo "🌐 Access the application at:"
echo "  Frontend: http://localhost:3000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "📚 For help, see QUICKSTART.md or SETUP.md"
