# TheBeacon

Standalone ticket dashboard for [SuperOps](https://superops.com). Fetches tickets directly from the SuperOps GraphQL API and displays them in a 4-section layout with real-time auto-refresh.

No database required. No external service dependencies. Just a Flask app and your SuperOps API key.

## Features

- **4-section ticket layout** - Open, Customer Replied, Needs Agent/Overdue, Other Active
- **Multiple views** - Filter by tech group (Helpdesk, Pro Services, Tier 2, etc.)
- **Agent filtering** - Dropdown to filter tickets by assigned technician
- **Auto-refresh** - Polls for updates every 60 seconds (configurable)
- **Server-side caching** - Single API call per refresh interval regardless of viewer count
- **SLA tracking** - First response due, SLA violations, friendly time displays
- **Sortable columns** - Click any column header to sort
- **Ticket detail modal** - Click a ticket subject for details
- **Dark/light mode** - Toggle with persistent localStorage preference
- **4 color themes** - Violet, MSP Gold, Matrix rain, and Bee easter eggs
- **Collapsible sidebar** - Hamburger menu toggle
- **Alert thresholds** - Visual warnings when ticket count gets high (sirens at emergency level)

## Quick Start

```bash
# Clone
git clone https://github.com/skelhammer/thebeacon.git
cd thebeacon

# Set up Python environment
python3 -m venv pyenv
source pyenv/bin/activate
pip install -r requirements.txt

# Configure
cp config.example.yaml config.yaml
# Edit config.yaml with your SuperOps API key and settings

# Run
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

Visual warnings on the total ticket count:

```yaml
alert_thresholds:
  warning: 90       # Yellow
  danger: 100       # Orange
  critical: 110     # Red
  emergency: 120    # Red + sirens
```

## Project Structure

```
thebeacon/
├── run.py                  # Flask entry point
├── config.yaml             # Your config (gitignored)
├── config.example.yaml     # Template config
├── requirements.txt        # Python dependencies
├── app/
│   ├── __init__.py         # Flask app factory + routes
│   ├── superops_client.py  # GraphQL client with TTL caching
│   ├── ticket_mapper.py    # Section assignment + SLA computation
│   ├── config_loader.py    # YAML config loader
│   ├── static/
│   │   ├── css/thebeacon.css
│   │   └── js/
│   │       ├── main.js     # Dashboard logic
│   │       └── theme.js    # Theme toggle + easter eggs
│   └── templates/
│       ├── layout.html     # Base template with sidebar
│       └── index.html      # Dashboard with 4 sections
```

## API Usage

The server makes approximately:
- **1 ticket API call per minute** (configurable via `cache_ttl_seconds`)
- **1 technician API call every 5 minutes**

Multiple browser tabs/users share the same server-side cache. 10 people viewing the dashboard = still just 1 API call per minute.

## Requirements

- Python 3.8+
- SuperOps MSP account with API access
