#!/usr/bin/env bash
set -euo pipefail

# TheBeacon systemd service installer
# Run with: sudo bash install-service.sh

if [ "$(id -u)" -ne 0 ]; then
    echo "Error: This script must be run as root (use sudo)."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== TheBeacon Service Installer ==="
echo ""
echo "Detected project directory: $SCRIPT_DIR"
read -rp "Install from this path? [Y/n]: " use_detected
if [[ "${use_detected,,}" == "n" ]]; then
    read -rp "Enter the full path to the thebeacon directory: " SCRIPT_DIR
fi

if [ ! -f "$SCRIPT_DIR/run.py" ]; then
    echo "Error: run.py not found in $SCRIPT_DIR"
    exit 1
fi

# Determine the user to run as
read -rp "Which user should the service run as? [$(logname)]: " SVC_USER
SVC_USER="${SVC_USER:-$(logname)}"

if ! id "$SVC_USER" &>/dev/null; then
    echo "Error: User '$SVC_USER' does not exist."
    exit 1
fi

SVC_GROUP="$(id -gn "$SVC_USER")"

# Check for virtualenv
PYTHON="$SCRIPT_DIR/pyenv/bin/python"
if [ ! -f "$PYTHON" ]; then
    echo "Virtual environment not found at $SCRIPT_DIR/pyenv"
    echo "Creating virtual environment and installing dependencies..."
    python3 -m venv "$SCRIPT_DIR/pyenv"
    "$SCRIPT_DIR/pyenv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"
fi

# Write the systemd unit file
SERVICE_FILE="/etc/systemd/system/thebeacon.service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=TheBeacon Dashboard
After=network.target

[Service]
Type=simple
User=$SVC_USER
Group=$SVC_GROUP
WorkingDirectory=$SCRIPT_DIR
ExecStart=$SCRIPT_DIR/pyenv/bin/python $SCRIPT_DIR/run.py
Restart=on-failure
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "Service file written to $SERVICE_FILE"

# Reload and enable
systemctl daemon-reload
systemctl enable thebeacon.service
systemctl start thebeacon.service

echo ""
echo "=== Done ==="
echo ""
echo "  Status:   sudo systemctl status thebeacon"
echo "  Logs:     sudo journalctl -u thebeacon -f"
echo "  Stop:     sudo systemctl stop thebeacon"
echo "  Restart:  sudo systemctl restart thebeacon"
echo "  Disable:  sudo systemctl disable thebeacon"
echo "  Uninstall: sudo rm $SERVICE_FILE && sudo systemctl daemon-reload"
echo ""
systemctl status thebeacon --no-pager
