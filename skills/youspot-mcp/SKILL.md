---
name: youspot-mcp
description: Connect to the YouSpot MCP server and read or write the signed-in member's personal CRM.
---

# YouSpot over MCP

YouSpot is a personal CRM. Its MCP server is at `https://youspot.com/mcp`, streamable HTTP transport, OAuth 2.1 with PKCE S256 and dynamic client registration.

## Connect

```bash
claude mcp add --transport http youspot https://youspot.com/mcp
```

Claude and ChatGPT both register dynamically: paste the URL as a custom connector and approve the consent screen. Cursor takes the same URL in `~/.cursor/mcp.json`.

## When to reach for it

- The question is about people or companies the member already knows, not the public web.
- The member asks what needs attention: unanswered threads, stale follow-ups, upcoming meetings.
- Something just happened (a call, an email) and it should be logged with a follow-up.
- The answer lives in their Gmail, Google Calendar, HubSpot portal or imported LinkedIn network.

## Rules

- Every tool call is scoped to the signed-in member. There is no cross-account read, so never claim to search "everyone on YouSpot".
- Read tools are free to call. Confirm before a write, because writes land in the member's real CRM.
- Tool failures come back as a result with `isError` set, not an HTTP error. Read the message.
- Tool calls are metered against a monthly credit budget. If credits run out the error says so.

## Docs

https://youspot.com/docs/mcp.md
