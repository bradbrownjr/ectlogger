# ECTLogger Configuration Helper

Write-Host "🔧 ECTLogger Configuration Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env already exists
if (Test-Path "backend\.env") {
    Write-Host "⚠️  backend\.env already exists!" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to reconfigure it? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Configuration cancelled." -ForegroundColor Yellow
        exit
    }
}

# Copy template
Write-Host "Creating backend\.env from template..." -ForegroundColor Cyan
Copy-Item .env.example backend\.env

Write-Host ""
Write-Host "Let's configure your ECTLogger instance!" -ForegroundColor Green
Write-Host ""

# Generate secret key
Write-Host "Generating secure SECRET_KEY..." -ForegroundColor Cyan
$secretKey = python -c "import secrets; print(secrets.token_urlsafe(32))"
(Get-Content backend\.env) -replace 'SECRET_KEY=.*', "SECRET_KEY=$secretKey" | Set-Content backend\.env
Write-Host "✓ SECRET_KEY generated" -ForegroundColor Green

Write-Host ""
Write-Host "📧 Email Configuration (Required for authentication)" -ForegroundColor Cyan
Write-Host "---------------------------------------------------" -ForegroundColor Cyan

$smtpHost = Read-Host "SMTP Host (default: smtp.gmail.com)"
if ([string]::IsNullOrWhiteSpace($smtpHost)) { $smtpHost = "smtp.gmail.com" }

$smtpPort = Read-Host "SMTP Port (default: 587)"
if ([string]::IsNullOrWhiteSpace($smtpPort)) { $smtpPort = "587" }

$smtpUser = Read-Host "SMTP User (your email address)"
while ([string]::IsNullOrWhiteSpace($smtpUser)) {
    Write-Host "Email address is required!" -ForegroundColor Red
    $smtpUser = Read-Host "SMTP User (your email address)"
}

$smtpPassword = Read-Host "SMTP Password (App Password for Gmail)" -AsSecureString
$smtpPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($smtpPassword)
)
while ([string]::IsNullOrWhiteSpace($smtpPasswordText)) {
    Write-Host "Password is required!" -ForegroundColor Red
    $smtpPassword = Read-Host "SMTP Password" -AsSecureString
    $smtpPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($smtpPassword)
    )
}

$smtpFromEmail = Read-Host "From Email (default: noreply@ectlogger.com)"
if ([string]::IsNullOrWhiteSpace($smtpFromEmail)) { $smtpFromEmail = "noreply@ectlogger.com" }

# Update .env file
(Get-Content backend\.env) -replace 'SMTP_HOST=.*', "SMTP_HOST=$smtpHost" | Set-Content backend\.env
(Get-Content backend\.env) -replace 'SMTP_PORT=.*', "SMTP_PORT=$smtpPort" | Set-Content backend\.env
(Get-Content backend\.env) -replace 'SMTP_USER=.*', "SMTP_USER=$smtpUser" | Set-Content backend\.env
(Get-Content backend\.env) -replace 'SMTP_PASSWORD=.*', "SMTP_PASSWORD=$smtpPasswordText" | Set-Content backend\.env
(Get-Content backend\.env) -replace 'SMTP_FROM_EMAIL=.*', "SMTP_FROM_EMAIL=$smtpFromEmail" | Set-Content backend\.env

Write-Host ""
Write-Host "✓ Email configuration saved" -ForegroundColor Green

Write-Host ""
Write-Host "🔑 OAuth Configuration (Optional)" -ForegroundColor Cyan
Write-Host "-----------------------------------" -ForegroundColor Cyan
$configureOAuth = Read-Host "Do you want to configure OAuth providers now? (y/N)"

if ($configureOAuth -eq "y" -or $configureOAuth -eq "Y") {
    Write-Host ""
    Write-Host "Google OAuth:" -ForegroundColor Yellow
    $googleClientId = Read-Host "Google Client ID (press Enter to skip)"
    if (-not [string]::IsNullOrWhiteSpace($googleClientId)) {
        $googleSecret = Read-Host "Google Client Secret"
        (Get-Content backend\.env) -replace 'GOOGLE_CLIENT_ID=.*', "GOOGLE_CLIENT_ID=$googleClientId" | Set-Content backend\.env
        (Get-Content backend\.env) -replace 'GOOGLE_CLIENT_SECRET=.*', "GOOGLE_CLIENT_SECRET=$googleSecret" | Set-Content backend\.env
        Write-Host "✓ Google OAuth configured" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Microsoft OAuth:" -ForegroundColor Yellow
    $msClientId = Read-Host "Microsoft Client ID (press Enter to skip)"
    if (-not [string]::IsNullOrWhiteSpace($msClientId)) {
        $msSecret = Read-Host "Microsoft Client Secret"
        (Get-Content backend\.env) -replace 'MICROSOFT_CLIENT_ID=.*', "MICROSOFT_CLIENT_ID=$msClientId" | Set-Content backend\.env
        (Get-Content backend\.env) -replace 'MICROSOFT_CLIENT_SECRET=.*', "MICROSOFT_CLIENT_SECRET=$msSecret" | Set-Content backend\.env
        Write-Host "✓ Microsoft OAuth configured" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "GitHub OAuth:" -ForegroundColor Yellow
    $ghClientId = Read-Host "GitHub Client ID (press Enter to skip)"
    if (-not [string]::IsNullOrWhiteSpace($ghClientId)) {
        $ghSecret = Read-Host "GitHub Client Secret"
        (Get-Content backend\.env) -replace 'GITHUB_CLIENT_ID=.*', "GITHUB_CLIENT_ID=$ghClientId" | Set-Content backend\.env
        (Get-Content backend\.env) -replace 'GITHUB_CLIENT_SECRET=.*', "GITHUB_CLIENT_SECRET=$ghSecret" | Set-Content backend\.env
        Write-Host "✓ GitHub OAuth configured" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "💾 Database Configuration" -ForegroundColor Cyan
Write-Host "-------------------------" -ForegroundColor Cyan
$usePostgres = Read-Host "Use PostgreSQL instead of SQLite? (y/N)"

if ($usePostgres -eq "y" -or $usePostgres -eq "Y") {
    $dbUser = Read-Host "Database username"
    $dbPassword = Read-Host "Database password" -AsSecureString
    $dbPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword)
    )
    $dbHost = Read-Host "Database host (default: localhost)"
    if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = "localhost" }
    $dbName = Read-Host "Database name (default: ectlogger)"
    if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "ectlogger" }
    
    $dbUrl = "postgresql+asyncpg://${dbUser}:${dbPasswordText}@${dbHost}/${dbName}"
    (Get-Content backend\.env) -replace 'DATABASE_URL=.*', "DATABASE_URL=$dbUrl" | Set-Content backend\.env
    Write-Host "✓ PostgreSQL configured" -ForegroundColor Green
} else {
    Write-Host "✓ Using SQLite (default)" -ForegroundColor Green
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ Configuration Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Your settings have been saved to backend\.env" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run .\start.ps1 to start the application"
Write-Host "2. Open http://localhost:3000 in your browser"
Write-Host "3. Sign in with your email address"
Write-Host ""

if ($smtpHost -eq "smtp.gmail.com") {
    Write-Host "📧 Gmail Users:" -ForegroundColor Yellow
    Write-Host "   Make sure you're using an App Password, not your regular password!" -ForegroundColor Yellow
    Write-Host "   Generate one at: https://myaccount.google.com/apppasswords" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "Ready to start? Run: .\start.ps1" -ForegroundColor Green
