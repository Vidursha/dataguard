"""Request logging for the DataGuard API and MCP server, without secrets.

Two layers, both configured through API Manager's own REST APIs (no change
to API Manager's configuration files):

1. Per-API log level BASIC (DevOps REST API, /api/am/devops/v0/tenant-logs).
   Every request, including ones the gateway rejects (401/403/429), is written
   to repository/logs/api.log with timestamp, method, path, status code, source
   IP and correlation ID. BASIC logs no headers and no bodies. (STANDARD would
   log all headers, i.e. the Authorization token and the gateway secret, and
   FULL also logs bodies, so neither is used.)

2. A custom response-flow operation policy, dataguardAuditLog (files in
   wso2/policies/), that writes one line per request that passed
   authentication to repository/logs/wso2carbon.log with correlation ID,
   method, path, status, application and user. It uses the Synapse log
   mediator's "custom" level, which logs only the named properties.

The correlation ID links the two: a line in api.log and the audit line for the
same request carry the same ID.
"""

from __future__ import annotations

import httpx

from common import MGMT_URL, PUBLISHER, ROOT, ApiError, Client, env, find_one, info, step

DEVOPS = f"{MGMT_URL}/api/am/devops/v0/tenant-logs/carbon.super/apis"
LOG_LEVEL = "BASIC"
POLICY_NAME = "dataguardAuditLog"
POLICY_VERSION = "v1"
POLICY_DIR = ROOT / "wso2" / "policies"


def ensure_audit_policy(client: Client, api_id: str) -> dict:
    """Upload the audit policy to the API if it isn't there yet; return its reference."""
    existing = client.get(f"{PUBLISHER}/apis/{api_id}/operation-policies", params={"limit": 100})["list"]
    policy = find_one(existing, name=POLICY_NAME, version=POLICY_VERSION)
    if policy:
        info(f"audit policy {POLICY_NAME} {POLICY_VERSION} already on the API")
    else:
        stem = f"{POLICY_NAME}_{POLICY_VERSION}"
        with open(POLICY_DIR / f"{stem}.json", "rb") as spec, open(POLICY_DIR / f"{stem}.j2", "rb") as definition:
            policy = client.post(f"{PUBLISHER}/apis/{api_id}/operation-policies", files={
                "policySpecFile": (f"{stem}.json", spec, "application/json"),
                "synapsePolicyDefinitionFile": (f"{stem}.j2", definition, "text/plain"),
            })
        info(f"audit policy {POLICY_NAME} {POLICY_VERSION} uploaded")
    return {"policyName": POLICY_NAME, "policyVersion": POLICY_VERSION, "policyId": policy["id"],
            "policyType": "api", "parameters": {}}


def set_log_level(api_id: str, label: str) -> None:
    values = env()
    auth = (values["WSO2_ADMIN_USERNAME"], values["WSO2_ADMIN_PASSWORD"])
    with httpx.Client(verify=False, timeout=30, auth=auth) as http:  # local self-signed cert only
        response = http.put(f"{DEVOPS}/{api_id}", json={"logLevel": LOG_LEVEL})
    if response.status_code != 200:
        raise ApiError(f"Setting the log level of {label} failed: {response.status_code} {response.text}")
    info(f"{label}: per-API log level {LOG_LEVEL} (api.log: method, path, status, time; no headers or bodies)")


def run(api_id: str, mcp_server_id: str) -> None:
    step("Request logging")
    set_log_level(api_id, "DataGuard Sales API")
    set_log_level(mcp_server_id, "DataGuard Sales MCP")
