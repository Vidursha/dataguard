# How DataGuard works: a study guide

This guide explains the whole system in plain English, so you can understand
every part and explain it confidently in an interview. Read it top to bottom
once, then use the interview questions at the end to test yourself.

---

## 1. The big idea in one paragraph

A company has a database of sales. Several kinds of "callers" want answers from
it: managers, analysts, and AI assistants. Giving all of them the database
password would be dangerous: anyone could read everything, change anything, or
overload it. So instead we put **one guarded door** in front of the data. That
door is the **WSO2 API Manager gateway**. Every caller must show a valid
**token** (a digital pass) at the door. The pass says who they are and what they
are allowed to do. The gateway also counts how often each caller knocks
(**rate limiting**) and writes everything down (**logging**). Behind the door
sits a small **backend API** that reads the database and answers questions. The
backend trusts only the gateway, so there is no side entrance.

---

## 2. The parts and what each one does

| Part | Technology | Job |
|---|---|---|
| Dataset | UCI Online Retail II (Excel) | Raw sales lines from a UK gift shop, Dec 2009 to Dec 2011 |
| Cleaning script | Python + pandas (`backend/clean.py`) | Removes bad rows, separates cancellations, adds revenue, writes SQLite |
| Database | SQLite (`data/dataguard.db`) | Stores about one million clean sales rows |
| Backend API | FastAPI (`backend/app/main.py`) | Six read-only endpoints that run SQL queries and return JSON |
| Gateway | WSO2 API Manager, port 8243 | Checks tokens and scopes, applies rate limits and CORS, adds the secret header, forwards to the backend |
| Key Manager | WSO2 API Manager, port 9443 | Login page, issues tokens, knows users, roles and scopes |
| Dashboard | React + TypeScript (`frontend/`) | The web app people use; signs in through WSO2, calls the gateway |
| MCP server | WSO2 MCP Gateway | Turns four API operations into "tools" an AI assistant can call |
| Setup scripts | Python (`wso2/scripts/`) | Configure all of the above in API Manager automatically |

**Key vocabulary**

- **API:** a set of URLs a program can call to get data, here `/sales/summary`
  and so on.
- **Gateway:** a server that stands in front of an API and enforces rules
  before forwarding a request.
- **OAuth2:** the standard way to give an app a limited pass (an **access
  token**) instead of a password.
- **Scope:** a named permission inside a token, like `sales:read`.
- **Role:** a group a user belongs to, like `analyst`. WSO2 maps roles to
  scopes.
- **JWT:** JSON Web Token, the format of DataGuard's access tokens. It is three
  base64 parts: header, claims (who, which scopes, when it expires) and a
  signature that proves WSO2 issued it.
- **PKCE:** Proof Key for Code Exchange, an extra step in sign-in that stops a
  stolen sign-in code from being used by an attacker.
- **CORS:** Cross-Origin Resource Sharing, browser rules that decide whether a
  web page from one address may read responses from another address.
- **MCP:** Model Context Protocol, a standard that lets AI assistants discover
  and call tools.

---

## 3. From spreadsheet to database

The Excel file has two sheets. While exploring it (`notebooks/explore.py`) we
discovered that the sheets **overlap**: 1 to 9 December 2010 appears in both,
with identical rows. Loading both naively would double-count that period, so
`clean.py` drops the overlap from the first sheet.

Then it:

1. moves **cancellations** (invoice numbers starting with `C`) to their own
   table, because they are not sales but are still useful history;
2. removes rows that are not real sales: missing descriptions, zero or negative
   quantity or price, bad-debt adjustments, bank and Amazon fees, test items;
3. removes exact duplicate lines;
4. moves every sale that a later cancellation exactly reverses (same customer,
   same item, same quantity) into a `cancelled_sales` table, so an order that
   was cancelled ten minutes later doesn't count as revenue;
5. adds `revenue = quantity × price`;
6. marks postage, carriage and vouchers as "not a product", so they count as
   revenue but not as best sellers;
7. writes everything to SQLite and adds **indexes** on date, customer and
   country (an index is like a book's index: it lets the database jump to the
   right rows instead of reading all one million).

Rows with no Customer ID are **guest purchases**. They are real sales, so they
count in totals, but they can never appear in a customer lookup because there is
no customer to report on. Full numbers are in
[data-quality.md](data-quality.md).

---

