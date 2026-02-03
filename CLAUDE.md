# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TheBeacon is a Flask-based ticket dashboard that integrates with SuperOps' GraphQL API. It displays tickets in a 4-section layout with real-time auto-refresh, SLA tracking, and theme support. No database — all data is fetched from SuperOps on demand with TTL-based caching.

## Commands

```bash
# Setup
python3 -m venv pyenv
source pyenv/bin/activate
pip install -r requirements.txt
cp config.example.yaml config.yaml  # then edit with credentials

# Run (dev)
python run.py  # serves on http://localhost:5050

# Production (Ubuntu systemd)
sudo bash install-service.sh
sudo journalctl -u thebeacon -f    # logs
sudo systemctl status thebeacon    # status
```

## Architecture

### Backend (Flask, Python 3.8+)

- **`run.py`** — Entry point
- **`app/__init__.py`** — Flask app factory, routes, rate limiting (200/day, 60/hour), security headers
- **`app/superops_client.py`** — GraphQL client with paginated ticket fetching, TTL caching (tickets: 60s, technicians: 300s), concurrent conversation fetching (10 workers)
- **`app/ticket_mapper.py`** — Section assignment and SLA computation
- **`app/config_loader.py`** — YAML config parsing and validation

### Frontend (Vanilla JS + Jinja2 + CSS)

- **`app/templates/layout.html`** — Base template with sidebar, theme picker
- **`app/templates/index.html`** — Dashboard with 4-section ticket tables
- **`app/static/js/main.js`** — Dashboard logic: sorting, auto-refresh, agent filter, new ticket notifications
- **`app/static/js/theme.js`** — Dark/light toggle, color themes, easter eggs (matrix rain, bee animation, konami code)
- **`app/static/css/thebeacon.css`** — Design system with CSS custom properties, light/dark themes, color themes (violet, gold, matrix, bee)

### Routes

- `GET /` — Redirects to default view
- `GET /<view_slug>` — Dashboard HTML render
- `GET /api/tickets/<view_slug>?agent_id=<optional>&force_refresh=true` — JSON ticket API
- `GET /health` — Health check

### Ticket Section Routing (priority order)

1. **S3** — SLA violated tickets (checked first)
2. **S1** — Open/unresponded/unassigned tickets
3. **S2** — Customer replied or requester reply detected (via conversation API)
4. **S4** — Catch-all for remaining active tickets

### Configuration (`config.yaml`)

Key sections: `superops` (API credentials, cache TTL), `views` (multi-view with tech group filtering), `status_mapping` (maps SuperOps statuses to sections), `agents` (technician dropdown), `alert_thresholds` (warning/danger/critical/emergency ticket counts), `dashboard` (refresh interval, port, app name), `closed_statuses`.

### Caching Strategy

- **Server**: Ticket cache (60s TTL), technician cache (300s TTL), conversation cache (keyed on ticket_id + updated_at)
- **Client**: localStorage for theme preferences, in-memory for API data and sort state
- Auto-refresh bypasses server cache with `force_refresh=true`
