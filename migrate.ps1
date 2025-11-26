# ECTLogger URL Migration Script for Windows
# Use this script to change the host address for your ECTLogger deployment
# without modifying other configuration settings.

param(
    [string]$Host,
    [string]$LanIP,
    [string]$FrontendUrl,
    [string]$ApiUrl,
    [switch]$Help
)

Write-Host "🔄 ECTLogger URL Migration Tool" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Show help
if ($Help) {
    Write-Host "Usage: .\migrate.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Host HOSTNAME       Set both URLs using the same hostname"
    Write-Host "                       (Frontend: https://HOSTNAME, API: https://HOSTNAME/api)"
    Write-Host "  -LanIP IP            Set both URLs for LAN deployment"
    Write-Host "                       (Frontend: http://IP:3000, API: http://IP:8000/api)"
    Write-Host "  -FrontendUrl URL     Set the frontend URL (where users access the app)"
    Write-Host "  -ApiUrl URL          Set the API URL (backend server address)"
    Write-Host "  -Help                Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\migrate.ps1 -Host ect.example.com"
    Write-Host "  .\migrate.ps1 -LanIP 192.168.1.100"
    Write-Host "  .\migrate.ps1 -FrontendUrl https://ect.example.com -ApiUrl https://ect.example.com/api"
    Write-Host ""
    exit 0
}

# Check if .env files exist
if (-not (Test-Path "backend\.env")) {
    Write-Host "✗ backend\.env not found!" -ForegroundColor Red
    Write-Host "  Please run .\configure.ps1 first to set up the application." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "frontend\.env")) {
    # Create frontend .env if it doesn't exist
    Write-Host "Creating frontend\.env..." -ForegroundColor Yellow
    New-Item -Path "frontend\.env" -ItemType File -Force | Out-Null
}

# Read current configuration
$currentFrontendUrl = ""
$currentApiUrl = ""

if (Test-Path "backend\.env") {
    $content = Get-Content "backend\.env"
    foreach ($line in $content) {
        if ($line -match "^FRONTEND_URL=(.*)") {
            $currentFrontendUrl = $matches[1]
        }
    }
}

if (Test-Path "frontend\.env") {
    $content = Get-Content "frontend\.env"
    foreach ($line in $content) {
        if ($line -match "^VITE_API_URL=(.*)") {
            $currentApiUrl = $matches[1]
        }
    }
}

Write-Host "📋 Current Configuration:" -ForegroundColor Cyan
Write-Host "  Frontend URL: $currentFrontendUrl"
Write-Host "  API URL:      $currentApiUrl"
Write-Host ""

# Determine new URLs based on parameters
$newFrontendUrl = ""
$newApiUrl = ""

if ($Host) {
    # Production deployment with reverse proxy (same domain)
    if ($Host -match "localhost" -or $Host -match "^\d+\.\d+\.\d+\.\d+$") {
        $newFrontendUrl = "http://$Host"
        $newApiUrl = "http://$Host/api"
    } else {
        $newFrontendUrl = "https://$Host"
        $newApiUrl = "https://$Host/api"
    }
} elseif ($LanIP) {
    # LAN deployment (separate ports, no reverse proxy)
    $newFrontendUrl = "http://${LanIP}:3000"
    $newApiUrl = "http://${LanIP}:8000/api"
} elseif ($FrontendUrl -or $ApiUrl) {
    $newFrontendUrl = $FrontendUrl
    $newApiUrl = $ApiUrl
} else {
    # Interactive mode
    Write-Host "📝 Interactive Mode" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Choose deployment type:" -ForegroundColor Yellow
    Write-Host "  1) Production (single domain with reverse proxy)"
    Write-Host "  2) LAN (separate ports, no reverse proxy)"
    Write-Host "  3) Custom URLs"
    Write-Host ""
    
    $choice = Read-Host "Enter choice (1/2/3)"
    
    switch ($choice) {
        "1" {
            $hostname = Read-Host "Enter production hostname (e.g., ect.example.com)"
            if ($hostname -match "localhost" -or $hostname -match "^\d+\.\d+\.\d+\.\d+$") {
                $newFrontendUrl = "http://$hostname"
                $newApiUrl = "http://$hostname/api"
            } else {
                $newFrontendUrl = "https://$hostname"
                $newApiUrl = "https://$hostname/api"
            }
        }
        "2" {
            $ip = Read-Host "Enter LAN IP address (e.g., 192.168.1.100)"
            $newFrontendUrl = "http://${ip}:3000"
            $newApiUrl = "http://${ip}:8000/api"
        }
        "3" {
            $newFrontendUrl = Read-Host "Enter frontend URL"
            $newApiUrl = Read-Host "Enter API URL"
        }
        default {
            Write-Host "Invalid choice. Exiting." -ForegroundColor Red
            exit 1
        }
    }
}

