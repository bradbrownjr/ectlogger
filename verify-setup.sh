#!/bin/bash

# ECTLogger Setup Verification Script for Linux/macOS

echo "🔍 ECTLogger Setup Verification"
echo "================================"
echo ""

all_good=true

# Check Python
echo -n "Checking Python..."
if command -v python3 &> /dev/null; then
    python_version=$(python3 --version)
    if [[ $python_version =~ Python\ 3\.([9-9]|[1-9][0-9])\. ]]; then
        echo " ✓ $python_version"
    else
        echo " ✗ Python 3.9+ required, found: $python_version"
        all_good=false
    fi
else
    echo " ✗ Python3 not found"
    all_good=false
fi

# Check Node.js
echo -n "Checking Node.js..."
if command -v node &> /dev/null; then
    node_version=$(node --version)
    if [[ $node_version =~ v(1[8-9]|[2-9][0-9])\. ]]; then
        echo " ✓ $node_version"
    else
        echo " ✗ Node.js 18+ required, found: $node_version"
        all_good=false
    fi
else
    echo " ✗ Node.js not found"
    all_good=false
fi

# Check Git
echo -n "Checking Git..."
if command -v git &> /dev/null; then
    git_version=$(git --version)
    echo " ✓ $git_version"
else
    echo " ⚠ Git not found (optional)"
fi

echo ""
echo "Backend Status:"

# Check backend virtual environment
echo -n "Virtual environment..."
if [ -d "backend/venv" ]; then
    echo " ✓ Found"
else
    echo " ✗ Not found (run: cd backend && python3 -m venv venv)"
fi

# Check backend .env
echo -n ".env file..."
if [ -f "backend/.env" ]; then
    echo " ✓ Found"
    
    # Check for required settings
    env_content=$(cat backend/.env)
    
    echo -n "  - SECRET_KEY..."
    if echo "$env_content" | grep -qE "SECRET_KEY=.{20,}"; then
        echo " ✓"
    else
        echo " ⚠ Not set or too short"
    fi
    
    echo -n "  - SMTP_USER..."
    if echo "$env_content" | grep -qE "SMTP_USER=.+@.+"; then
        echo " ✓"
    else
        echo " ⚠ Not configured"
    fi
    
    echo -n "  - SMTP_PASSWORD..."
    if echo "$env_content" | grep -qE "SMTP_PASSWORD=.{5,}"; then
        echo " ✓"
    else
        echo " ⚠ Not configured"
    fi
else
    echo " ✗ Not found (copy .env.example to backend/.env)"
    all_good=false
fi

# Check backend dependencies
echo -n "Backend dependencies..."
if [ -d "backend/venv" ]; then
    if backend/venv/bin/python -c "import fastapi" 2>/dev/null; then
        echo " ✓ Installed"
    else
        echo " ✗ Not installed (run: cd backend && source venv/bin/activate && pip install -r requirements.txt)"
    fi
else
    echo " ⚠ Cannot check (venv not found)"
fi

echo ""
echo "Frontend Status:"

# Check node_modules
echo -n "Node modules..."
if [ -d "frontend/node_modules" ]; then
    echo " ✓ Installed"
else
    echo " ✗ Not installed (run: cd frontend && npm install)"
fi

# Check frontend files
echo -n "Frontend files..."
if [ -d "frontend/src" ] && [ -f "frontend/package.json" ]; then
    echo " ✓ Found"
else
    echo " ✗ Missing"
    all_good=false
fi

echo ""
echo "Project Files:"

check_file() {
    local file=$1
    local name=$2
    echo -n "$name..."
    if [ -f "$file" ]; then
        echo " ✓"
    else
        echo " ✗ Missing"
        all_good=false
    fi
}

check_file "README.md" "README"
check_file "LICENSE" "License"
check_file "QUICKSTART.md" "Quick Start Guide"
check_file "MANUAL-INSTALLATION.md" "Manual Installation Guide"
check_file "DEVELOPMENT.md" "Development Guide"
check_file "start.sh" "Startup Script"

echo ""
echo "================================"

if [ "$all_good" = true ]; then
    echo "✓ Setup looks good! You're ready to start."
    echo ""
    echo "Next steps:"
    echo "1. Make scripts executable: chmod +x *.sh"
    echo "2. Configure backend/.env: ./configure.sh"
    echo "3. Run ./start.sh to start the application"
    echo "4. Open http://localhost:3000 in your browser"
else
    echo "⚠ Some issues found. Please review the messages above."
    echo ""
    echo "Quick fixes:"
    echo "1. Install missing prerequisites (Python 3.9+, Node.js 18+)"
    echo "2. Run ./configure.sh to set up configuration"
    echo "3. Run ./start.sh to auto-install dependencies"
fi

echo ""
echo "For help, see QUICKSTART.md or MANUAL-INSTALLATION.md"
