"""Create or update, deploy and publish the DataGuard Sales API (Publisher REST API v4)."""

from __future__ import annotations

import json
from pathlib import Path

from common import (
    API_CONTEXT, API_DISPLAY_NAME, API_NAME, API_VERSION, BACKEND_URL, FRONTEND_ORIGIN,
    GATEWAY_SECRET_HEADER, PUBLISHER, Client, env, find_one, info, step,
)

SCOPES = {
    "sales:read": ("Read sales data", "Aggregated sales, product and country figures.", ["analyst", "manager"]),
    "customer:read": ("Read customer data", "Per-customer order history (personal data).", ["manager"]),
}


def scope_for(target: str) -> str:
    return "customer:read" if target.startswith("/customers") else "sales:read"


def find_api(client: Client) -> dict | None:
    result = client.get(f"{PUBLISHER}/apis", params={"query": f"name:{API_NAME}", "limit": 50})
    return find_one(result["list"], name=API_NAME, version=API_VERSION)


def create_or_update(client: Client, spec_path: Path) -> str:
    spec = spec_path.read_bytes()
    existing = find_api(client)
    if existing:
        api_id = existing["id"]
        client.put(f"{PUBLISHER}/apis/{api_id}/swagger",
                   files={"apiDefinition": (None, spec.decode("utf-8"))})
        info(f"API exists ({api_id}); OpenAPI definition updated")
        return api_id
    endpoint = {"url": BACKEND_URL}
    additional = {
        "name": API_NAME,
        "displayName": API_DISPLAY_NAME,
        "version": API_VERSION,
        "context": API_CONTEXT,
        "policies": ["Unlimited"],
        "endpointConfig": {"endpoint_type": "http", "production_endpoints": endpoint, "sandbox_endpoints": endpoint},
    }
    created = client.post(
        f"{PUBLISHER}/apis/import-openapi",
        files={"file": ("openapi.json", spec, "application/json"),
               "additionalProperties": (None, json.dumps(additional))},
    )
    info(f"API created from OpenAPI ({created['id']})")
    return created["id"]


def add_header_policy(client: Client) -> dict:
    policies = client.get(f"{PUBLISHER}/operation-policies", params={"limit": 200})["list"]
    policy = max((p for p in policies if p["name"] == "addHeader"), key=lambda p: p["version"])
    return {"policyName": policy["name"], "policyVersion": policy["version"], "policyId": policy["id"],
            "policyType": "common"}


def configure(client: Client, api_id: str) -> None:
    """Scopes, per-operation scope binding, CORS, endpoint and the secret header."""
    secret = env()["GATEWAY_SHARED_SECRET"]
    api = client.get(f"{PUBLISHER}/apis/{api_id}")
    endpoint = {"url": BACKEND_URL}
    api["endpointConfig"] = {"endpoint_type": "http", "production_endpoints": endpoint, "sandbox_endpoints": endpoint}
    api["scopes"] = [
        {"scope": {"name": name, "displayName": display, "description": description, "bindings": roles},
         "shared": False}
        for name, (display, description, roles) in SCOPES.items()
    ]
    for operation in api["operations"]:
        operation["scopes"] = [scope_for(operation["target"])]
        operation["authType"] = "Application & Application User"
        operation["throttlingPolicy"] = "Unlimited"
    api["corsConfiguration"] = {
        "corsConfigurationEnabled": True,
        "accessControlAllowOrigins": [FRONTEND_ORIGIN],
        "accessControlAllowCredentials": False,
        "accessControlAllowHeaders": ["authorization", "content-type"],
        "accessControlAllowMethods": ["GET", "OPTIONS"],
    }
    # API-level request policy: the gateway adds the shared secret on every backend call.
    header = add_header_policy(client)
    api["apiPolicies"] = {
        "request": [{**header, "parameters": {"headerName": GATEWAY_SECRET_HEADER, "headerValue": secret}}],
        "response": [],
        "fault": [],
    }
    api["policies"] = ["Unlimited"]
    client.put(f"{PUBLISHER}/apis/{api_id}", json=api)
    info("scopes sales:read (analyst, manager) and customer:read (manager) bound to operations")
    info(f"CORS limited to {FRONTEND_ORIGIN}; shared-secret header policy attached")


def deploy(client: Client, base: str, label: str) -> None:
    """Create a new revision and deploy it to the Default gateway.

    API Manager keeps at most 5 revisions, so the oldest undeployed ones are
    deleted first. Deploying replaces the previously deployed revision.
    """
    revisions = client.get(f"{base}/revisions")["list"]
    undeployed = [r for r in revisions if not r.get("deploymentInfo")]
    while len(revisions) >= 5 and undeployed:
        oldest = undeployed.pop(0)
        client.delete(f"{base}/revisions/{oldest['id']}")
        revisions.remove(oldest)
    revision = client.post(f"{base}/revisions", json={"description": "Deployed by DataGuard setup scripts"})
    client.post(f"{base}/deploy-revision", params={"revisionId": revision["id"]},
                json=[{"name": "Default", "vhost": "localhost", "displayOnDevportal": True}])
    info(f"{label}: {revision['displayName']} deployed to the Default gateway")


def publish(client: Client, api_id: str) -> None:
    api = client.get(f"{PUBLISHER}/apis/{api_id}")
    if api["lifeCycleStatus"] == "PUBLISHED":
        info("API already published")
        return
    client.post(f"{PUBLISHER}/apis/change-lifecycle", params={"apiId": api_id, "action": "Publish"})
    info("API published to the Developer Portal")


def run(client: Client, spec_path: Path) -> str:
    step("DataGuard Sales API")
    api_id = create_or_update(client, spec_path)
    configure(client, api_id)
    deploy(client, f"{PUBLISHER}/apis/{api_id}", "API")
    publish(client, api_id)
    return api_id
