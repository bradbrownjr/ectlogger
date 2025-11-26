#!/bin/bash

# ECTLogger URL Migration Script
# Use this script to change the host address for your ECTLogger deployment
# without modifying other configuration settings.

echo "🔄 ECTLogger URL Migration Tool"
echo "================================="
echo ""

# Check if .env files exist
if [ ! -f "backend/.env" ]; then
    echo "✗ backend/.env not found!"
    echo "  Please run ./configure.sh first to set up the application."
    exit 1
fi

if [ ! -f "frontend/.env" ]; then
    echo "✗ frontend/.env not found!"
    echo "  Please run ./configure.sh first to set up the application."
    exit 1
fi

# Read current configuration
CURRENT_FRONTEND_URL=$(grep "^FRONTEND_URL=" backend/.env | cut -d'=' -f2-)
CURRENT_API_URL=$(grep "^VITE_API_URL=" frontend/.env | cut -d'=' -f2-)

echo "📋 Current Configuration:"
echo "  Frontend URL: $CURRENT_FRONTEND_URL"
echo "  API URL:      $CURRENT_API_URL"
echo ""

# Check for command line arguments
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --frontend-url URL   Set the frontend URL (where users access the app)"
    echo "  --api-url URL        Set the API URL (backend server address)"
    echo "  --host HOSTNAME      Set both URLs using the same hostname"
    echo "                       (Frontend: https://HOSTNAME, API: https://HOSTNAME/api)"
    echo "  --lan-ip IP          Set both URLs for LAN deployment"
    echo "                       (Frontend: http://IP:3000, API: http://IP:8000)"
    echo "  --help, -h           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --host ectbeta.lynwood.us"
    echo "  $0 --lan-ip 192.168.1.100"
    echo "  $0 --frontend-url https://ect.example.com --api-url https://ect.example.com/api"
    echo ""
    exit 0
fi

# Parse command line arguments
NEW_FRONTEND_URL=""
NEW_API_URL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --frontend-url)
            NEW_FRONTEND_URL="$2"
            shift 2
            ;;
        --api-url)
            NEW_API_URL="$2"
            shift 2
            ;;
        --host)
            # Production deployment with reverse proxy (same domain)
            HOST="$2"
            # Auto-detect protocol (assume https for production domains)
            if [[ "$HOST" == *"localhost"* ]] || [[ "$HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                NEW_FRONTEND_URL="http://$HOST"
                NEW_API_URL="http://$HOST/api"
            else
                NEW_FRONTEND_URL="https://$HOST"
                NEW_API_URL="https://$HOST/api"
            fi
            shift 2
            ;;
        --lan-ip)
            IP="$2"
            NEW_FRONTEND_URL="http://$IP:3000"
            NEW_API_URL="http://$IP:8000"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
done

# If no arguments provided, run interactive mode
if [ -z "$NEW_FRONTEND_URL" ] && [ -z "$NEW_API_URL" ]; then
    echo "🌐 Migration Options:"
    echo ""
    echo "1) Production with reverse proxy (same domain for frontend and API)"
    echo "   Example: https://ect.example.com"
    echo ""
    echo "2) LAN deployment (separate ports)"
    echo "   Example: http://192.168.1.100:3000 and http://192.168.1.100:8000"
    echo ""
    echo "3) Custom URLs (specify each separately)"
    echo ""
    echo "Choose option (1-3):"
    read -r choice
    echo ""

    case $choice in
        1)
            echo "Enter hostname (e.g., ect.example.com):"
            read -r host
            if [[ "$host" == *"localhost"* ]] || [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                NEW_FRONTEND_URL="http://$host"
                NEW_API_URL="http://$host/api"
            else
                NEW_FRONTEND_URL="https://$host"
                NEW_API_URL="https://$host/api"
            fi
            ;;
        2)
            echo "Enter LAN IP address (e.g., 192.168.1.100):"
            read -r ip
            NEW_FRONTEND_URL="http://$ip:3000"
            NEW_API_URL="http://$ip:8000"
            ;;
        3)
            echo "Enter Frontend URL (where users access the app):"
            read -r NEW_FRONTEND_URL
            echo "Enter API URL (backend server address):"
            read -r NEW_API_URL
            ;;
        *)
            echo "Invalid choice."
            exit 1
            ;;
    esac
