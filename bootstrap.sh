#!/bin/bash
# ECTLogger Bootstrap Script
# 
# This script can be run on a fresh Debian-based system to download and install ECTLogger.
# It's designed for "speedrun to deployment" - a single command gets you a working system.
#
# USAGE (run as your normal user, not root):
#   curl -fsSL https://raw.githubusercontent.com/bradbrownjr/ectlogger/main/bootstrap.sh | bash
#
# When piped (curl | bash), the script saves itself to a temp file and prompts you
# to run it for full interactive configuration (email, service setup, etc.)
#
# OPTIONS:
#   --non-interactive    Skip all prompts, use defaults (for automated deployments)
#   --install-dir PATH   Custom installation directory (default: ~/ectlogger)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default settings
INSTALL_DIR="$HOME/ectlogger"
NON_INTERACTIVE=false
REPO_URL="https://github.com/bradbrownjr/ectlogger.git"
BOOTSTRAP_URL="https://raw.githubusercontent.com/bradbrownjr/ectlogger/main/bootstrap.sh"

# Detect if stdin is a pipe (e.g., curl | bash) - interactive mode won't work
if [ ! -t 0 ]; then
    # stdin is not a terminal - we're being piped
    # Download the script fresh to a temp file so user can run it interactively
    BOOTSTRAP_SCRIPT=$(mktemp /tmp/ectlogger-bootstrap.XXXXXX.sh)
    curl -fsSL "$BOOTSTRAP_URL" > "$BOOTSTRAP_SCRIPT"
    chmod +x "$BOOTSTRAP_SCRIPT"
    
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     ${GREEN}ECTLogger - Speedrun Installation${BLUE}                         ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}✓ Bootstrap script downloaded!${NC}"
    echo ""
    echo -e "Run this command to start the interactive installer:"
    echo ""
    echo -e "    ${GREEN}bash $BOOTSTRAP_SCRIPT${NC}"
    echo ""
    exit 0
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --non-interactive)
            NON_INTERACTIVE=true
            shift
            ;;
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                               ║${NC}"
echo -e "${BLUE}║     ${GREEN}ECTLogger - Speedrun Installation${BLUE}                         ║${NC}"
echo -e "${BLUE}║     ${NC}Emergency Communications Team Net Logger${BLUE}                  ║${NC}"
echo -e "${BLUE}║                                                               ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}❌ Please do not run as root!${NC}"
    echo "   This script uses sudo when needed for system packages."
    echo "   Run as your normal user account."
    exit 1
fi

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
        OS_NAME=$PRETTY_NAME
    elif [ "$(uname)" == "Darwin" ]; then
        OS="macos"
        OS_NAME="macOS"
    else
        OS="unknown"
        OS_NAME="Unknown"
    fi
}

detect_os

echo -e "${BLUE}📋 System Information${NC}"
echo "   OS: $OS_NAME"
echo "   Install directory: $INSTALL_DIR"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Install system prerequisites
install_prerequisites() {
    echo -e "${BLUE}📦 Installing system prerequisites...${NC}"
    echo ""
    
    case "$OS" in
        ubuntu|debian|raspbian)
            echo "   Updating package lists..."
            sudo apt update -qq
            
            echo "   Installing required packages..."
            sudo apt install -y -qq \
                git \
                curl \
                python3 \
                python3-pip \
                python3-venv \
                python3-dev \
                build-essential \
                libssl-dev \
                libffi-dev \
                pkg-config \
                ca-certificates \
                gnupg
            
            # Install Node.js 22.x LTS if not present
            if ! command_exists node; then
                echo "   Installing Node.js 22.x LTS..."
                curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null 2>&1
                sudo apt install -y -qq nodejs
            fi
            ;;
            
        fedora|rhel|centos|rocky|alma)
            echo "   Installing required packages..."
            sudo dnf install -y -q \
                git \
                curl \
                python3 \
                python3-pip \
                python3-devel \
                gcc \
                openssl-devel \
                libffi-devel \
                pkg-config
            
            if ! command_exists node; then
                echo "   Installing Node.js 22.x LTS..."
                curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - >/dev/null 2>&1
                sudo dnf install -y -q nodejs
            fi
            ;;
            
        macos)
            if ! command_exists brew; then
                echo "   Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            
            echo "   Installing required packages..."
            brew install git python3 node 2>/dev/null || true
            ;;
            
        *)
            echo -e "${RED}❌ Unsupported OS: $OS${NC}"
            echo "   Supported: Debian, Ubuntu, Fedora, RHEL, CentOS, Rocky, Alma, macOS"
            exit 1
            ;;
    esac
    
    # Install Rust if needed (for cryptography package)
    if ! command_exists rustc; then
        echo "   Installing Rust (needed for cryptography package)..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y >/dev/null 2>&1
        source "$HOME/.cargo/env" 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✓ Prerequisites installed${NC}"
    echo ""
}

