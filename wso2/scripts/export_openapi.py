"""Export the FastAPI OpenAPI definition to wso2/openapi.json.

The spec doesn't depend on the database or the secret, so dummy settings are
fine and nothing has to be running.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.app.config import Settings  # noqa: E402
from backend.app.main import build_openapi, create_app  # noqa: E402

TARGET = ROOT / "wso2" / "openapi.json"


def run() -> Path:
    app = create_app(Settings(database_path=ROOT / "data" / "dataguard.db", gateway_secret="spec-export-only" * 3))
    spec = build_openapi(app)
    TARGET.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    print(f"   exported {len(spec['paths'])} paths to {TARGET.relative_to(ROOT)}")
    return TARGET


if __name__ == "__main__":
    run()
