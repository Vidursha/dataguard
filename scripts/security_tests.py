"""Live security tests against the running DataGuard system.

API Manager and the backend must be running, and the setup scripts must have run.
How to run it (venv active, from the project folder):
    python scripts\\security_tests.py            # table in the console
    python scripts\\security_tests.py --markdown # table for the README

Every check uses real tokens from WSO2 (people sign in through the login page
with PKCE, the AI agent uses client credentials) and makes real HTTP calls.
It exits with code 0 only if every check passes.

LOCAL USE ONLY: TLS checks are turned off because API Manager uses a
self-signed certificate.
"""

from __future__ import annotations

import os
import re
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from wso2_auth import agent_token, decode_jwt, settings, user_token  # noqa: E402

GATEWAY = "https://localhost:8243"
API = f"{GATEWAY}/dataguard/1.0.0"
MCP = f"{GATEWAY}/dataguard-mcp/1.0.0/mcp"
BACKEND = "http://127.0.0.1:8000"
FRONTEND_ORIGIN = "http://localhost:5173"
UNKNOWN_ORIGIN = "https://evil.example"
ALLOWED_TOOLS = {"getSalesSummary", "getMonthlySales", "getRevenueByCountry", "getTopProducts"}
LOG_DIR = Path(os.environ.get("WSO2_HOME", r"C:\wso2am-4.6.0")) / "repository" / "logs"
API_LOG = LOG_DIR / "api.log"            # per-API log (level BASIC)
CARBON_LOG = LOG_DIR / "wso2carbon.log"  # the DATAGUARD_AUDIT lines end up here

http = httpx.Client(verify=False, timeout=30)  # fine here: local self-signed cert


@dataclass
class Result:
    name: str
    expected: str
    actual: str
    passed: bool


def get(url: str, token: str | None = None, **headers: str) -> httpx.Response:
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return http.get(url, headers=headers)


def check_no_token() -> Result:
    status = get(f"{API}/sales/summary").status_code
    return Result("No token -> rejected", "401", str(status), status == 401)


def check_analyst_customer(tokens: dict) -> Result:
    response = get(f"{API}/customers/12347/summary", tokens["analyst"])
    code = response.json().get("code", "") if response.status_code == 403 else ""
    return Result("Analyst token on /customers/{id}/summary", "403 (scope check)",
                  f"{response.status_code} {code}".strip(), response.status_code == 403)


def check_manager_customer(tokens: dict) -> Result:
    response = get(f"{API}/customers/12347/summary", tokens["manager"])
    ok = response.status_code == 200 and response.json().get("customer_id") == 12347
    return Result("Manager token on /customers/{id}/summary", "200 with data", str(response.status_code), ok)


def check_analyst_sales(tokens: dict) -> Result:
    response = get(f"{API}/sales/summary", tokens["analyst"])
    ok = response.status_code == 200 and response.json().get("orders", 0) > 0
    return Result("Analyst token on /sales/summary", "200 with data", str(response.status_code), ok)


def check_agent_scopes(tokens: dict) -> Result:
    scopes = set(decode_jwt(tokens["agent"]).get("scope", "").split())
    ok = "customer:read" not in scopes and "sales:read" in scopes
    return Result("AI Agent asks for customer:read", "only sales:read granted", " ".join(sorted(scopes)), ok)


def check_direct_backend() -> Result:
    try:
        no_secret = http.get(f"{BACKEND}/sales/summary").status_code
        wrong = http.get(f"{BACKEND}/sales/summary", headers={"X-DataGuard-Gateway-Secret": "guess"}).status_code
    except httpx.ConnectError:
        return Result("Direct backend call without the secret", "403", "backend not running", False)
    return Result("Direct backend call without the secret", "403 (and 403 with a wrong one)",
                  f"{no_secret} / {wrong}", no_secret == 403 and wrong == 403)


def preflight(origin: str) -> str:
    response = http.options(f"{API}/sales/summary", headers={
        "Origin": origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization",
    })
    return response.headers.get("access-control-allow-origin", "")


def check_cors_allowed() -> Result:
    allowed = preflight(FRONTEND_ORIGIN)
    return Result("CORS preflight from the dashboard origin", f"allowed ({FRONTEND_ORIGIN})",
                  allowed or "(none)", allowed == FRONTEND_ORIGIN)


def check_cors_blocked() -> Result:
    allowed = preflight(UNKNOWN_ORIGIN)
    ok = allowed not in (UNKNOWN_ORIGIN, "*")
    return Result("CORS preflight from an unknown origin", "blocked (origin not echoed)", allowed or "(none)", ok)


