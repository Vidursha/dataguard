"""Print an access token for the "AI Agent" application, for connecting an MCP client.

Usage (venv active, from the project root):
    python scripts\\get_agent_token.py

Also saves API Manager's self-signed gateway certificate to
wso2\\.state\\wso2-localhost.pem (git-ignored) so MCP clients built on Node.js
can trust it with NODE_EXTRA_CA_CERTS instead of disabling TLS checks.
Tokens last one hour; run this again when the assistant reports 401.
"""

from __future__ import annotations

import ssl
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from wso2_auth import ROOT, agent_token  # noqa: E402

MCP_URL = "https://localhost:8243/dataguard-mcp/1.0.0/mcp"


def main() -> int:
    cert_path = ROOT / "wso2" / ".state" / "wso2-localhost.pem"
    cert_path.parent.mkdir(parents=True, exist_ok=True)
    cert_path.write_text(ssl.get_server_certificate(("localhost", 8243)), encoding="ascii")

    token = agent_token("sales:read")
    expires = time.strftime("%H:%M", time.localtime(time.time() + int(token["expires_in"])))
    print(f"MCP endpoint : {MCP_URL}")
    print(f"Scopes       : {token['scope']}")
    print(f"Expires      : {expires} (in {int(token['expires_in']) // 60} minutes)")
    print(f"Certificate  : {cert_path}")
    print(f"\nAuthorization: Bearer {token['access_token']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
