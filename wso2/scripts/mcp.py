"""MCP server for AI assistants, built from the DataGuard Sales API (Publisher REST API v4).

API Manager 4.6.0 can turn the operations of an existing API into MCP tools
(POST /mcp-servers/generate-from-api). The tool names come from the OpenAPI
operationIds and the tool descriptions come from the operation descriptions.
Only the sales, product and country operations become tools. The customer
endpoint is left out on purpose, so an AI assistant has no way to ask for
personal data.
"""

from __future__ import annotations

from common import (
    AI_AGENT_APP, GATEWAY_URL, MCP_CONTEXT, MCP_DISPLAY_NAME, MCP_NAME, MCP_VERSION, PUBLISHER,
    Client, find_one, info, step,
)

ALLOWED_PREFIXES = ("/sales/", "/products/")
DESCRIPTION = (
    "Read-only sales analytics for an online gift retailer (Dec 2009 to Dec 2011, GBP) as MCP tools: "
    "headline figures, monthly trend, revenue by country and best-selling products. "
    "No customer-level data is exposed."
)


def tool_operations(api: dict) -> list[dict]:
    """One TOOL for each allowed API operation, built the same way the Publisher UI does it."""
    tools = []
    for operation in api["operations"]:
        if not operation["target"].startswith(ALLOWED_PREFIXES):
            continue
        tools.append({
            "feature": "TOOL",
            "apiOperationMapping": {
                "apiId": api["id"], "apiName": api["name"], "apiVersion": api["version"], "apiContext": api["context"],
                "backendOperation": {"target": operation["target"], "verb": operation["verb"]},
            },
        })
    return tools


def ensure_server(client: Client, api: dict) -> str:
    found = client.get(f"{PUBLISHER}/mcp-servers", params={"query": f"name:{MCP_NAME}", "limit": 50})["list"]
    existing = find_one(found, name=MCP_NAME, version=MCP_VERSION)
    operations = tool_operations(api)
    if existing:
        server = client.get(f"{PUBLISHER}/mcp-servers/{existing['id']}")
        server.update({"description": DESCRIPTION, "operations": operations, "policies": ["Unlimited"]})
        client.put(f"{PUBLISHER}/mcp-servers/{server['id']}", json=server)
        info(f"MCP server exists ({server['id']}); tools refreshed from the API")
        return server["id"]
    created = client.post(f"{PUBLISHER}/mcp-servers/generate-from-api", json={
        "name": MCP_NAME, "displayName": MCP_DISPLAY_NAME, "description": DESCRIPTION, "context": MCP_CONTEXT,
        "version": MCP_VERSION, "policies": ["Unlimited"], "transport": ["http", "https"], "operations": operations,
    })
    info(f"MCP server created from the API ({created['id']})")
    return created["id"]


def deploy_and_publish(client: Client, server_id: str) -> None:
    from api import deploy  # the same revision steps we use for the REST API

    deploy(client, f"{PUBLISHER}/mcp-servers/{server_id}", "MCP server")
    server = client.get(f"{PUBLISHER}/mcp-servers/{server_id}")
    if server["lifeCycleStatus"] != "PUBLISHED":
        client.post(f"{PUBLISHER}/mcp-servers/change-lifecycle", params={"mcpServerId": server_id, "action": "Publish"})
        info("MCP server published to the Developer Portal")
    else:
        info("MCP server already published")


def subscribe_agent(server_id: str, agent_app_id: str) -> None:
    from apps import agent_client, ensure_subscription

    ensure_subscription(agent_client(), agent_app_id, AI_AGENT_APP, server_id, "DataGuard Sales MCP")


def run(client: Client, api_id: str, agent_app_id: str) -> str:
    step("MCP server (AI tools)")
    api = client.get(f"{PUBLISHER}/apis/{api_id}")
    server_id = ensure_server(client, api)
    tools = [o["target"] for o in client.get(f"{PUBLISHER}/mcp-servers/{server_id}")["operations"]]
    info(f"tools: {', '.join(sorted(tools))}")
    deploy_and_publish(client, server_id)
    subscribe_agent(server_id, agent_app_id)
    info(f"MCP endpoint: {GATEWAY_URL}{MCP_CONTEXT}/{MCP_VERSION}/mcp")
    return server_id
