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

# Check for .env
if [ ! -f "backend/.env" ]; then
    echo ""
    echo "⚠️  Configuration needed!"
    echo ""
    echo "Would you like to configure now? (Y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Nn]$ ]]; then
        ./configure.sh
    else
        echo ""
        echo "You can configure later by running: ./configure.sh"
    fi
fi

echo ""
echo "================================="
echo "✓ Installation complete!"
echo ""

# Offer to install systemd service (Linux only)
if command -v systemctl &> /dev/null; then
    echo "🔧 Systemd detected!"
    echo ""
    read -p "Would you like to install ECTLogger as a system service? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        chmod +x install-service.sh
        ./install-service.sh
    else
        echo "ℹ️  You can install the service later by running: ./install-service.sh"
    fi
    echo ""
fi

echo "Next steps:"
if [ ! -f "backend/.env" ]; then
    echo "1. Configure the application: ./configure.sh"
    echo "2. Start the application: ./start.sh"
else
    echo "1. Start the application: ./start.sh"
fi
echo ""
echo "Access the application at:"
echo "  Frontend: http://localhost:3000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "For help, see QUICKSTART.md or SETUP.md"