# Validate we have URLs
if ([string]::IsNullOrWhiteSpace($newFrontendUrl) -or [string]::IsNullOrWhiteSpace($newApiUrl)) {
    Write-Host "✗ Both frontend and API URLs are required!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📝 New Configuration:" -ForegroundColor Cyan
Write-Host "  Frontend URL: $newFrontendUrl" -ForegroundColor Green
Write-Host "  API URL:      $newApiUrl" -ForegroundColor Green
Write-Host ""

$confirm = Read-Host "Apply these changes? (Y/n)"
if ($confirm -eq "n" -or $confirm -eq "N") {
    Write-Host "Migration cancelled." -ForegroundColor Yellow
    exit 0
}

# Update backend/.env
Write-Host ""
Write-Host "Updating backend\.env..." -ForegroundColor Cyan

$backendEnv = Get-Content "backend\.env"
$foundFrontendUrl = $false
$newBackendEnv = @()

foreach ($line in $backendEnv) {
    if ($line -match "^FRONTEND_URL=") {
        $newBackendEnv += "FRONTEND_URL=$newFrontendUrl"
        $foundFrontendUrl = $true
    } else {
        $newBackendEnv += $line
    }
}

if (-not $foundFrontendUrl) {
    $newBackendEnv += "FRONTEND_URL=$newFrontendUrl"
}

$newBackendEnv | Set-Content "backend\.env"
Write-Host "✓ Updated FRONTEND_URL in backend\.env" -ForegroundColor Green

# Update frontend/.env
Write-Host "Updating frontend\.env..." -ForegroundColor Cyan

# Extract hostname for VITE_ALLOWED_HOSTS
$allowedHost = ""
if ($newFrontendUrl -match "https?://([^:/]+)") {
    $allowedHost = $matches[1]
}

$frontendEnv = @()
if (Test-Path "frontend\.env") {
    $frontendEnv = Get-Content "frontend\.env"
}

$foundApiUrl = $false
$foundAllowedHosts = $false
$newFrontendEnv = @()

foreach ($line in $frontendEnv) {
    if ($line -match "^VITE_API_URL=") {
        $newFrontendEnv += "VITE_API_URL=$newApiUrl"
        $foundApiUrl = $true
    } elseif ($line -match "^VITE_ALLOWED_HOSTS=") {
        $newFrontendEnv += "VITE_ALLOWED_HOSTS=$allowedHost"
        $foundAllowedHosts = $true
    } else {
        $newFrontendEnv += $line
    }
}

if (-not $foundApiUrl) {
    $newFrontendEnv += "VITE_API_URL=$newApiUrl"
}
if (-not $foundAllowedHosts -and $allowedHost) {
    $newFrontendEnv += "VITE_ALLOWED_HOSTS=$allowedHost"
}

$newFrontendEnv | Set-Content "frontend\.env"
Write-Host "✓ Updated VITE_API_URL in frontend\.env" -ForegroundColor Green
if ($allowedHost) {
    Write-Host "✓ Updated VITE_ALLOWED_HOSTS in frontend\.env" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Migration complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Restart ECTLogger: .\start.ps1"
Write-Host "  2. Access the application at: $newFrontendUrl"
Write-Host ""
