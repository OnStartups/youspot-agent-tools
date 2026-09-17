# YouSpot for agents

> YouSpot is a personal CRM for AI-native professionals. It builds a second brain from the people, companies, notes and files you already deal with, syncing Gmail, Google Calendar, HubSpot, X and LinkedIn into one graph you can ask in plain English. YouSpot Free is $0 a month with no credit card, YouSpot Pro is $10 a month, and there are no seats to count. YouSpot Pro, 30 days free is $0 today at /pricing/freetrial. Card required. Then $10/month from day 31. Cancel before that and you pay nothing.

## Start here

The handshake needs no credential, so this runs as-is:

```bash
curl -X POST https://youspot.com/mcp/v1 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Every tool call needs a bearer token, because every tool reads one
person's own CRM. [auth.md](https://youspot.com/auth.md) is the walkthrough.

## Endpoints

- `POST https://youspot.com/mcp/v1`: MCP server, JSON-RPC over streamable HTTP
- `GET https://youspot.com/llms.txt`: this site, for language models
- `GET https://youspot.com/llms-full.txt`: the long-form version
- `GET https://youspot.com/sitemap.xml`: every public page with a last-modified date
- `GET https://youspot.com/index.md`: the home page as markdown
- `GET https://youspot.com/agents.md`: what an agent can do here, in one page
- `GET https://youspot.com/.well-known/mcp/server-card.json`: the endpoint, transport and every tool
- `GET https://youspot.com/.well-known/mcp.json`: every MCP server on this domain, each with its own card
- `GET https://youspot.com/auth.md`: how an agent gets a credential
- `GET https://youspot.com/agent/identity`: what identity you can hold here, and who you are holding
- `GET https://youspot.com/openapi.json`: every HTTP endpoint that exists
- `GET https://youspot.com/plugin.json`: both MCP servers and the skills, in one bundle
- `GET https://youspot.com/.well-known/ai-plugin.json`: the OpenAI manifest, naming the OpenAPI spec, the OAuth endpoints and the logo
- `GET https://youspot.com/.well-known/api-catalog`: RFC 9727
- `GET https://youspot.com/v1`: every endpoint, and what each one costs in credentials
- `GET https://youspot.com/mcp/docs`: the public pages over MCP, no credential at all
- `GET https://youspot.com/mcp/sandbox`: the read tools over a demo account, no credential and no signup
- `GET https://youspot.com/sandbox`: the sandbox described: what is mounted under /sandbox, and whether the demo account is seeded
- `GET https://youspot.com/ask`: a question in plain words, answered from these pages
- `GET https://youspot.com/.well-known/agent-card.json`: JSON-RPC at /a2a
- `GET https://youspot.com/.well-known/oauth-authorization-server`: RFC 8414
- `GET https://youspot.com/.well-known/oauth-protected-resource`: RFC 9728
- `GET https://youspot.com/.well-known/agent-skills/index.json`: skills an agent can load
- `GET https://youspot.com/.well-known/ard.json`: agent resource discovery
- `GET https://youspot.com/.well-known/ucp`: what an agent can transact with here, and what it cannot
- `GET https://youspot.com/.well-known/security.txt`: how to report a vulnerability
- `GET https://youspot.com/.well-known/http-message-signatures-directory`: the key YouSpot agents sign their own requests with
- `POST https://youspot.com/api/batch`: up to 20 GET reads in one round trip, each with its own status and body
- `POST https://youspot.com/sandbox/mcp/v1`: the sandbox mount, where tools/call needs no credential and writes are refused

## Authentication

OAuth 2.1, one scope (`linkedin`), bound to one member per token.

- `POST https://youspot.com/oauth/register`: dynamic client registration (RFC 7591)
- `GET https://youspot.com/oauth/authorize`: consent, PKCE S256 required
- `POST https://youspot.com/oauth/token`: code exchange and refresh, refresh tokens rotate

Send `Authorization: Bearer <token>`. A member can also mint a named API token at https://youspot.com/user/integrations/mcp.

A missing or expired bearer returns `401` with `WWW-Authenticate: Bearer`, naming `https://youspot.com/.well-known/oauth-protected-resource`.

## Capabilities

- **Brain graph**: Search, read and write people, companies, notes and files in the graph.
- **Attention**: Unanswered threads, stale follow-ups, upcoming meetings.
- **LinkedIn**: Query imported connections and the companies behind them.
- **Gmail**: Read threads, draft and send from a connected mailbox.
- **Google Calendar**: Read events for context on a meeting.
- **HubSpot**: Read and sync contacts and companies with a connected portal.
- **Company research**: Research a company and file the result.
- **Prospecting**: Find people and companies matching a description.
- **Files and imports**: Import a file and read what was extracted.
- **Domains**: Value and suggest domain names.
- **Slack, X/Twitter, Obsidian**: Read from the other connected sources.

## When to use it

- Look up a person or company in the signed-in member's own network, not the public web.
- Answer "who do I know at X?" across imported LinkedIn connections, contacts and companies.
- Log an interaction and set a follow-up after a call or an email.
- Read what needs attention today: unanswered threads, stale follow-ups, upcoming meetings.
- Draft and send email from a connected Gmail mailbox, or read a calendar for context.
- Sync a contact or company both ways with a connected HubSpot portal.
- Search the member's Brain graph (notes, files, objects) and cite the objects behind the answer.

## Pricing

- YouSpot Free: $0 per month, 50 credits/month, no credit card
- YouSpot Pro: $10 per month, 1,000 credits/month

## Links

- [Docs](https://youspot.com/docs)
- [MCP setup](https://youspot.com/docs/mcp.md)
- [Authentication](https://youspot.com/docs/authentication.md)
- [Home as markdown](https://youspot.com/index.md)
- [Every page](https://youspot.com/sitemap.xml)
