# ECTLogger Startup Script
# This script starts both the backend and frontend servers

Write-Host "🚀 Starting ECTLogger..." -ForegroundColor Green
Write-Host ""

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Python not found. Please install Python 3.9 or higher." -ForegroundColor Red
    exit 1
}

# Check if Node.js is installed
try {
    $nodeVersion = node --version 2>&1
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install Node.js 18 or higher." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📦 Checking backend dependencies..." -ForegroundColor Cyan

# Check if backend virtual environment exists
if (-not (Test-Path "backend\venv")) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    Set-Location backend
    python -m venv venv
    Set-Location ..
    Write-Host "✓ Virtual environment created" -ForegroundColor Green
}

# Activate virtual environment and install dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
& .\venv\Scripts\Activate.ps1
pip install -r requirements.txt -q
Set-Location ..

Write-Host ""
Write-Host "📦 Checking frontend dependencies..." -ForegroundColor Cyan

# Check if node_modules exists
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
    Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "🔧 Checking configuration..." -ForegroundColor Cyan

# Check if .env file exists
if (-not (Test-Path "backend\.env")) {
    Write-Host "⚠️  Warning: backend\.env file not found!" -ForegroundColor Yellow
    Write-Host "   Please copy .env.example to backend\.env and configure it." -ForegroundColor Yellow
    Write-Host "   Press Ctrl+C to exit and configure, or any key to continue..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

Write-Host ""
Write-Host "🚀 Starting servers..." -ForegroundColor Green
Write-Host ""

# Start backend in a new window
Write-Host "📡 Starting backend server on http://localhost:8000" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

# Wait a moment for backend to start
Start-Sleep -Seconds 3

# Start frontend in a new window
Write-Host "🌐 Starting frontend server on http://localhost:3000" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev"

Write-Host ""
Write-Host "✓ ECTLogger is starting!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host "📡 Backend:  http://localhost:8000" -ForegroundColor Green
Write-Host "📚 API Docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""

# Show configured URLs if available
if (Test-Path "backend\.env") {
    $content = Get-Content "backend\.env"
    foreach ($line in $content) {
        if ($line -match "^FRONTEND_URL=(.*)") {
            $configuredUrl = $matches[1]
            if ($configuredUrl -and $configuredUrl -ne "http://localhost:3000") {
                Write-Host "🌍 Production URL: $configuredUrl" -ForegroundColor Cyan
                Write-Host ""
            }
        }
    }
}

Write-Host "Press Ctrl+C in the server windows to stop them." -ForegroundColor Yellow
