import os
import yaml
import sys


def load_config(config_path=None):
    """Load and validate config.yaml.

    Args:
        config_path: Optional path to config file. Defaults to config.yaml
                     in the project root directory.

    Returns:
        dict: Validated configuration dictionary.

    Raises:
        SystemExit: If config file is missing or invalid.
    """
    if config_path is None:
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'config.yaml'
        )

    if not os.path.exists(config_path):
        print(f"ERROR: Configuration file not found: {config_path}")
        print("Copy config.example.yaml to config.yaml and fill in your SuperOps credentials.")
        sys.exit(1)

    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    if not config:
        print("ERROR: config.yaml is empty")
        sys.exit(1)

    _validate_config(config)
    return config


def _validate_config(config):
    """Validate required configuration sections and keys."""
    # Validate superops section
    superops = config.get('superops')
    if not superops:
        _exit_error("Missing 'superops' section in config.yaml")

    for key in ('api_url', 'api_key', 'customer_subdomain'):
        if not superops.get(key):
            _exit_error(f"Missing required superops.{key} in config.yaml")

    if superops.get('api_key', '').startswith('YOUR_'):
        _exit_error("superops.api_key still has placeholder value. Update config.yaml with your actual API key.")

    # Validate views
    views = config.get('views')
    if not views:
        _exit_error("Missing 'views' section in config.yaml")

    # Set defaults
    superops.setdefault('page_size', 100)
    superops.setdefault('cache_ttl_seconds', 60)

    config.setdefault('ticket_url_template', '')
    config.setdefault('closed_statuses', ['Resolved', 'Closed'])

    agents = config.setdefault('agents', {})
    agents.setdefault('auto_fetch', True)
    agents.setdefault('cache_ttl_seconds', 300)

    config.setdefault('status_mapping', {
        'open': {'statuses': ['Open'], 'include_no_first_response': True, 'include_unassigned': True},
        'customer_replied': {'statuses': ['Customer Reply']},
        'needs_agent': {'statuses': ['Pending'], 'include_sla_violated': True},
        'other_active': {'statuses': ['In Progress', 'On Hold']},
    })

    config.setdefault('alert_thresholds', {
        'calm': 50, 'good': 70, 'warning': 90, 'danger': 100, 'emergency': 110
    })

    dashboard = config.setdefault('dashboard', {})
    dashboard.setdefault('refresh_interval_seconds', 60)
    dashboard.setdefault('app_name', 'TheBeacon')
    dashboard.setdefault('port', 5050)


def _exit_error(message):
    print(f"CONFIG ERROR: {message}")
    sys.exit(1)
