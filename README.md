# HackerOne MCP Server

> **Disclaimer:** This is an unofficial, community-built project. It is not affiliated with, endorsed by, or maintained by HackerOne. "HackerOne" is a trademark of HackerOne, Inc. This project integrates with the documented HackerOne Hacker API.

MCP server for HackerOne reports, programs, scope, earnings, profile data, report submission, triage comments, and report withdrawal.

## Production endpoint

```text
https://hackeronemcpserver.vercel.app/api/mcp
```

Health check:

```text
https://hackeronemcpserver.vercel.app/api/health
```

## ChatGPT authentication

The hosted MCP implements OAuth 2.1 authorization-code flow with PKCE for ChatGPT.

Discovery endpoints:

```text
https://hackeronemcpserver.vercel.app/.well-known/oauth-protected-resource
https://hackeronemcpserver.vercel.app/.well-known/oauth-authorization-server
```

When ChatGPT connects, the server returns an OAuth Bearer challenge. ChatGPT opens the HackerOne authorization page, where you enter your HackerOne username and API token. The server verifies those credentials directly with HackerOne.

The HackerOne API token is not committed to GitHub and is not returned to ChatGPT. Authorization codes, access tokens, refresh tokens, and their HackerOne credential mappings are stored server-side in Vercel Runtime Cache. ChatGPT receives opaque random OAuth tokens.

The OAuth implementation supports:

- Authorization code flow
- PKCE with `S256`
- Client ID Metadata Documents (CIMD)
- Stable ChatGPT client ID `https://chatgpt.com/oauth/client.json`
- Stable ChatGPT redirect URI `https://chatgpt.com/connector_platform_oauth_redirect`
- RFC 8707 `resource` binding
- RFC 9207 authorization response issuer identification
- Access-token expiration and refresh-token rotation

HTTP Basic auth remains available for non-ChatGPT clients and backwards compatibility.

## Add to ChatGPT

Create a personal/custom plugin using this MCP URL:

```text
https://hackeronemcpserver.vercel.app/api/mcp
```

Let ChatGPT discover the OAuth configuration from the server. When the authorization window opens:

1. Enter your HackerOne username.
2. Enter your HackerOne API token.
3. Select **Verify & authorize ChatGPT**.
4. ChatGPT exchanges the authorization code using PKCE and then uses the resulting Bearer token for MCP requests.

No HackerOne API token needs to be pasted into ChatGPT's plugin configuration.

## Deploy your own copy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNightVibes33%2Fhackerone-mcp-server&project-name=hackerone-mcp-server&repository-name=hackerone-mcp-server)

The project is configured for Next.js on Vercel and pins its Functions to `iad1` so the regional OAuth Runtime Cache is shared consistently by the authorization, token, and MCP handlers.

## Local stdio setup

### 1. Get a HackerOne API token

Create an API token in HackerOne account settings.

### 2. Install and build the CLI

```bash
git clone https://github.com/NightVibes33/hackerone-mcp-server.git
cd hackerone-mcp-server
npm install
npm run build:cli
```

### 3. Add to an stdio MCP client

Set:

```text
H1_USERNAME=your-hackerone-username
H1_API_TOKEN=your-hackerone-api-token
```

Then launch:

```bash
node dist/index.js
```

## Tools

### Read

| Tool | Description |
|------|-------------|
| `search_reports` | Search and filter your reports by keyword, program, severity, or state |
| `get_report` | Get full report details including CVSS vector, bounty amounts, and attachments |
| `get_report_with_conversation` | Get a report with its triage conversation thread |
| `get_report_activities` | Get activity timeline including comments, state changes, and bounties |
| `list_programs` | List bug bounty programs you have access to |
| `get_program_details` | Get program policy, response times, and metrics |
| `get_program_scope` | Get in-scope assets for a program |
| `get_program_weaknesses` | Get accepted CWE/weakness types for a program |
| `get_earnings` | Get bounty earnings history |
| `get_hacker_profile` | Get HackerOne reputation, signal, impact, and rank |
| `get_balance` | Get current unpaid bounty balance |
| `analyze_report_patterns` | Analyze severity, state, program, and weakness patterns |
| `search_disclosed_reports` | Search publicly disclosed HackerOne reports |

### Write

| Tool | Description |
|------|-------------|
| `submit_report` | Submit a new vulnerability report |
| `add_comment` | Add a comment to one of your reports |
| `close_report` | Withdraw/close one of your own reports |

## Security model

- Remote ChatGPT access uses OAuth 2.1 + PKCE.
- OAuth bearer and refresh tokens are random opaque values.
- HackerOne credentials remain in server-side Runtime Cache while a grant is active.
- Authorization codes are short-lived and consumed after a successful PKCE exchange.
- Refresh tokens rotate when used.
- OAuth tokens are bound to the MCP resource and the ChatGPT client ID.
- Direct Basic auth is retained only for compatible non-ChatGPT clients.
- The local stdio mode reads HackerOne credentials from environment variables.

## License

MIT