## 4. Signing in: what happens when you click "Sign in with WSO2"

This is the **OAuth2 Authorization Code flow with PKCE**. Follow it step by step:

1. **The app makes two random secrets.** In `frontend/src/auth/authService.ts`,
   the browser creates a random **code verifier** (43 characters) and a random
   **state** value, and stores them in `sessionStorage`. It then computes the
   **code challenge** = SHA-256 hash of the verifier, base64url-encoded.

2. **Redirect to WSO2.** The browser goes to
   `https://localhost:9443/oauth2/authorize?response_type=code&client_id=...&redirect_uri=http://localhost:5173/callback&scope=openid sales:read customer:read&state=...&code_challenge=...&code_challenge_method=S256`.
   Notice the app sends the **hash**, not the verifier.

3. **You log in on WSO2's page.** You type your username and password into
   WSO2's own login form. DataGuard never sees your password. WSO2 checks your
   roles and decides which of the requested scopes you may have. An analyst
   asked for `customer:read` but WSO2 silently drops it, because only the
   manager role is bound to it.

4. **WSO2 redirects back with a code.** The browser returns to
   `http://localhost:5173/callback?code=XYZ&state=...`. The app checks that
   `state` matches what it stored (this blocks forged redirects).

5. **The app exchanges the code for a token.** It POSTs the `code` **and the
   original verifier** to WSO2's token endpoint. WSO2 hashes the verifier and
   compares it with the challenge from step 2. Only the page that started the
   sign-in knows the verifier, so a stolen code alone is worthless. (Because
   API Manager doesn't send CORS headers on its token endpoint, this one call
   goes through the Vite dev server, which forwards it to WSO2. See
   decisions.md #10.)

6. **The app stores the token.** The access token (a JWT, valid one hour) is
   saved in `sessionStorage`: it survives a page reload but disappears when the
   tab closes, and it is never put in `localStorage`, where it would linger.

**Sign-out** deletes the token and sends the browser to WSO2's logout page, so
WSO2 forgets the login session too.

---

## 5. One request, from click to database and back

Let's follow what happens when the **analyst** looks up customer 12347, and
then when the **manager** does the same.

### Step 1: the browser

`CustomersPage.tsx` validates the input (digits only) and calls
`api.customerSummary(token, 12347)`, which does:

```
GET https://localhost:8243/dataguard/1.0.0/customers/12347/summary
Authorization: Bearer eyJ4NXQiOi...   (the access token)
Origin: http://localhost:5173
```

Note the address: port **8243**, the WSO2 gateway, never the backend directly.

### Step 2: CORS preflight (browser safety check)

Because the page (port 5173) calls a different origin (port 8243) with an
`Authorization` header, the browser first sends an `OPTIONS` "preflight"
request asking "may this origin call you?". The gateway's CORS settings for
this API answer "yes, but only for `http://localhost:5173`". A page from any
other website would be refused, so a malicious site can't use your token from
your browser.

### Step 3: the gateway checks the token

The gateway verifies the JWT's **signature** (was it really issued by WSO2?),
its **expiry**, and that the calling application is **subscribed** to the API.
No token or a bad token gives **401 Unauthorized**.

### Step 4: the gateway checks the scope

The `/customers/{id}/summary` resource requires the `customer:read` scope.

- **Analyst:** the token's `scope` claim is `openid sales:read`. No
  `customer:read`, so the gateway stops here and answers **403 Forbidden** with
  WSO2 code `900910` ("The access token does not allow you to access the
  requested resource"). The backend and database are never touched.
- **Manager:** the token has `customer:read`, so the request continues.

### Step 5: the gateway checks the rate limit

WSO2 counts requests per application and per user. The Dashboard allows 30 per
minute per person. Over the limit gives **429 Too Many Requests** with code
`900803` and the time you can try again.

### Step 6: the gateway adds the secret and forwards

An API-level policy (`addHeader`) adds `X-DataGuard-Gateway-Secret: <secret>`
and the gateway forwards the request to `http://127.0.0.1:8000/customers/12347/summary`.
It removes your access token first: the backend never sees it.

### Step 7: the backend checks the secret

In `backend/app/main.py` a middleware compares the header with the secret from
`.env` using a **constant-time comparison** (so an attacker can't guess it
character by character by measuring response times). Missing or wrong secret
gives **403 gateway_required**. That's why calling the backend directly, even
from the same laptop, fails.

### Step 8: validation and the database query

FastAPI checks that `12347` is a whole number between 1 and 99,999,999 (else
**400**). Then it runs, on a **read-only** SQLite connection:

```sql
SELECT COUNT(DISTINCT invoice), SUM(revenue), SUM(quantity),
       MIN(invoice_date), MAX(invoice_date), country
FROM sales WHERE customer_id = ?
```

The `?` is a **parameter**: the value is passed separately from the SQL text, so
SQL injection is impossible. `customer_id = ?` can never match a NULL, so guest
purchases are excluded automatically. No rows gives **404**.

### Step 9: the response travels back

The backend returns JSON (`{"customer_id": 12347, "orders": 8, "total_spend":
4921.53, ...}`), the gateway adds CORS headers and logs the call, and the
browser shows the summary card.

### Step 10: the analyst's red panel

For the analyst, the browser received the gateway's 403 body. `client.ts` turns
it into an `ApiError` of kind `forbidden`, and `AccessDenied` renders "Access
denied by WSO2 API Manager (403)" with the real WSO2 code. The UI did not decide
this. It only displays what the gateway decided. That is the most important
design point: **security lives at the gateway, not in the browser**, because
anything in the browser can be changed by the user.

---

## 6. The AI assistant path (MCP)

1. The setup script asked API Manager to **generate an MCP server from the
   existing API**, choosing only the four sales, product and country
   operations. WSO2 turned each into a tool: the `operationId` becomes the
   tool name (`getSalesSummary`), and the endpoint description becomes the
   tool description the AI reads.
2. The AI assistant connects to `https://localhost:8243/dataguard-mcp/1.0.0/mcp`
   with a token from the **AI Agent** application (client credentials grant: a
   machine logging in with its own ID and secret, no human).
3. It calls `tools/list` and sees four tools. There is **no customer tool**.
4. When the AI calls a tool, WSO2 translates it into a normal API request, which
   passes through the same checks: token, scope, rate limit (10 per minute for
   the AI), secret header.
5. Defence in depth: the AI Agent app is owned by a service account with only
   the analyst role, so even a hand-crafted request for customer data with the
   agent's token is refused, because the token can never contain
   `customer:read`.

---

## 7. How it is tested

| Layer | What | How many |
|---|---|---|
| Backend | Every endpoint, bad inputs, guest handling, gateway secret, cleaning rules | 58 pytest tests |
| Frontend | KPI cards, charts, 403/429 panels, loading/error/empty states, auth guard, PKCE maths | 31 Vitest tests |
| Live security | Real tokens against the real gateway: 401, 403, 200, scopes, direct-backend block, CORS, MCP tools, 429 | 10 checks |
| Live UI | Real browser signs in through WSO2 as analyst and manager, sees real 403, 200 and 429, mobile dark layout | 4 Playwright tests |

A real bug was caught this way: after re-uploading the API definition, WSO2 had
dropped the scope-role bindings and everyone got every scope. The security
tests failed, the API Manager log showed why, and the setup script was fixed to
upload WSO2's scope extensions and verify the bindings (see decisions.md 5a).

---

## 8. Fifteen interview questions with model answers

**1. What problem does DataGuard solve?**
It gives people and AI assistants self-service access to sales data without
handing out database access. Every request is authenticated, authorized by
role, rate-limited and logged by WSO2 API Manager, and the backend can only be
reached through the gateway.

**2. Why put an API gateway in front of the backend instead of adding security to the backend itself?**
Separation of concerns. The gateway centralizes authentication, authorization,
throttling, CORS and analytics for every API and every client type, so the
backend stays a simple data service. Policies change in one place without
redeploying code, and the same rules automatically apply to the dashboard and
the AI agent.

**3. Explain the OAuth2 Authorization Code flow with PKCE.**
The app creates a random verifier and sends only its SHA-256 hash (the
challenge) when redirecting the user to WSO2's login page. After login, WSO2
returns a one-time code to the app's callback. The app exchanges the code plus
the original verifier for tokens; WSO2 checks that hash(verifier) equals the
challenge. An attacker who intercepts the code doesn't have the verifier, so the
code is useless to them.

**4. Why PKCE and not a client secret for the dashboard?**
Anything shipped to a browser is public, so a secret in a single-page app isn't
secret. The Dashboard is registered as a public client with PKCE mandatory and
plain-text PKCE disabled, so only S256 challenges are accepted.

**5. Where are tokens stored, and why?**
In `sessionStorage`: they survive a reload but are cleared when the tab
closes, and they aren't shared with other tabs. Never `localStorage`, which
persists indefinitely and widens the exposure to cross-site scripting. No
refresh token is issued to the browser; users sign in again after an hour.

**6. What's the difference between authentication and authorization here?**
Authentication is WSO2's login page proving who you are and issuing a token.
Authorization is the gateway checking whether that token's scopes allow the
specific resource, for example `customer:read` for customer lookups.

**7. How do roles become permissions?**
Scopes are defined on the API and bound to roles: `sales:read` to analyst and
manager, `customer:read` to manager. When a user signs in, WSO2 only puts scopes
into the token that one of the user's roles is bound to. The gateway then checks
the scope required by each resource.

**8. Why does the analyst see a 403 instead of the page being hidden?**
Because hiding things in the UI is not security: a user can call the API
directly. The real decision must be made by the gateway. The UI simply shows the
gateway's real 403, which also proves the protection works.

**9. How do you stop someone bypassing the gateway?**
The backend rejects any request without a shared secret header, compared in
constant time. Only the gateway knows the secret; it adds the header through an
API Manager policy. Binding to localhost alone isn't enough, because local
programs could still call the backend. In production I'd use mutual TLS or
validate WSO2's backend JWT instead.

**10. How does rate limiting work and why do the AI agent and dashboard get different limits?**
API Manager application policies count requests per application per user in
one-minute windows; over the limit, the gateway returns 429. People click at
human speed, but an AI agent can loop or fan out automatically, so it gets 10
per minute against the dashboard's 30 per user. That caps cost and abuse while
allowing a normal conversation.

**11. What is MCP and how does WSO2 support it?**
The Model Context Protocol lets AI assistants discover and call tools in a
standard way. API Manager 4.6.0 can generate an MCP server from an existing
API: chosen operations become tools, with names and descriptions from the
OpenAPI spec, and calls are governed by the same gateway security and rate
limits.

**12. How did you keep the AI agent away from personal data?**
Two independent layers. First, the MCP server only exposes the four aggregate
operations; there is no customer tool. Second, the AI Agent application is owned
by a service account with only the analyst role, so its tokens can never carry
`customer:read`, and even a direct call is refused with 403.

**13. What is CORS and how is it configured?**
It's the browser's rule for cross-origin reads. The gateway's API-level CORS
allows only `http://localhost:5173` with GET and OPTIONS, so other websites
can't read responses using a user's browser. It also includes the CORS header on
error responses, which lets the dashboard show friendly 403 and 429 messages.

**14. How did you make the WSO2 setup repeatable?**
Python scripts use the official REST APIs (Publisher v4, Developer Portal v3,
Admin v4, Dynamic Client Registration). Each step looks up existing objects by
name and updates them instead of duplicating them, prunes old revisions, and
verifies the scope bindings in the key manager. Running `setup_all.py` again is
safe and was tested repeatedly.

**15. What would you change for production?**
Use PostgreSQL, run everything in containers with real certificates, replace
the shared secret with mutual TLS or backend JWT validation, use WSO2 Identity
Server as an external key manager with MFA, enable API Manager analytics,
serve the SPA behind the same reverse proxy as the identity provider instead of
the Vite proxy, and move to API Manager 4.7.0.

---

## 9. Where to look in the code

| If you want to understand... | Read |
|---|---|
| Data cleaning | `backend/clean.py`, `docs/data-quality.md` |
| Endpoints and SQL | `backend/app/main.py` |
| Gateway secret check | `require_gateway` in `backend/app/main.py`, `backend/app/config.py` |
| Scopes, CORS, secret policy | `wso2/scripts/api.py` |
| Apps, PKCE settings, keys | `wso2/scripts/apps.py` |
| Rate limits | `wso2/scripts/policies.py` |
| MCP server | `wso2/scripts/mcp.py` |
| Sign-in flow | `frontend/src/auth/authService.ts`, `pkce.ts`, `session.ts` |
| Calling the gateway, error handling | `frontend/src/api/client.ts`, `useApi.ts` |
| 403 / 429 panels | `frontend/src/components/states.tsx` |
| Live security checks | `scripts/security_tests.py`, `scripts/wso2_auth.py` |
