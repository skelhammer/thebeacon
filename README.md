# The Beacon

Standalone ticket dashboard for [SuperOps](https://superops.com). Fetches tickets directly from the SuperOps GraphQL API and displays them in a 4-section layout with real-time auto-refresh.

No database required. No external service dependencies. Just a Flask app and your SuperOps API key.

## Features

- **4-section ticket layout** - Open, Customer Replied, Needs Agent/Overdue, Other Active
- **Multiple views** - Filter by tech group (Helpdesk, Pro Services, Tier 2, etc.)
- **Agent filtering** - Dropdown to filter tickets by assigned technician
- **Auto-refresh** - Synced to the clock, fires at the top of each minute (configurable interval)
- **Closed ticket counts** - "Closed Today" and "Closed This Week" metrics in the header
- **New ticket notification** - Audio ping when a new ticket appears in the Open section
- **Server-side caching** - TTL-based caching reduces API calls on page loads
- **SLA tracking** - First response due, SLA violations, friendly time displays
- **Sortable columns** - Click any column header to sort
- **Dark/light mode** - Toggle with persistent localStorage preference
- **Color themes** - Violet and MSP Gold (plus hidden easter egg themes)
- **Collapsible sidebar** - Hamburger menu toggle
- **Alert thresholds** - Visual warnings when ticket count gets high (sirens at emergency level)
- **Kiosk/TV mode** - Full-width layout with hidden controls, ideal for wall-mounted displays
- **Auto-dim** - Dims the screen outside business hours with configurable schedule
- **Easter eggs** - There may be secrets hidden in the dashboard...

## Quick Start

### Linux / macOS

```bash
git clone https://github.com/skelhammer/thebeacon.git
cd thebeacon
python3 -m venv pyenv
source pyenv/bin/activate
pip install -r requirements.txt
cp config.example.yaml config.yaml
# Edit config.yaml with your SuperOps API key and settings
python run.py
```

### Windows

```powershell
git clone https://github.com/skelhammer/thebeacon.git
cd thebeacon
python -m venv pyenv
pyenv\Scripts\activate
pip install -r requirements.txt
copy config.example.yaml config.yaml
# Edit config.yaml with your SuperOps API key and settings
python run.py
```

Open `http://localhost:5050` in your browser.

## Configuration

Copy `config.example.yaml` to `config.yaml` and fill in your details:

### SuperOps Credentials

```yaml
superops:
  api_url: "https://api.superops.ai/msp"       # US data center
  # api_url: "https://euapi.superops.ai/msp"    # EU data center
  api_key: "YOUR_API_KEY"
  customer_subdomain: "yourcompany"
  page_size: 100
  cache_ttl_seconds: 60
  closed_counts_cache_ttl_seconds: 300
```

Generate your API key in SuperOps: **Settings > My Profile > API Token**.

### Ticket URL Template

Links ticket IDs to your SuperOps helpdesk:

```yaml
ticket_url_template: "https://helpdesk.yourcompany.com/#/tickets/{ticket_id}/ticket"
```

### Views

Each view filters tickets by tech group. The first view with empty `tech_group_ids` acts as a catch-all for tickets not in other views.

```yaml
views:
  helpdesk:
    display_name: "Helpdesk"
    tech_group_ids: []              # Catch-all
  pro-services:
    display_name: "Pro Services"
    tech_group_ids:
      - "8638213111270563840"       # SuperOps tech group ID
```

To find your tech group IDs, check the API response or use the SuperOps GraphQL query `getTechnicianGroupList`.

### Status Mapping

Maps SuperOps ticket statuses to the 4 dashboard sections. Sections are checked in priority order: S3 first, then S1, S2, S4.

```yaml
status_mapping:
  open:
    statuses: ["Open"]
    include_no_first_response: true   # Unresponded tickets go here
    include_unassigned: true          # Unassigned tickets go here
  customer_replied:
    statuses: ["Customer Replied"]
  needs_agent:
    statuses: ["Under Investigation"]
    include_sla_violated: true        # SLA-violated tickets go here
  other_active:
    statuses: ["Waiting on Customer", "Scheduled", "On Hold"]
```

### Alert Thresholds

Visual indicators on the total ticket count. Calm/good are positive states (green), warning+ are negative:

```yaml
alert_thresholds:
  calm: 50        # Green glow
  good: 70        # Green
  warning: 90     # Yellow
  danger: 100     # Orange
  emergency: 110  # Red + sirens
```

### Auto-Dim (TV Mode)

Dims the screen outside business hours. Supports `HH:MM` format or plain hours:

```yaml
auto_dim:
  enabled: true
  dim_start: "17:05"       # 5:05 PM — screen dims
  wake: "8:00"             # 8:00 AM — screen wakes
  dim_weekends: true       # Stay dimmed all day Saturday & Sunday
  brightness_percent: 15   # How bright when dimmed (0 = black, 100 = full)
```

## Kiosk / TV Mode

For wall-mounted displays, add `?kiosk` to the URL:

```
http://yourserver:5050/helpdesk?kiosk
```

This hides the sidebar, agent filter, and header title. Content stretches full-width. A floating theme picker appears in the bottom-left corner on hover.

You can also click the **Kiosk Mode** button in the sidebar footer to enter kiosk mode, and use the exit button in the floating dock to leave.

## Project Structure

```
thebeacon/
├── run.py                  # Flask entry point
├── config.yaml             # Your config (gitignored)
├── config.example.yaml     # Template config
├── requirements.txt        # Python dependencies
├── install-service.sh      # Systemd service installer
├── app/
│   ├── __init__.py         # Flask app factory + routes
│   ├── superops_client.py  # GraphQL client with TTL caching
│   ├── ticket_mapper.py    # Section assignment + SLA computation
│   ├── config_loader.py    # YAML config loader
│   ├── static/
│   │   ├── css/thebeacon.css
│   │   └── js/
│   │       ├── main.js     # Dashboard logic, auto-dim, celebrations
│   │       └── theme.js    # Theme toggle + easter eggs + debug panel
│   └── templates/
│       ├── layout.html     # Base template with sidebar + kiosk dock
│       └── index.html      # Dashboard with 4 sections
```

## API Usage

The server caches ticket data with a configurable TTL (`cache_ttl_seconds`, default 60s) and technician data with a separate TTL (default 300s).

- **Page loads** serve from cache, so multiple users opening the dashboard don't trigger extra API calls.
- **Auto-refresh** bypasses the cache to ensure fresh data, including closed ticket counts.

For a single viewer, expect roughly **1 ticket API call per refresh interval** and **1 technician API call every 5 minutes**. Additional viewers sharing the same tab/page load add minimal overhead, but each separate tab with auto-refresh will make its own calls.

## Install as a Service (Ubuntu)

To run TheBeacon as an auto-starting systemd service on an Ubuntu server:

```bash
sudo bash install-service.sh
```

The script will prompt for the install path and service user, set up the virtualenv if needed, and create + enable a systemd service.

Useful commands after install:

```bash
sudo systemctl status thebeacon      # Check status
sudo journalctl -u thebeacon -f      # Follow logs
sudo systemctl restart thebeacon     # Restart
sudo systemctl stop thebeacon        # Stop
```

To uninstall:

```bash
sudo rm /etc/systemd/system/thebeacon.service
sudo systemctl daemon-reload
```

## Requirements

- Python 3.8+
- SuperOps MSP account with API access
