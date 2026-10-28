"""Application-level rate-limit policies (Admin REST API v4).

Application policies in API Manager are counted per application *per user*,
so every signed-in dashboard user gets their own allowance.

- DataGuardAIAgent: 10 requests/minute. An AI agent can loop or fan out
  without a human noticing; a tight limit caps the cost of a runaway agent and
  makes bulk scraping slow, while still allowing a conversation's worth of
  tool calls.
- DataGuardDashboard: 30 requests/minute per user. Each dashboard page makes
  one or two API calls, so normal browsing stays far below this, but rapid
  repeated refreshing hits it (useful to demonstrate the 429 handling).
"""

from __future__ import annotations

from common import ADMIN, AI_AGENT_POLICY, DASHBOARD_POLICY, Client, find_one, info, step

POLICIES = {
    AI_AGENT_POLICY: (10, "AI assistants: 10 requests per minute per application user"),
    DASHBOARD_POLICY: (30, "DataGuard dashboard: 30 requests per minute per signed-in user"),
}


def run(client: Client) -> None:
    step("Application rate-limit policies")
    existing = client.get(f"{ADMIN}/throttling/policies/application")["list"]
    for name, (per_minute, description) in POLICIES.items():
        body = {
            "policyName": name,
            "displayName": name,
            "description": description,
            "defaultLimit": {"type": "REQUESTCOUNTLIMIT",
                             "requestCount": {"timeUnit": "min", "unitTime": 1, "requestCount": per_minute}},
        }
        current = find_one(existing, policyName=name)
        if current:
            client.put(f"{ADMIN}/throttling/policies/application/{current['policyId']}",
                       json={**body, "policyId": current["policyId"]})
            info(f"{name}: updated ({per_minute}/min)")
        else:
            client.post(f"{ADMIN}/throttling/policies/application", json=body)
            info(f"{name}: created ({per_minute}/min)")
