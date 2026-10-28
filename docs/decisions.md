# Design decisions

Every significant choice in DataGuard, why it was made, and what it costs.
Where a decision depends on WSO2 API Manager 4.6.0 behaviour, the source is
listed.

**A note on sources.** Several pages of the 4.6.0 documentation site refused
automated fetching during the build. For exact REST endpoints and payloads I
therefore used the most authoritative source available: the OpenAPI
definitions that the running 4.6.0 server publishes for its own REST APIs:

- Publisher REST API v4: `https://localhost:9443/api/am/publisher/v4/swagger.yaml`
- Developer Portal REST API v3: `https://localhost:9443/api/am/devportal/v3/swagger.yaml`
- Admin REST API v4: `https://localhost:9443/api/am/admin/v4/swagger.yaml`

These describe exactly the build in use, and every call in `wso2/scripts/` was
checked against them and then against live behaviour. Documentation pages that
could be confirmed are linked below.

---

## 1. SQLite as the database

**Decision:** Load the cleaned data into a single SQLite file (`data/dataguard.db`).

**Why:** The data is static history (about one million rows, 172 MB on disk), the API is
read-only, and the project must run on one laptop with no extra servers. SQLite
needs no installation, opens read-only (`mode=ro`), and answers every
aggregate query in well under two seconds with the indexes on
`invoice_date`, `customer_id` and `country`.

**Trade-off:** No concurrent writers, no network access, no row-level security.
None of that matters for a read-only API behind a gateway; PostgreSQL is listed
as future work for a multi-user deployment.

## 2. Data cleaning rules

**Decision:** Drop the 22,523 rows duplicated across the two sheets, move
cancellations to their own table, remove non-sales rows, keep guest purchases.
Details and counts are in [data-quality.md](data-quality.md).

**Why:** The two sheets overlap for 1-9 December 2010 with identical rows;
counting both would inflate that month. Postage, carriage and gift vouchers are
real revenue, so they stay in totals but are excluded from "top products".

## 3. FastAPI backend, read-only, with descriptive OpenAPI

**Decision:** FastAPI with typed Pydantic response models and a long
`summary`/`description` on every operation, plus explicit `operationId`s.

**Why:** WSO2 imports the API from the OpenAPI document, and its MCP Gateway
turns the same operations into AI tools: the `operationId` becomes the tool
name and the description becomes the tool description an AI model reads when
choosing a tool. Good descriptions are therefore part of the security and
usability design, not decoration.

