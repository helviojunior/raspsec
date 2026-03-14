import os
import yaml

DATA_DIR = "/app/data"


def load_config(filename, defaults=None):
    """Load a YAML config file from DATA_DIR. Returns defaults if file doesn't exist."""
    path = os.path.join(DATA_DIR, filename)
    if os.path.isfile(path):
        with open(path, "r") as f:
            return yaml.safe_load(f) or (defaults or {})
    return defaults or {}


def save_config(filename, data):
    """Save data as YAML to DATA_DIR."""
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
