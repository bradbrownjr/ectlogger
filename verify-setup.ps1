# ECTLogger Setup Verification Script

Write-Host "🔍 ECTLogger Setup Verification" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check Python
Write-Host "Checking Python..." -NoNewline
try {
    $pythonVersion = python --version 2>&1
    if ($pythonVersion -match "Python 3\.([9-9]|[1-9][0-9])\.") {
        Write-Host " ✓ $pythonVersion" -ForegroundColor Green
    } else {
        Write-Host " ✗ Python 3.9+ required, found: $pythonVersion" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host " ✗ Python not found" -ForegroundColor Red
    $allGood = $false
}

# Check Node.js
Write-Host "Checking Node.js..." -NoNewline
try {
    $nodeVersion = node --version 2>&1
    if ($nodeVersion -match "v(1[8-9]|[2-9][0-9])\.") {
        Write-Host " ✓ $nodeVersion" -ForegroundColor Green
    } else {
        Write-Host " ✗ Node.js 18+ required, found: $nodeVersion" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host " ✗ Node.js not found" -ForegroundColor Red
    $allGood = $false
}

# Check Git
Write-Host "Checking Git..." -NoNewline
try {
    $gitVersion = git --version 2>&1
    Write-Host " ✓ $gitVersion" -ForegroundColor Green
} catch {
    Write-Host " ⚠ Git not found (optional)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Backend Status:" -ForegroundColor Cyan

# Check backend virtual environment
Write-Host "Virtual environment..." -NoNewline
if (Test-Path "backend\venv") {
    Write-Host " ✓ Found" -ForegroundColor Green
} else {
    Write-Host " ✗ Not found (run: cd backend; python -m venv venv)" -ForegroundColor Yellow
}

# Check backend .env
Write-Host ".env file..." -NoNewline
if (Test-Path "backend\.env") {
    Write-Host " ✓ Found" -ForegroundColor Green
    
    # Check for required settings
    $envContent = Get-Content "backend\.env" -Raw
    Write-Host "  - SECRET_KEY..." -NoNewline
    if ($envContent -match "SECRET_KEY=.{20,}") {
        Write-Host " ✓" -ForegroundColor Green
    } else {
        Write-Host " ⚠ Not set or too short" -ForegroundColor Yellow
    }
    
    Write-Host "  - SMTP_USER..." -NoNewline
    if ($envContent -match "SMTP_USER=.+@.+") {
        Write-Host " ✓" -ForegroundColor Green
    } else {
        Write-Host " ⚠ Not configured" -ForegroundColor Yellow
    }
    
    Write-Host "  - SMTP_PASSWORD..." -NoNewline
    if ($envContent -match "SMTP_PASSWORD=.{5,}") {
        Write-Host " ✓" -ForegroundColor Green
    } else {
        Write-Host " ⚠ Not configured" -ForegroundColor Yellow
    }
} else {
    Write-Host " ✗ Not found (copy .env.example to backend\.env)" -ForegroundColor Red
    $allGood = $false
}

# Check backend dependencies
Write-Host "Backend dependencies..." -NoNewline
if (Test-Path "backend\venv") {
    try {
        & backend\venv\Scripts\python.exe -c "import fastapi" 2>$null
        Write-Host " ✓ Installed" -ForegroundColor Green
    } catch {
        Write-Host " ✗ Not installed (run: cd backend; .\venv\Scripts\Activate.ps1; pip install -r requirements.txt)" -ForegroundColor Yellow
    }
} else {
    Write-Host " ⚠ Cannot check (venv not found)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Frontend Status:" -ForegroundColor Cyan

# Check node_modules
Write-Host "Node modules..." -NoNewline
if (Test-Path "frontend\node_modules") {
    Write-Host " ✓ Installed" -ForegroundColor Green
} else {
    Write-Host " ✗ Not installed (run: cd frontend; npm install)" -ForegroundColor Yellow
}

# Check frontend files
Write-Host "Frontend files..." -NoNewline
if ((Test-Path "frontend\src") -and (Test-Path "frontend\package.json")) {
    Write-Host " ✓ Found" -ForegroundColor Green
} else {
    Write-Host " ✗ Missing" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""
Write-Host "Project Files:" -ForegroundColor Cyan

$requiredFiles = @(
    @{ Path = "README.md"; Name = "README" },
    @{ Path = "LICENSE"; Name = "License" },
    @{ Path = "QUICKSTART.md"; Name = "Quick Start Guide" },
    @{ Path = "MANUAL-INSTALLATION.md"; Name = "Manual Installation Guide" },
    @{ Path = "DEVELOPMENT.md"; Name = "Development Guide" },
    @{ Path = "start.ps1"; Name = "Startup Script" }
)

foreach ($file in $requiredFiles) {
    Write-Host "$($file.Name)..." -NoNewline
    if (Test-Path $file.Path) {
        Write-Host " ✓" -ForegroundColor Green
    } else {
        Write-Host " ✗ Missing" -ForegroundColor Red
        $allGood = $false
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan

if ($allGood) {
    Write-Host "✓ Setup looks good! You're ready to start." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Configure backend\.env with your email settings"
    Write-Host "2. Run .\start.ps1 to start the application"
    Write-Host "3. Open http://localhost:3000 in your browser"
} else {
    Write-Host "⚠ Some issues found. Please review the messages above." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Quick fixes:" -ForegroundColor Cyan
    Write-Host "1. Install missing prerequisites (Python 3.9+, Node.js 18+)"
    Write-Host "2. Run .\start.ps1 to auto-install dependencies"
    Write-Host "3. Copy .env.example to backend\.env and configure it"
}

Write-Host ""
Write-Host "For help, see QUICKSTART.md or MANUAL-INSTALLATION.md" -ForegroundColor Cyan
