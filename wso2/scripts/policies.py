"""Rate-limit policies for the applications (Admin REST API v4).

API Manager counts application policies per application *and per user*, so
every signed-in dashboard user gets their own allowance.

- DataGuardAIAgent: 10 requests a minute. An AI agent can loop or fire off lots
  of calls without anyone noticing. A tight limit keeps a runaway agent cheap
  and makes scraping slow, but it's still enough for a normal conversation.
- DataGuardDashboard: 30 requests a minute per user. Each page makes one or two
  calls, so normal use stays well under it. Clicking refresh over and over does
  hit it, which is handy for showing the 429 message.
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
