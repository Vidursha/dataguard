"""Print an access token for the "AI Agent" application, to connect an MCP client.

How to run it (venv active, from the project folder):
    python scripts\\get_agent_token.py

It also saves API Manager's self-signed gateway certificate to
wso2\\.state\\wso2-localhost.pem (git ignores it). MCP clients built on Node.js
can then trust it with NODE_EXTRA_CA_CERTS, so TLS checks can stay on.
Tokens last one hour. Run this again when the assistant gets a 401.
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
