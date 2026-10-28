"""Create or update, deploy and publish the DataGuard Sales API (Publisher REST API v4)."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import httpx

import audit
from common import (
    API_CONTEXT, API_DISPLAY_NAME, API_NAME, API_VERSION, BACKEND_URL, FRONTEND_ORIGIN,
    GATEWAY_SECRET_HEADER, MGMT_URL, PUBLISHER, ApiError, Client, env, find_one, info, step,
)

# OAuth2 Scope Management API of the Resident Key Manager (WSO2 Identity Server API).
KM_SCOPES = f"{MGMT_URL}/api/identity/oauth2/v1.0/scopes"

SCOPES = {
    "sales:read": ("Read sales data", "Aggregated sales, product and country figures.", ["analyst", "manager"]),
    "customer:read": ("Read customer data", "Per-customer order history (personal data).", ["manager"]),
}


def scope_for(target: str) -> str:
    return "customer:read" if target.startswith("/customers") else "sales:read"


def find_api(client: Client) -> dict | None:
    result = client.get(f"{PUBLISHER}/apis", params={"query": f"name:{API_NAME}", "limit": 50})
    return find_one(result["list"], name=API_NAME, version=API_VERSION)


def wso2_definition(spec_path: Path) -> bytes:
    """The backend's OpenAPI spec plus WSO2's own scope extensions.

    API Manager stores scopes and their role bindings inside the API
    definition (securitySchemes.default with x-scopes-bindings, plus a
    security entry per operation). Uploading a definition without them makes
    API Manager detach the scopes and delete them from the key manager, so
    they are always included here.
    """
    spec = copy.deepcopy(json.loads(spec_path.read_text(encoding="utf-8")))
    spec.setdefault("components", {})["securitySchemes"] = {
        "default": {
            "type": "oauth2",
            "flows": {"implicit": {
                "authorizationUrl": f"{MGMT_URL}/oauth2/authorize",
                "scopes": {name: description for name, (_, description, _) in SCOPES.items()},
                "x-scopes-bindings": {name: ",".join(roles) for name, (_, _, roles) in SCOPES.items()},
            }},
        }
    }
    for target, path in spec["paths"].items():
        for operation in path.values():
            operation["security"] = [{"default": [scope_for(target)]}]
            operation["x-auth-type"] = "Application & Application User"
            operation["x-throttling-tier"] = "Unlimited"
    return json.dumps(spec, indent=2).encode("utf-8")


def ensure_key_manager_scopes() -> None:
    """Make sure each scope exists in the key manager with the right role bindings.

    Token issuance checks these bindings. A scope missing from the key manager
    has no role check at all, so it would be granted to anyone who asks; this
    verifies the registration and repairs it if API Manager left it out.
    """
    values = env()
    auth = (values["WSO2_ADMIN_USERNAME"], values["WSO2_ADMIN_PASSWORD"])
    with httpx.Client(verify=False, timeout=30, auth=auth) as km:  # local self-signed cert only
        for name, (display, description, roles) in SCOPES.items():
            current = km.get(f"{KM_SCOPES}/name/{name}")
            body = {"displayName": display, "description": description, "bindings": roles}
            if current.status_code == 404:
                response = km.post(KM_SCOPES, json={"name": name, **body})
                action = "registered"
            elif current.status_code == 200 and sorted(current.json().get("bindings") or []) != sorted(roles):
                response = km.put(f"{KM_SCOPES}/name/{name}", json=body)
                action = "bindings repaired"
            elif current.status_code == 200:
                info(f"key manager scope {name}: bound to {', '.join(roles)}")
                continue
            else:
                raise ApiError(f"Reading scope {name} from the key manager failed: {current.status_code} {current.text}")
            if response.status_code not in (200, 201):
                raise ApiError(f"Key manager scope {name} {action} failed: {response.status_code} {response.text}")
            info(f"key manager scope {name}: {action} ({', '.join(roles)})")


def create_or_update(client: Client, spec_path: Path) -> str:
    spec = wso2_definition(spec_path)
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
    # Response policy: one audit line per request (see audit.py); never logs headers or bodies.
    api["apiPolicies"] = {
        "request": [{**header, "parameters": {"headerName": GATEWAY_SECRET_HEADER, "headerValue": secret}}],
        "response": [audit.ensure_audit_policy(client, api_id)],
        "fault": [],
    }
    api["policies"] = ["Unlimited"]
    client.put(f"{PUBLISHER}/apis/{api_id}", json=api)
    info("scopes sales:read (analyst, manager) and customer:read (manager) bound to operations")
    info(f"CORS limited to {FRONTEND_ORIGIN}; shared-secret header and audit-log policies attached")


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
    ensure_key_manager_scopes()
    deploy(client, f"{PUBLISHER}/apis/{api_id}", "API")
    publish(client, api_id)
    return api_id