**Details:** Errors use one JSON shape, `{"error": {"code", "message", "details"?}}`.
Validation errors return 400 (not FastAPI's default 422) because they are bad
client input. Interactive docs (`/docs`) are disabled on the backend: consumers
use the WSO2 Developer Portal. Optional query parameters are simplified from
`anyOf [type, null]` to the plain type in the exported spec so the generated
MCP tool schemas keep their formats.

## 4. Gateway-only access: shared secret header

**Problem:** The gateway and the backend run on the same laptop. Binding the
backend to `127.0.0.1` stops other machines, but any local program (a browser
tab, a script, an AI agent with shell access) could still call it and skip
authentication, scopes and rate limits.

**Decision:** The backend rejects every request that lacks the header
`X-DataGuard-Gateway-Secret` with the correct value (constant-time
comparison, 403 `gateway_required`). The gateway adds the header through an
**API-level request policy** using API Manager's built-in `addHeader` (v2)
operation policy, configured by `wso2/scripts/api.py`. The secret is a
64-character random value generated into the git-ignored `.env`
(`wso2/scripts/generate_env.py`); the backend refuses to start without it.
`/health` stays open for monitoring and returns no business data.

**Alternatives considered:**

| Option | Why not chosen |
|---|---|
| Bind to localhost only | Does not stop local callers, which is the actual threat here. |
| Mutual TLS between gateway and backend | Strongest option, but needs a CA, certificates and TLS on the backend; too heavy for a local demo. Listed as future work. |
| Endpoint Basic Auth (WSO2 endpoint security) | Also works and stores the password encrypted, but the requirement asked for a dedicated shared-secret header, and a custom header keeps the backend's `Authorization` header free. |
| Backend JWT (`X-JWT-Assertion`) validation | Proves the call came through WSO2 and carries user claims, but requires the backend to fetch and validate WSO2's signing keys. A good next step. |

**Trade-offs:** The secret is stored in the API's policy configuration, so
anyone with Publisher rights can read it, and it travels over plain HTTP on
the loopback interface. Rotating it means updating `.env`, re-running
`setup_all.py` and restarting the backend. For this local project that is
acceptable; in production use mTLS or backend JWT.

## 5. Scopes and roles

**Decision:** Two API-local scopes: `sales:read` (bound to roles `analyst`
and `manager`) on the four sales, product and country operations, and
`customer:read` (bound to `manager` only) on the customer operation.

**Why:** Customer history is the only personal data, so it gets its own scope.
WSO2 issues a scope in a token only if the user has a role bound to it, so the
analyst's token simply does not contain `customer:read` and the gateway
returns **403 (code 900910)** for customer calls. The dashboard never hides
the page or checks roles itself: the 403 the analyst sees is the gateway's
real answer.

**Source:** fine-grained access control with OAuth scopes,
<https://apim.docs.wso2.com/en/4.4.0/design/api-security/oauth2/oauth2-scopes/fine-grained-access-control-with-oauth-scopes/>
(nearest indexed version; behaviour verified live on 4.6.0).

### 5a. Scope loss on re-import (found and fixed during the build)

On the third run of the setup scripts, every user suddenly received every
scope. API Manager's log showed `Error occurred while deleting scope:
sales:read ... 404`. Re-uploading the OpenAPI definition (`PUT
/apis/{id}/swagger`) without WSO2's scope extensions made API Manager detach
the scopes and delete them from the key manager; a partly failed delete left
them unregistered, and an unregistered scope is not role-checked, so it was
granted to anyone who asked.

**Fix:** `api.py` now uploads the definition with WSO2's own extensions
(`components.securitySchemes.default` with `x-scopes-bindings`, and a
`security` entry per operation), which is the format API Manager itself stores.
After configuring, it verifies each scope and its role bindings in the key
manager through the OAuth2 Scope Management API
(`/api/identity/oauth2/v1.0/scopes`) and re-registers them if anything is
missing. `scripts/security_tests.py` now checks the granted scopes on every
run, so a regression like this is caught immediately. A related apictl issue
(scope bindings silently removed on import) is noted in the
[apictl release notes](https://github.com/wso2/product-apim-tooling/releases/).

## 6. Users and roles via the user-store admin service

**Decision:** Create roles and users with the `RemoteUserStoreManagerService`
admin service (SOAP, admin basic auth).

**Why:** In this API Manager 4.6.0 install, the SCIM2 endpoints redirect to
the console login for basic-auth requests, while the admin service is
available and is the documented way to manage the primary user store.
Re-runs reset the test users' passwords to the values in `.env`, so `.env` is
always the source of truth.

## 7. A service account for the AI agent

**Decision:** The "AI Agent" application is owned by a dedicated user,
`ai-agent-svc`, with roles `analyst` and `Internal/subscriber`.

**Why:** A client-credentials token acts as the application's owner. When the
app was owned by `admin` (who has neither the analyst nor the manager role),
its tokens got no scopes at all. Owning it with an analyst-level service
account means the agent can obtain `sales:read` but **can never obtain
`customer:read`, even if it asks for it** (verified by the security tests).
This is defence in depth on top of the MCP server not exposing a customer tool.
The account's password is random, kept in `.env`, and never used to sign in
interactively.

## 8. Rate limits

| Application | Policy | Limit | Reasoning |
|---|---|---|---|
| AI Agent | `DataGuardAIAgent` | 10 requests / minute | An agent can loop or fan out without a person noticing. Ten calls a minute is plenty for a conversation (a question rarely needs more than three tool calls) while capping the cost of a runaway agent and making bulk scraping slow. |
| Dashboard | `DataGuardDashboard` | 30 requests / minute per user | Each page makes one or two calls, so a person clicking around stays far below it; deliberately repeated refreshing reaches it, which makes the 429 handling demonstrable. |

Application-level policies in API Manager are counted per application **per
user**, so every dashboard user has their own allowance. Counting uses fixed
one-minute windows and is propagated asynchronously, so a burst that spans a
window boundary can get a few more requests through before the 429 (seen in
testing: 10 and 17). Subscriptions use the built-in `Unlimited` tier so the
application policy is the effective limit.

## 9. Dashboard sign-in: Authorization Code + PKCE (public client)

**Decision:** The "Dashboard" application uses only the `authorization_code`
grant, with PKCE mandatory (`pkceMandatory=true`), plain-text PKCE disabled
(`pkceSupportPlain=false`, so only S256) and no client secret
(`bypassClientCredentials=true`, a public client). These are application
settings offered by the 4.6.0 Resident Key Manager (listed by
`GET /api/am/devportal/v3/key-managers`). PKCE works fully in 4.6.0, so no
fallback was needed.

**Why:** A browser cannot keep a secret. PKCE binds the authorization code to
a one-time verifier held by the page that started sign-in, so a stolen code is
useless. The user types their password only on the WSO2 login page.

**Token storage:** `sessionStorage` (survives a reload, cleared when the tab
closes), never `localStorage`. No refresh token is requested; when the
one-hour access token expires, the user signs in again. Sign-out clears the
session and calls WSO2's OIDC logout endpoint so the WSO2 session ends too and
the next sign-in asks for credentials (important when switching between the
analyst and manager in a demo).

**Callback URL:** `regexp=(http://localhost:5173/callback|http://localhost:5173/)`,
covering the sign-in callback and the post-logout redirect.

**Source:** key manager overview,
<https://apim.docs.wso2.com/en/4.6.0/api-security/key-management/key-manager-overview/>.

## 10. The token endpoint is reached through the Vite dev server

**Problem:** After WSO2 redirects back with the authorization code, the
browser must POST to `https://localhost:9443/oauth2/token`. API Manager 4.6.0
sends no CORS headers on that endpoint by default, so the browser blocks the
response.

**Options:**

1. Add a `[cors]` section to `C:\wso2am-4.6.0\repository\conf\deployment.toml`
   allowing `http://localhost:5173` (the documented server-wide fix).
2. Let the Vite dev/preview server forward **only** `/oauth2/token`
   same-origin to `https://localhost:9443`.

**Decision:** Option 2 (see `frontend/vite.config.ts`). The project rules allow
changes inside the API Manager folder only when truly needed, and they are not:
the proxy carries one token request per sign-in, and every **data** call still
goes straight from the browser to the gateway on port 8243 with the access
token. No API Manager configuration file was changed.

**Trade-off:** It works with `npm run dev` and `npm run preview`, not with a
static file host. A production deployment would serve the SPA behind the same
reverse proxy as the identity provider, or use option 1.

## 11. CORS on the API

**Decision:** API-level CORS allowing only `http://localhost:5173`, methods
`GET, OPTIONS`, headers `authorization, content-type`, no credentials.

**Why:** The server-wide default in `deployment.toml` is `allow_origins = "*"`.
API-level CORS overrides it for this API only. Verified: the gateway echoes the
dashboard origin and returns an empty `Access-Control-Allow-Origin` for any
other origin. Importantly, the gateway also adds the CORS header to its own 401,
403 and 429 responses, which is what lets the browser read them and show the
friendly panels. The 429 body's `nextAccessTime` is parsed for the retry time
because `Retry-After` is not a CORS-exposed header.

## 12. The signed-in user's name

**Observation:** In 4.6.0 the token subject (`sub`) is the user's ID, a UUID,
not the username, and the Resident Key Manager releases no profile claims for
DevPortal-created applications unless claims are configured on the service
provider in the management console (not possible through the REST APIs).

**Decision:** The dashboard shows the user ID and the role. The role is read
from the granted scopes, which identifies it exactly, because WSO2 only grants
`customer:read` to managers. If a `username` or `preferred_username` claim is
ever released (optional step in [manual-steps.md](manual-steps.md)), the UI
shows it automatically.

## 13. MCP server generated from the existing API

**Decision:** `wso2/scripts/mcp.py` calls `POST
/api/am/publisher/v4/mcp-servers/generate-from-api` with one `TOOL` operation
per allowed API operation (the same payload the 4.6.0 Publisher UI sends), then
creates a revision, deploys it to the Default gateway, publishes it and
subscribes the AI Agent application. Everything is automated; no manual step
is needed for the server itself.

**Tools exposed:** `getSalesSummary`, `getMonthlySales`, `getRevenueByCountry`,
`getTopProducts`. **Excluded on purpose:** `getCustomerSummary`. The AI agent
has no tool for personal data, and even a hand-written call is refused,
because its token lacks `customer:read`.

**Observations:** MCP tool calls go through the API, so the shared-secret
policy, scopes and rate limits apply to AI traffic exactly as to people.
Calling a tool that does not exist returns a 500 SOAP fault from the gateway
rather than a JSON-RPC error. That is a 4.6.0 quirk, documented as a limitation;
no data is exposed.

**Sources:** <https://apim.docs.wso2.com/en/4.6.0/ai-gateway/mcp-gateway/overview/>,
<https://apim.docs.wso2.com/en/4.6.0/ai-gateway/mcp-gateway/create-from-api/>.

## 14. Repeatable setup

Every script finds existing objects by name and updates them instead of
creating duplicates: policies (`PUT` when present), API (`PUT /swagger` and
`PUT /apis/{id}`), applications, keys (`PUT /oauth-keys/{id}`), subscriptions
(skipped when present) and MCP server (`PUT`). API Manager keeps at most five
revisions per API, so the oldest undeployed revisions are deleted before a new
one is created. The admin token comes from a DCR client registered under a
fixed name, which DCR returns again on re-runs. Verified by running
`setup_all.py` repeatedly against the same server.

## 15. Frontend stack and design system

React 19 + TypeScript 7 + Vite 8, Tailwind CSS 3.4 (so design tokens live in
`tailwind.config.ts` as the brief asked), Recharts 3, React Router 7. Lint uses
`oxlint` (the linter the current Vite template ships) with the React,
jsx-a11y, import and vitest plugins and warnings treated as errors.

All colours are semantic tokens (`canvas`, `surface`, `ink`, `brand`,
`danger`, ...) backed by CSS variables, with separate light and dark values
chosen for WCAG AA contrast. Charts are single-series and use one blue
validated for colour-vision deficiency and contrast against both card
surfaces; each chart has a screen-reader summary and a table view. Chart
pages are lazy-loaded so the charting library is not in the first download.

## 16. Testing approach

- **Backend (pytest, 58 tests):** a small hand-built database with known
  totals, so each assertion is exact; gateway-secret checks; cleaning rules.
- **Frontend unit (Vitest + Testing Library, 31 tests):** all network calls
  mocked; tests for the 403 and 429 panels use the exact error bodies API
  Manager returns.
- **Live security (`scripts/security_tests.py`, 10 checks):** real tokens,
  obtained through the real login page with PKCE, against the real gateway.
- **Live UI (`npm run e2e`, Playwright with the Edge already installed on
  Windows):** signs in through the WSO2 login page as analyst and manager,
  checks the real 403, 200 and 429 in the dashboard and the 375 px dark
  layout.
