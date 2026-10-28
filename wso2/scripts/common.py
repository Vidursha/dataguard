"""Shared helpers for the WSO2 API Manager 4.6.0 setup scripts.

All calls use the product's official REST APIs:
  - Dynamic Client Registration  /client-registration/v0.17/register
  - Publisher REST API v4        /api/am/publisher/v4
  - Developer Portal REST API v3 /api/am/devportal/v3
  - Admin REST API v4            /api/am/admin/v4
  - RemoteUserStoreManagerService admin service (users and roles)

LOCAL DEVELOPMENT ONLY: API Manager ships with a self-signed certificate, so
TLS verification is turned off here. Never do this against a real server.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / ".env"

HOST = "localhost"
MGMT_URL = f"https://{HOST}:9443"
GATEWAY_URL = f"https://{HOST}:8243"
PUBLISHER = f"{MGMT_URL}/api/am/publisher/v4"
DEVPORTAL = f"{MGMT_URL}/api/am/devportal/v3"
ADMIN = f"{MGMT_URL}/api/am/admin/v4"
TOKEN_URL = f"{MGMT_URL}/oauth2/token"

# What we create. Kept in one place so every script and test agrees.
API_NAME = "DataGuardSalesAPI"
API_DISPLAY_NAME = "DataGuard Sales API"
API_CONTEXT = "/dataguard"
API_VERSION = "1.0.0"
BACKEND_URL = "http://127.0.0.1:8000"
FRONTEND_ORIGIN = "http://localhost:5173"
GATEWAY_SECRET_HEADER = "X-DataGuard-Gateway-Secret"

MCP_NAME = "DataGuardSalesMCP"
MCP_DISPLAY_NAME = "DataGuard Sales MCP"
MCP_CONTEXT = "/dataguard-mcp"
MCP_VERSION = "1.0.0"

AI_AGENT_OWNER = "ai-agent-svc"
DASHBOARD_APP = "Dashboard"
AI_AGENT_APP = "AI Agent"
DASHBOARD_POLICY = "DataGuardDashboard"
AI_AGENT_POLICY = "DataGuardAIAgent"

ADMIN_SCOPES = " ".join([
    "apim:admin", "apim:tier_view", "apim:tier_manage",
    "apim:api_view", "apim:api_create", "apim:api_manage", "apim:api_publish", "apim:api_delete",
    "apim:api_definition_view", "apim:common_operation_policy_view",
    "apim:mcp_server_view", "apim:mcp_server_create", "apim:mcp_server_manage", "apim:mcp_server_publish",
    "apim:subscribe", "apim:app_manage", "apim:sub_manage",
])


def env() -> dict[str, str]:
    if not ENV_FILE.exists():
        sys.exit("No .env file found. Run: python wso2\\scripts\\generate_env.py")
    values = {k: v or "" for k, v in dotenv_values(ENV_FILE).items()}
    values.update({k: v for k, v in os.environ.items() if k in values and v})
    return values


def update_env(updates: dict[str, str]) -> None:
    """Set keys in .env in place, keeping comments and order."""
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines()
    remaining = dict(updates)
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if "=" in line and not line.lstrip().startswith("#") and key in remaining:
            lines[i] = f"{key}={remaining.pop(key)}"
    lines += [f"{k}={v}" for k, v in remaining.items()]
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def step(message: str) -> None:
    print(f"\n== {message}")


def info(message: str) -> None:
    print(f"   {message}")


class ApiError(RuntimeError):
    pass


@dataclass
class Client:
    """Thin wrapper over httpx with an admin bearer token and readable errors."""

    http: httpx.Client

    def request(self, method: str, url: str, expected: tuple[int, ...] = (200, 201), **kwargs: Any) -> Any:
        response = self.http.request(method, url, **kwargs)
        if response.status_code not in expected:
            raise ApiError(f"{method} {url} -> {response.status_code}: {response.text[:800]}")
        if not response.content:
            return None
        return response.json() if "json" in response.headers.get("content-type", "") else response.text

    def get(self, url: str, **kw: Any) -> Any:
        return self.request("GET", url, **kw)

    def post(self, url: str, **kw: Any) -> Any:
        return self.request("POST", url, **kw)

    def put(self, url: str, **kw: Any) -> Any:
        return self.request("PUT", url, **kw)

    def delete(self, url: str, **kw: Any) -> Any:
        return self.request("DELETE", url, expected=(200, 204), **kw)


DEVPORTAL_SCOPES = "apim:subscribe apim:app_manage apim:sub_manage"


def admin_client() -> Client:
    values = env()
    return user_client(values["WSO2_ADMIN_USERNAME"], values["WSO2_ADMIN_PASSWORD"], ADMIN_SCOPES)


def user_client(username: str, password: str, scopes: str) -> Client:
    """Register (or re-use) a setup client via DCR and get a token for a user.

    DCR returns the same client for the same clientName, so re-runs do not
    pile up OAuth apps. The client is always registered with admin rights.
    """
    values = env()
    auth = (values["WSO2_ADMIN_USERNAME"], values["WSO2_ADMIN_PASSWORD"])
    http = httpx.Client(verify=False, timeout=60)  # local self-signed cert only
    try:
        reg = http.post(
            f"{MGMT_URL}/client-registration/v0.17/register",
            auth=auth,
            json={"clientName": "dataguard_setup", "owner": auth[0],
                  "grantType": "password refresh_token", "saasApp": True},
        )
    except httpx.ConnectError:
        sys.exit("Cannot reach API Manager on https://localhost:9443. Start it first (see README).")
    if reg.status_code not in (200, 201):
        raise ApiError(f"Client registration failed: {reg.status_code} {reg.text}")
    creds = reg.json()
    token = http.post(
        TOKEN_URL,
        auth=(creds["clientId"], creds["clientSecret"]),
        data={"grant_type": "password", "username": username, "password": password, "scope": scopes},
    )
    if token.status_code != 200:
        raise ApiError(f"Token request for {username} failed: {token.status_code} {token.text}")
    http.headers["Authorization"] = f"Bearer {token.json()['access_token']}"
    return Client(http)


def find_one(items: list[dict], **match: Any) -> dict | None:
    return next((i for i in items if all(i.get(k) == v for k, v in match.items())), None)
