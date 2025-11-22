#!/bin/bash

# ECTLogger Startup Script for Linux/macOS
# This script starts both the backend and frontend servers

echo "🚀 Starting ECTLogger..."
echo ""

# Check for updates (skip if not in git repo)
if command -v git &> /dev/null && git rev-parse --git-dir > /dev/null 2>&1; then
    CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null)
    git fetch origin $(git rev-parse --abbrev-ref HEAD) --quiet 2>/dev/null
    REMOTE_COMMIT=$(git rev-parse origin/$(git rev-parse --abbrev-ref HEAD) 2>/dev/null)
    
    if [ "$CURRENT_COMMIT" != "$REMOTE_COMMIT" ] && [ -n "$REMOTE_COMMIT" ]; then
        echo "📦 Update available! Run './update.sh' to update."
        echo ""
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
echo "Press Ctrl+C to stop both servers."

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup INT

# Wait for user to press Ctrl+C
wait
