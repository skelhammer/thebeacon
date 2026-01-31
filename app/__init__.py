import datetime
import logging
from flask import Flask, render_template, jsonify, redirect, request, abort
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from app.superops_client import SuperOpsClient
from app.ticket_mapper import (
    map_tickets_to_sections,
    filter_by_view,
    filter_by_agent,
)

logger = logging.getLogger(__name__)

# Module-level client reference (set during create_app)
_client = None
_config = None


def create_app(config):
    """Create and configure the Flask application.

    Args:
        config: Parsed config.yaml dictionary.

    Returns:
        Flask app instance.
    """
    global _client, _config
    _config = config

    app = Flask(__name__, static_folder='static')
    app.secret_key = 'thebeacon-standalone-key'

    # Logging
    log_level = config.get('dashboard', {}).get('log_level', 'INFO').upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format='%(asctime)s [%(name)s] %(levelname)s: %(message)s'
    )

    # Rate limiter
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["200 per day", "60 per hour"],
        storage_uri="memory://"
    )

    # Initialize SuperOps client
    _client = SuperOpsClient(config)

    # Context processor for templates
    dashboard_cfg = config.get('dashboard', {})
    company_name = dashboard_cfg.get('company_name', '')
    if company_name:
        app_name = f"The {company_name} Beacon"
    else:
        app_name = dashboard_cfg.get('app_name', 'The Beacon')

    @app.context_processor
    def inject_globals():
        return {
            'app_name': app_name,
            'app_version': '1.0.5',
        }

    # --- Helpers ---

    def _get_supported_views():
        """Get view slug -> {display_name, icon} mapping from config."""
        views = config.get('views', {})
        return {
            slug: {
                'display_name': v.get('display_name', slug),
                'icon': v.get('icon', 'ticket'),
            }
            for slug, v in views.items()
        }

    def _get_default_view():
        """Get the first configured view slug."""
        views = config.get('views', {})
        return next(iter(views), 'helpdesk')

    def _get_tickets_for_view(view_slug, agent_id=None, force_refresh=False):
        """Fetch, filter, and section tickets for a view.

        Returns:
            tuple: (s1, s2, s3, s4, agent_mapping, error)
        """
        views_config = config.get('views', {})
        view_config = views_config.get(view_slug)
        if not view_config:
            return [], [], [], [], {}, f"Unknown view: {view_slug}"

        try:
            # Fetch all tickets (force_refresh bypasses cache)
            all_tickets = _client.fetch_tickets(force=force_refresh)

            # Filter by view (tech group)
            view_tickets = filter_by_view(all_tickets, view_config, views_config)

            # Filter by agent if specified
            if agent_id:
                view_tickets = filter_by_agent(view_tickets, agent_id)

            # Map to 4 sections
            s1, s2, s3, s4 = map_tickets_to_sections(view_tickets, config)

            # Get agent mapping for dropdown
            agent_mapping = {}
            if config.get('agents', {}).get('auto_fetch', True):
                agent_mapping = _client.fetch_technicians()

            return s1, s2, s3, s4, agent_mapping, None
        except Exception as e:
            logger.error(f"Error getting tickets for view {view_slug}: {e}")
            return [], [], [], [], {}, str(e)

    def _build_ticket_url_template():
        """Get the ticket URL template from config."""
        return config.get('ticket_url_template', '')

    def _render_dashboard(view_slug, agent_id):
        """Render the dashboard template for a view."""
        supported_views = _get_supported_views()
        view_info = supported_views.get(view_slug, {})
        current_view_display = view_info.get('display_name', view_slug) if isinstance(view_info, dict) else view_slug

        s1, s2, s3, s4, agent_mapping, error = _get_tickets_for_view(
            view_slug, agent_id=agent_id
        )

        dashboard_time_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        refresh_ms = config.get('dashboard', {}).get('refresh_interval_seconds', 60) * 1000
        ticket_url_template = _build_ticket_url_template()
        thresholds = config.get('alert_thresholds', {})

        return render_template(
            'index.html',
            s1_items=s1,
            s2_items=s2,
            s3_items=s3,
            s4_items=s4,
            dashboard_generated_time_iso=dashboard_time_iso,
            auto_refresh_ms=refresh_ms,
            ticket_url_template=ticket_url_template,
            current_view_slug=view_slug,
            current_view_display=current_view_display,
            supported_views=supported_views,
            page_title_display=current_view_display,
            section1_name=f"Open {current_view_display} Tickets",
            section2_name="Customer Replied",
            section3_name="Needs Agent / Update Overdue",
            section4_name=f"Other Active {current_view_display} Tickets",
            agent_mapping=agent_mapping,
            selected_agent_id=agent_id,
            error_message=error,
            alert_thresholds=thresholds,
        )

    # --- Routes ---

    @app.route('/')
    @limiter.exempt
    def dashboard_default():
        """Redirect to default view."""
        return redirect(f'/{_get_default_view()}')

    @app.route('/<view_slug>')
    def dashboard_view(view_slug):
        """Main dashboard for a specific view."""
        supported = _get_supported_views()
        if view_slug not in supported:
            abort(404, description=f"Unknown view: {view_slug}")
        agent_id = request.args.get('agent_id', type=int)
        return _render_dashboard(view_slug, agent_id)

    @app.route('/api/tickets/<view_slug>')
    @limiter.limit("60 per minute")
    def api_tickets(view_slug):
        """JSON API for ticket data (used by auto-refresh)."""
        supported = _get_supported_views()
        if view_slug not in supported:
            return jsonify({"error": f"Unknown view: {view_slug}"}), 404

        agent_id = request.args.get('agent_id', type=int)
        current_view_display = supported[view_slug]['display_name']

        s1, s2, s3, s4, agent_mapping, error = _get_tickets_for_view(
            view_slug, agent_id=agent_id, force_refresh=True
        )

        return jsonify({
            's1_items': s1,
            's2_items': s2,
            's3_items': s3,
            's4_items': s4,
            'total_active_items': len(s1) + len(s2) + len(s3) + len(s4),
            'dashboard_generated_time_iso': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'view': current_view_display,
            'section1_name_js': f"Open {current_view_display} Tickets",
            'section2_name_js': "Customer Replied",
            'section3_name_js': "Needs Agent / Update Overdue",
            'section4_name_js': f"Other Active {current_view_display} Tickets",
            'agent_mapping': agent_mapping,
            'error': error,
        })

    @app.route('/health')
    @limiter.exempt
    def health():
        """Simple health check."""
        return jsonify({
            'status': 'healthy',
            'service': app_name,
            'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })

    return app
