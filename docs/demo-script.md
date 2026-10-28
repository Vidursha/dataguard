# Demo video script (about 5 minutes)

**Before recording**

- Start everything with `scripts\start_all.cmd` and wait until API Manager is
  up (about 3 minutes).
- Run `python scripts\get_agent_token.py` and set up the AI assistant as in
  [manual-steps.md](manual-steps.md) (step 3). Check that `/mcp` lists the
  four tools.
- Use a fresh browser window. Sign out of the dashboard if signed in.
- Have the passwords for `analyst1` and `manager1` from `.env` ready (do not
  show `.env` on screen).
- Don't run `scripts\security_tests.py` in the minute before recording: its
  last check deliberately uses up the AI agent's rate-limit allowance.

---

## 0:00 to 0:30, The problem

*Screen: the DataGuard sign-in page.*

> "A small online retailer wants managers, analysts and AI assistants to answer
> sales questions themselves. But they can't just hand out database access:
> customer data is personal, and an AI agent can make thousands of calls
> without anyone noticing. DataGuard solves this with WSO2 API Manager. Every
> person and every AI agent goes through the WSO2 gateway, which handles
> sign-in, permissions, rate limits and logging. There is no other way in."

## 0:30 to 1:15, Sign in through WSO2

*Click **Sign in with WSO2**. The WSO2 API Manager login page opens.*

> "When I click sign in, I'm sent to WSO2's own login page. DataGuard never
> sees my password. This uses OAuth2 Authorization Code with PKCE, the
> recommended flow for browser apps."

*Sign in as `analyst1`. Approve consent if asked. The Overview page loads.*

> "WSO2 redirected me back with a one-time code, and the app exchanged it,
> plus a secret verifier only this page knows, for an access token."

## 1:15 to 2:00, Overview

*Point at the KPI cards, then the chart. Click the **2011** quick range.*

> "This is real data: about one million cleaned transactions, twenty million
> pounds of revenue. Every number on this page came through the WSO2 gateway on
> port 8243 with my token attached. Here's the monthly trend. You can see the
> November peaks before Christmas. I can filter by date range."

*Optional: open DevTools Network tab briefly to show calls go to `localhost:8243`.*

## 2:00 to 2:45, The key moment: analyst gets a 403

*Go to **Customers**, type `12347`, click **Look up**.*

> "I'm an analyst. Analysts can see sales figures, but not individual
> customers, which is personal data. The page isn't hidden from me. The app
> really sends the request, and the WSO2 gateway refuses it."

*Point at the red panel: "Access denied by WSO2 API Manager (403)", WSO2 code 900910.*

> "That's the gateway's real answer: my token doesn't contain the
> customer:read scope, because WSO2 only grants it to the manager role. The
> request never reached the database."

*Open **Access & Security** briefly.*

> "Here I can see my role, the scopes in my token, when it expires, and how WSO2
> protects every request."

## 2:45 to 3:20, Manager view

*Click **Sign out**. Sign in again as `manager1`. Go to **Customers**, look up `12347`.*

> "Now the manager. Same app, same request, but this token has customer:read,
> so the gateway lets it through: eight orders, about four thousand nine
> hundred pounds, first and last order dates."

## 3:20 to 3:50, Rate limit

*Go to **Overview** and click **Refresh** quickly about 15 times.*

> "Each person can make 30 requests a minute. If I hammer refresh..."

*The amber panel appears: "Too many requests, limited by WSO2".*

> "...the gateway returns 429 and the app explains it, with the time I can
> try again. This protects the service from runaway scripts and from me."

## 3:50 to 4:45, The AI assistant with MCP tools

*Switch to the AI assistant (Claude Code with `/mcp`, or MCP Inspector).*

> "API Manager 4.6.0 can turn an existing API into an MCP server, the protocol
> AI assistants use to call tools. I exposed only four operations as tools:
> sales summary, monthly sales, revenue by country and top products. The
> customer endpoint is deliberately not a tool."

*Show the tool list. Ask: "What were total sales in 2011, and which three
products earned the most?" Show the tool calls and the answer.*

> "The assistant picks the right tools from their descriptions, which come from
> the API's own documentation. Its calls go through the same gateway, with its
> own OAuth token and a tighter limit: ten requests a minute."

*Ask: "Show me customer 12347's order history."*

> "And if it's asked for personal data, it simply has no tool for it. Even if
> someone called the API directly with the agent's token, WSO2 would refuse,
> because the agent's account can never get the customer scope."

## 4:45 to 5:00, Wrap-up

*Show the README architecture diagram or the security test table.*

> "So: one WSO2 gateway in front of the data, for people and for AI. OAuth2
> with PKCE, role-based scopes, separate rate limits, a backend that rejects
> anything not coming through the gateway, and an automated security test suite
> that checks all of it against the live system. Thanks for watching."
