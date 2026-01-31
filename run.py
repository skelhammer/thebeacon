from dotenv import load_dotenv
from pathlib import Path

load_dotenv('.flaskenv')

from app import create_app
from app.config_loader import load_config

config = load_config()
app = create_app(config)

if __name__ == "__main__":
    port = config.get('dashboard', {}).get('port', 5050)
    debug = config.get('dashboard', {}).get('debug', False)
    host = '127.0.0.1' if debug else '0.0.0.0'

    extra_files = []
    if debug:
        templates_dir = Path('app/templates')
        if templates_dir.exists():
            for f in templates_dir.rglob('*.html'):
                extra_files.append(str(f))
        app_dir = Path('app')
        if app_dir.exists():
            for f in app_dir.rglob('*.py'):
                extra_files.append(str(f))

    app.run(
        host=host,
        port=port,
        debug=debug,
        extra_files=extra_files if extra_files else None
    )
