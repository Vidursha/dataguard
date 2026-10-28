"""Set up everything DataGuard needs in WSO2 API Manager 4.6.0, in order.

Usage (API Manager running, venv active, from the project root):
    python wso2\\scripts\\setup_all.py

Every step checks what already exists and creates or updates it, so the script
is safe to run again at any time (for example after changing the backend API).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import api  # noqa: E402
import apps  # noqa: E402
import export_openapi  # noqa: E402
import mcp  # noqa: E402
import policies  # noqa: E402
import users  # noqa: E402
from common import AI_AGENT_APP, admin_client, env, step  # noqa: E402


def main() -> int:
    if len(env().get("GATEWAY_SHARED_SECRET", "")) < 32:
        sys.exit("GATEWAY_SHARED_SECRET is not set in .env. Run: python wso2\\scripts\\generate_env.py")
    print("Note: TLS verification is disabled for API Manager's self-signed certificate (local development only).")

    step("Export OpenAPI definition from the backend")
    spec = export_openapi.run()

    client = admin_client()
    users.run()
    policies.run(client)
    api_id = api.run(client, spec)
    app_ids = apps.run(client, api_id)
    mcp.run(client, api_id, app_ids[AI_AGENT_APP])

    step("Done")
    print("   Restart the backend if GATEWAY_SHARED_SECRET changed, then run scripts\\security_tests.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