fi

echo ""
echo "📝 New Configuration:"
echo "  Frontend URL: $NEW_FRONTEND_URL"
echo "  API URL:      $NEW_API_URL"
echo ""

# Confirm changes
echo "Apply these changes? (y/N)"
read -r confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Migration cancelled."
    exit 0
fi

echo ""
echo "🔧 Applying changes..."

# Update backend/.env
echo "  Updating backend/.env..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|^FRONTEND_URL=.*|FRONTEND_URL=$NEW_FRONTEND_URL|" backend/.env
else
    # Linux
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=$NEW_FRONTEND_URL|" backend/.env
fi
echo "    ✓ FRONTEND_URL updated"

# Update frontend/.env
echo "  Updating frontend/.env..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^VITE_API_URL=.*|VITE_API_URL=$NEW_API_URL|" frontend/.env
else
    sed -i "s|^VITE_API_URL=.*|VITE_API_URL=$NEW_API_URL|" frontend/.env
fi
echo "    ✓ VITE_API_URL updated"

# Extract hostname from frontend URL for allowed hosts
ALLOWED_HOST=$(echo "$NEW_FRONTEND_URL" | sed -E 's|^https?://||' | sed -E 's|:[0-9]+$||' | sed -E 's|/.*$||')

# Update or add VITE_ALLOWED_HOSTS
echo "  Updating VITE_ALLOWED_HOSTS..."
if grep -q "^VITE_ALLOWED_HOSTS=" frontend/.env; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^VITE_ALLOWED_HOSTS=.*|VITE_ALLOWED_HOSTS=$ALLOWED_HOST,localhost|" frontend/.env
    else
        sed -i "s|^VITE_ALLOWED_HOSTS=.*|VITE_ALLOWED_HOSTS=$ALLOWED_HOST,localhost|" frontend/.env
    fi
else
    echo "VITE_ALLOWED_HOSTS=$ALLOWED_HOST,localhost" >> frontend/.env
fi
echo "    ✓ VITE_ALLOWED_HOSTS updated ($ALLOWED_HOST)"

# Note: CORS origins are dynamically computed from FRONTEND_URL in main.py
# No additional changes needed for CORS

echo ""
echo "================================="
echo "✅ Migration Complete!"
echo "================================="
echo ""
echo "📋 Summary:"
echo "  Frontend URL: $NEW_FRONTEND_URL"
echo "  API URL:      $NEW_API_URL"
echo ""
echo "🔄 Next Steps:"
echo ""
echo "1. Rebuild the frontend to apply the new API URL:"
echo "   cd frontend && npm run build"
echo ""
echo "2. Restart the application:"
echo "   - If using systemd: sudo systemctl restart ectlogger"
echo "   - If running manually: Stop and run ./start.sh"
echo ""
echo "3. If using a reverse proxy (Nginx/Apache), update the server_name"
echo "   to match the new hostname. See PRODUCTION-DEPLOYMENT.md."
echo ""
echo "4. Update DNS records to point to your server's IP address."
echo ""

# Check if using reverse proxy setup
if [[ "$NEW_FRONTEND_URL" == https://* ]] && [[ "$NEW_API_URL" == */api ]]; then
    echo "⚠️  Production Deployment Detected"
    echo "   Make sure your reverse proxy is configured to:"
    echo "   - Serve frontend files at /"
    echo "   - Proxy /api/* requests to the backend (port 8000)"
    echo "   - Proxy /ws/* WebSocket requests to the backend"
    echo "   - Use valid SSL certificates for HTTPS"
    echo ""
fi