def check_mcp_tools(tokens: dict) -> Result:
    headers = {"Authorization": f"Bearer {tokens['agent']}", "Accept": "application/json, text/event-stream"}
    init = http.post(MCP, headers=headers, json={
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "security-tests", "version": "1"}},
    })
    if init.status_code != 200:
        return Result("MCP server lists only allowed tools", "4 sales/product/country tools", f"HTTP {init.status_code}", False)
    session = init.headers.get("mcp-session-id")
    if session:
        headers["mcp-session-id"] = session
    listed = http.post(MCP, headers=headers, json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    tools = {t["name"] for t in listed.json().get("result", {}).get("tools", [])}
    ok = tools == ALLOWED_TOOLS and not any("customer" in t.lower() for t in tools)
    return Result("MCP server lists only allowed tools", "4 tools, no customer tool", ", ".join(sorted(tools)), ok)


def log_size(path: Path) -> int:
    return path.stat().st_size if path.exists() else 0


def read_new(path: Path, offset: int) -> str:
    """The log text written after `offset` (the file size when this run started)."""
    if not path.exists():
        return ""
    with path.open("rb") as handle:
        handle.seek(offset if log_size(path) >= offset else 0)  # the file may have been rotated and started again
        return handle.read().decode("utf-8", errors="replace")


AUDIT_LINE = re.compile(
    r"DATAGUARD_AUDIT = v1, correlationId = [0-9a-f-]{36}, method = GET, "
    r"path = /dataguard/1\.0\.0/customers/12347/summary, status = 200, application = Dashboard, user = \S+"
)
BASIC_403 = re.compile(r'"verb":"GET".*"apiTo":"/dataguard/1\.0\.0/customers/12347/summary".*"statusCode":403')


def check_logging(offsets: dict) -> Result:
    """The manager's lookup should have an audit line, and the analyst's 403 should be in api.log."""
    deadline = time.time() + 20  # the gateway writes its logs a little later, so keep checking for a while
    while True:
        audit_ok = bool(AUDIT_LINE.search(read_new(CARBON_LOG, offsets["carbon"])))
        basic_ok = bool(BASIC_403.search(read_new(API_LOG, offsets["api"])))
        if (audit_ok and basic_ok) or time.time() > deadline:
            break
        time.sleep(1)
    actual = f"audit line: {'yes' if audit_ok else 'no'}; 403 in api.log: {'yes' if basic_ok else 'no'}"
    return Result("Gateway logs record method, path, status, app, user", "both present", actual, audit_ok and basic_ok)


def check_logs_clean(offsets: dict, tokens: dict, secret: str) -> Result:
    """Neither log may contain the gateway secret (whole file) or the tokens from this run."""
    findings = []
    for name, path in (("api.log", API_LOG), ("wso2carbon.log", CARBON_LOG)):
        if not path.exists():
            return Result("Logs contain no secret or tokens", "none found", f"{name} not found in {LOG_DIR}", False)
        whole = path.read_text(encoding="utf-8", errors="replace")
        if secret and secret in whole:
            findings.append(f"secret in {name}")
        new = read_new(path, offsets["api" if path == API_LOG else "carbon"])
        findings += [f"{who} token in {name}" for who, token in tokens.items() if token in new]
        if re.search(r"Authorization=|X-DataGuard-Gateway-Secret=", new):
            findings.append(f"header dump in {name}")
    return Result("Logs contain no secret or tokens", "none found", ", ".join(findings) or "none found", not findings)


def check_agent_burst(tokens: dict) -> Result:
    statuses = []
    for _ in range(25):
        status = get(f"{API}/products/top?limit=1", tokens["agent"]).status_code
        statuses.append(status)
        if status == 429:
            break
    served = statuses.count(200)
    return Result("Burst of requests from the AI Agent app", "429 after the 10/min limit",
                  f"429 after {served} OK" if 429 in statuses else f"no 429 in {len(statuses)} calls", 429 in statuses)


def run() -> list[Result]:
    values = settings()
    offsets = {"api": log_size(API_LOG), "carbon": log_size(CARBON_LOG)}
    print("Getting real tokens from WSO2 (PKCE sign-in for analyst1 and manager1, client credentials for AI Agent)...")
    tokens = {
        "analyst": user_token("analyst1", values["ANALYST1_PASSWORD"])["access_token"],
        "manager": user_token("manager1", values["MANAGER1_PASSWORD"])["access_token"],
        "agent": agent_token()["access_token"],
    }
    checks: list[Callable[[], Result]] = [
        check_no_token,
        lambda: check_analyst_customer(tokens),
        lambda: check_manager_customer(tokens),
        lambda: check_analyst_sales(tokens),
        lambda: check_agent_scopes(tokens),
        check_direct_backend,
        check_cors_allowed,
        check_cors_blocked,
        lambda: check_mcp_tools(tokens),
        lambda: check_logging(offsets),
        lambda: check_logs_clean(offsets, tokens, values.get("GATEWAY_SHARED_SECRET", "")),
        lambda: check_agent_burst(tokens),  # keep this last: it uses up the agent's limit for a minute
    ]
    results = []
    for check in checks:
        try:
            results.append(check())
        except Exception as error:  # show the error instead of crashing, so one broken check doesn't hide the rest
            results.append(Result(check.__name__, "-", f"error: {error}", False))
    return results


def print_table(results: list[Result], markdown: bool) -> None:
    rows = [(r.name, r.expected, r.actual, "PASS" if r.passed else "FAIL") for r in results]
    header = ("Check", "Expected", "Actual", "Result")
    if markdown:
        print("| " + " | ".join(header) + " |")
        print("|" + "|".join("---" for _ in header) + "|")
        for row in rows:
            print("| " + " | ".join(row) + " |")
        return
    widths = [max(len(str(x)) for x in col) for col in zip(header, *rows)]
    line = "+-" + "-+-".join("-" * w for w in widths) + "-+"
    print(line)
    print("| " + " | ".join(h.ljust(w) for h, w in zip(header, widths)) + " |")
    print(line)
    for row in rows:
        print("| " + " | ".join(str(c).ljust(w) for c, w in zip(row, widths)) + " |")
    print(line)


def main() -> int:
    results = run()
    print_table(results, markdown="--markdown" in sys.argv)
    failed = [r for r in results if not r.passed]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