# Verify required tools
verify_prerequisites() {
    echo -e "${BLUE}🔍 Verifying prerequisites...${NC}"
    local missing=()
    
    command_exists git || missing+=("git")
    command_exists python3 || missing+=("python3")
    command_exists node || missing+=("node")
    command_exists npm || missing+=("npm")
    
    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Missing: ${missing[*]}${NC}"
        return 1
    fi
    
    echo "   git:     $(git --version | cut -d' ' -f3)"
    echo "   python:  $(python3 --version | cut -d' ' -f2)"
    echo "   node:    $(node --version)"
    echo "   npm:     $(npm --version)"
    echo -e "${GREEN}✓ All prerequisites verified${NC}"
    echo ""
    return 0
}

# Clone or update repository
setup_repository() {
    echo -e "${BLUE}📥 Setting up ECTLogger repository...${NC}"
    
    if [ -d "$INSTALL_DIR/.git" ]; then
        echo "   Repository already exists at $INSTALL_DIR"
        echo "   Pulling latest changes..."
        cd "$INSTALL_DIR"
        git pull --quiet
        echo -e "${GREEN}✓ Repository updated${NC}"
    else
        if [ -d "$INSTALL_DIR" ]; then
            echo -e "${YELLOW}   Directory exists but is not a git repository${NC}"
            if [ "$NON_INTERACTIVE" = true ]; then
                echo "   Backing up and re-cloning..."
                mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
            else
                echo "   Would you like to backup and re-clone? (y/n)"
                read -r response
                if [[ "$response" =~ ^[Yy]$ ]]; then
                    mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
                else
                    echo -e "${RED}❌ Cannot proceed without repository${NC}"
                    exit 1
                fi
            fi
        fi
        
        echo "   Cloning ECTLogger..."
        git clone --quiet "$REPO_URL" "$INSTALL_DIR"
        echo -e "${GREEN}✓ Repository cloned${NC}"
    fi
    
    cd "$INSTALL_DIR"
    echo ""
}

# Run the main installation
run_installation() {
    echo -e "${BLUE}🚀 Running ECTLogger installation...${NC}"
    echo ""
    
    chmod +x *.sh 2>/dev/null || true
    
    if [ "$NON_INTERACTIVE" = true ]; then
        # Non-interactive mode: set up backend and frontend without prompts
        
        # Backend setup
        echo "   Setting up Python virtual environment..."
        cd backend
        python3 -m venv venv
        source venv/bin/activate
        pip install --upgrade pip -q
        pip install -r requirements.txt -q
        cd ..
        echo -e "${GREEN}✓ Backend dependencies installed${NC}"
        
        # Frontend setup
        echo "   Installing frontend dependencies..."
        cd frontend
        npm install --silent
        cd ..
        echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
        
        # Create default .env if not exists
        if [ ! -f "backend/.env" ]; then
            echo "   Creating default configuration..."
            cp .env.example backend/.env
            # Generate a random secret key
            SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
            sed -i "s/your-very-secure-secret-key-change-this-in-production/$SECRET_KEY/" backend/.env
            echo -e "${YELLOW}⚠️  Default configuration created - you must configure email settings!${NC}"
            echo "      Edit backend/.env to set SMTP_* variables"
        fi
        
    else
        # Interactive mode: run the full install script
        ./install.sh
    fi
}

# Main execution
main() {
    # Check and install prerequisites
    if ! verify_prerequisites; then
        install_prerequisites
        # Re-source cargo env in case Rust was just installed
        source "$HOME/.cargo/env" 2>/dev/null || true
        verify_prerequisites || {
            echo -e "${RED}❌ Failed to install prerequisites${NC}"
            exit 1
        }
    fi
    
    # Setup repository
    setup_repository
    
    # Run installation
    run_installation
    
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                                               ║${NC}"
    echo -e "${BLUE}║     ${GREEN}✅ ECTLogger Installation Complete!${BLUE}                       ║${NC}"
    echo -e "${BLUE}║                                                               ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}📋 Next Steps:${NC}"
    echo ""
    if [ ! -f "backend/.env" ] || grep -q "your-very-secure-secret-key" backend/.env 2>/dev/null; then
        echo "   1. Configure the application:"
        echo "      cd $INSTALL_DIR && ./configure.sh"
        echo ""
        echo "   2. Start ECTLogger:"
        echo "      ./start.sh"
    else
        echo "   1. Start ECTLogger:"
        echo "      cd $INSTALL_DIR && ./start.sh"
    fi
    echo ""
    echo -e "${BLUE}🌐 Access Points:${NC}"
    echo "   Application:  http://localhost:3000"
    echo "   API Docs:     http://localhost:8000/docs"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: First Login${NC}"
    echo "   The first user to sign in becomes the Administrator."
    echo "   Sign in before making the server publicly accessible!"
    echo ""
    echo -e "${BLUE}📚 Documentation:${NC}"
    echo "   $INSTALL_DIR/QUICKSTART.md"
    echo "   $INSTALL_DIR/PRODUCTION-DEPLOYMENT.md"
    echo ""
}

# Run main
main "$@"
