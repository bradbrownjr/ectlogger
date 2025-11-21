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

# Check Python
echo "Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo "✗ Python3 not found!"
    echo ""
    echo "Please install Python 3.9 or higher:"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
    echo "  Fedora/RHEL: sudo dnf install python3 python3-pip"
    echo "  macOS: brew install python3"
    exit 1
fi
echo "✓ Python3 found"

# Check Node.js
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "✗ Node.js not found!"
    echo ""
    echo "Please install Node.js 18 or higher:"
    echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs"
    echo "  Fedora/RHEL: sudo dnf install nodejs"
    echo "  macOS: brew install node"
    exit 1
fi
echo "✓ Node.js found"

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
