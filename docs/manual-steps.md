# Manual steps

Everything in API Manager (users, roles, scopes, rate limits, the API, both
applications, keys, CORS, the MCP server and subscriptions) is created by
`wso2\scripts\setup_all.py`. The steps below are the few things only you can
do, because they happen in your browser or your AI assistant.

## 1. Trust the local certificate in your browser (once per browser)

API Manager uses a self-signed certificate. Before the dashboard can call the
gateway, your browser must accept it for both ports:

1. Open <https://localhost:9443/devportal>. At the warning, choose
   **Advanced**, then **Continue to localhost (unsafe)**.
2. Open <https://localhost:8243/>. Accept the warning the same way. A
   "not found" or empty page afterwards is expected.

If you skip this, the dashboard shows "Cannot reach the WSO2 gateway". This is
for local development only; a real deployment uses a certificate from a
trusted authority.

## 2. First sign-in: approve WSO2's consent page

The first time each user signs in, WSO2 shows a consent page listing the
scopes the dashboard asks for. Click **Allow**. (Tick "Remember my consent"
if you do not want to see it again.)

## 3. Connect an AI assistant to the MCP server

The MCP server is at:

```
https://localhost:8243/dataguard-mcp/1.0.0/mcp
```

It is protected by OAuth2 like the REST API, so the assistant needs an access
token of the **AI Agent** application. Get one (valid for one hour) with:

```cmd
cd C:\dataguard
venv\Scripts\activate
python scripts\get_agent_token.py
```

This prints the `Authorization: Bearer ...` header and also saves the gateway
certificate to `C:\dataguard\wso2\.state\wso2-localhost.pem`, so Node.js-based
MCP clients can trust the self-signed certificate without turning TLS checks
off.

### Option A: Claude Code (command line)

```cmd
set NODE_EXTRA_CA_CERTS=C:\dataguard\wso2\.state\wso2-localhost.pem
claude mcp add --transport http dataguard https://localhost:8243/dataguard-mcp/1.0.0/mcp --header "Authorization: Bearer PASTE_TOKEN_HERE"
claude
```

Inside Claude Code, run `/mcp` to see the `dataguard` server and its four
tools, then ask, for example:

- "Using the dataguard tools, what were total sales in 2011?"
- "Which month had the highest revenue?"
- "List our top 5 products and the top 5 countries outside the UK."
- "Show me customer 12347's order history." (Expected: the assistant explains
  it has no tool for customer data. That is the point.)

When the token expires (after one hour), remove and re-add the server with a
fresh token: `claude mcp remove dataguard`, then the `add` command again.

### Option B: MCP Inspector (good for the demo video)

```cmd
set NODE_EXTRA_CA_CERTS=C:\dataguard\wso2\.state\wso2-localhost.pem
npx @modelcontextprotocol/inspector
```

In the Inspector page: Transport **Streamable HTTP**, URL as above, add the
header `Authorization` with value `Bearer PASTE_TOKEN_HERE`, click
**Connect**, then **List Tools**. You will see exactly four tools and no
customer tool. Run `getSalesSummary` with `from` = `2011-01-01`.

Note: these commands download the client tools from npm into your user profile;
they are not part of the project. The project's own check of the MCP server
(`scripts\security_tests.py`) talks the MCP protocol directly and needs nothing
extra.

### Rate limit reminder

The AI Agent application is limited to 10 requests per minute. If the assistant
gets "Message throttled out" (HTTP 429), wait a minute. This is the protection
working.

## 4. (Optional) Show usernames instead of user IDs

API Manager 4.6.0 puts the user's ID (a UUID) in tokens, not the username. To
make the dashboard show "analyst1" instead of the ID:

1. Open the management console at <https://localhost:9443/carbon> and sign in
   as `admin`.
2. **Main > Identity > Service Providers > List**. Open the service provider
   whose name ends in `_PRODUCTION` and belongs to the Dashboard application
   (the client ID in `frontend\.env.local` appears under **Inbound
   Authentication Configuration > OAuth/OpenID Connect Configuration**).
3. Under **Claim Configuration**, add the requested claim
   `http://wso2.org/claims/username` and tick **Mandatory**. Click **Update**.
4. Sign out of the dashboard and sign in again.

The dashboard reads a `username` or `preferred_username` claim from the ID
token when present. This step is optional and not needed for any test.

## 5. Push to GitHub when ready

Nothing has been pushed. See "Publishing to GitHub" in the README.
