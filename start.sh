#!/bin/bash

# ECTLogger Startup Script for Linux/macOS
# This script starts both the backend and frontend servers

# Check if running as systemd service
SERVICE_MODE=false
if [ "$1" = "--service" ]; then
    SERVICE_MODE=true
fi

# Check if systemd service is available
SERVICE_INSTALLED=false
if command -v systemctl &> /dev/null && systemctl list-unit-files ectlogger.service &> /dev/null; then
    SERVICE_INSTALLED=true
fi

# If service is installed and not in service mode, offer to use systemd
if [ "$SERVICE_INSTALLED" = true ] && [ "$SERVICE_MODE" = false ]; then
    echo "🔧 ECTLogger systemd service detected"
    echo ""
    echo "Would you like to:"
    echo "  1) Start via systemd service (recommended)"
    echo "  2) Run directly in this terminal"
    echo ""
    read -p "Choose option (1/2): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[1]$ ]]; then
        echo "Starting ECTLogger service..."
        sudo systemctl start ectlogger
        
        # Wait a moment for service to start
        sleep 2
        
        # Show status
        sudo systemctl status ectlogger --no-pager
        
        echo ""
        echo "✅ ECTLogger service started!"
        echo ""
        echo "🌐 Frontend: http://localhost:3000"
        echo "📡 Backend:  http://localhost:8000"
        echo "📚 API Docs: http://localhost:8000/docs"
        echo ""
        echo "Service commands:"
        echo "  Stop:    sudo systemctl stop ectlogger"
        echo "  Restart: sudo systemctl restart ectlogger"
        echo "  Status:  sudo systemctl status ectlogger"
        echo "  Logs:    sudo journalctl -u ectlogger -f"
        echo ""
        exit 0
    fi
fi

echo "🚀 Starting ECTLogger..."
echo ""

# Check for updates (skip if not in git repo or in service mode)
if [ "$SERVICE_MODE" = false ]; then
    if command -v git &> /dev/null && git rev-parse --git-dir > /dev/null 2>&1; then
        # Prompt with 5 second timeout
        read -t 5 -p "Check for updates? (y/N - auto-continues in 5s): " -n 1 -r
        RESPONSE=$?
        echo ""
        
        # Check if timeout (exit code 142) or if user didn't press Y
        if [ $RESPONSE -ne 0 ] || [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Skipping update check."
            echo ""
        else
            echo "Checking for updates..."
            CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null)
            git fetch origin $(git rev-parse --abbrev-ref HEAD) --quiet 2>/dev/null
            REMOTE_COMMIT=$(git rev-parse origin/$(git rev-parse --abbrev-ref HEAD) 2>/dev/null)
            
            if [ "$CURRENT_COMMIT" != "$REMOTE_COMMIT" ] && [ -n "$REMOTE_COMMIT" ]; then
                echo "📦 Update available!"
                echo ""
                ./update.sh
                echo ""
                echo "Update complete! Restarting..."
                echo ""
                exec ./start.sh "$@"
            else
                echo "✓ Already running the latest version."
                echo ""
            fi
        fi
    fi
fi


# Check if Python is installed
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✓ Python found: $PYTHON_VERSION"
else
    echo "✗ Python3 not found. Please install Python 3.9 or higher."
    exit 1
fi

# Check if Node.js is installed
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✓ Node.js found: $NODE_VERSION"
else
    echo "✗ Node.js not found. Please install Node.js 18 or higher."
    exit 1
fi

echo ""
echo "📦 Checking backend dependencies..."

# Check if backend virtual environment exists
if [ ! -d "backend/venv" ]; then
    echo "Creating Python virtual environment..."
    cd backend
    python3 -m venv venv
    cd ..
    echo "✓ Virtual environment created"
fi

# Activate virtual environment and install dependencies
echo "Installing backend dependencies..."
cd backend
. venv/bin/activate
pip install -r requirements.txt -q
cd ..

echo ""
echo "📦 Checking frontend dependencies..."

# Check if node_modules exists
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
    echo "✓ Frontend dependencies installed"
fi

echo ""
echo "🔧 Checking configuration..."

# Check if .env file exists
if [ ! -f "backend/.env" ]; then
    echo "⚠️  Warning: backend/.env file not found!"
    echo "   Please copy .env.example to backend/.env and configure it."
    echo "   Press Ctrl+C to exit and configure, or Enter to continue..."
    read
fi

echo ""
echo "🚀 Starting servers..."
echo ""

# Start backend in background
echo "📡 Starting backend server on http://localhost:8000"
cd backend
. venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend in background
echo "🌐 Starting frontend server on http://localhost:3000"
cd frontend
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!
cd ..

echo ""
echo "✓ ECTLogger is starting!"
echo ""
echo "🌐 Frontend: http://localhost:3000"
echo "📡 Backend:  http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/docs"
echo ""

if [ "$SERVICE_MODE" = true ]; then
    echo "Running in service mode..."
    # Don't trap signals in service mode, let systemd handle it
    wait
else
    echo "Press Ctrl+C to stop both servers."
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

# Only trap signals in interactive mode
if [ "$SERVICE_MODE" = false ]; then
    # Trap Ctrl+C and call cleanup
    trap cleanup INT
fi

# Wait for user to press Ctrl+C (or for systemd to stop us)
wait
