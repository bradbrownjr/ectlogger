#!/bin/bash

# ECTLogger Systemd Service Installation Script
# This script installs ECTLogger as a systemd service

echo "🔧 ECTLogger Service Installation"
echo "================================="
echo ""

# Check if running on Linux with systemd
if ! command -v systemctl &> /dev/null; then
    echo "❌ systemctl not found. This script requires systemd."
    echo "   Use ./start.sh to run the application manually."
    exit 1
fi

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "⚠️  Please do not run as root. Run with sudo when prompted."
   exit 1
fi

# Get current directory
INSTALL_DIR=$(pwd)
CURRENT_USER=$(whoami)

echo "📍 Installation directory: $INSTALL_DIR"
echo "👤 Service will run as: $CURRENT_USER"
echo ""

# Check if dependencies are installed
if [ ! -d "backend/venv" ]; then
    echo "⚠️  Backend virtual environment not found."
    echo "   Please run ./install.sh first."
    exit 1
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "⚠️  Frontend dependencies not found."
    echo "   Please run ./install.sh first."
    exit 1
fi

# Create service file from template
SERVICE_FILE="/tmp/ectlogger.service"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=ECTLogger - ECT/SKYWARN Net Logger
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
Group=$CURRENT_USER
WorkingDirectory=$INSTALL_DIR
Environment="PATH=$INSTALL_DIR/backend/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="NODE_PATH=$INSTALL_DIR/frontend/node_modules"
ExecStart=/bin/bash $INSTALL_DIR/start.sh --service
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "📝 Installing systemd service..."

# Copy service file to systemd directory
sudo cp "$SERVICE_FILE" /etc/systemd/system/ectlogger.service

# Set permissions
sudo chmod 644 /etc/systemd/system/ectlogger.service

# Reload systemd
sudo systemctl daemon-reload

echo "✓ Service installed"
echo ""

# Ask if user wants to enable on boot
read -p "Enable ECTLogger to start on boot? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo systemctl enable ectlogger
    echo "✓ Service enabled for auto-start on boot"
else
    echo "ℹ️  Service not enabled. Run 'sudo systemctl enable ectlogger' to enable."
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "Service commands:"
echo "  Start:   sudo systemctl start ectlogger"
echo "  Stop:    sudo systemctl stop ectlogger"
echo "  Restart: sudo systemctl restart ectlogger"
echo "  Status:  sudo systemctl status ectlogger"
echo "  Logs:    sudo journalctl -u ectlogger -f"
echo ""
echo "To uninstall the service:"
echo "  sudo systemctl stop ectlogger"
echo "  sudo systemctl disable ectlogger"
echo "  sudo rm /etc/systemd/system/ectlogger.service"
echo "  sudo systemctl daemon-reload"
echo ""
