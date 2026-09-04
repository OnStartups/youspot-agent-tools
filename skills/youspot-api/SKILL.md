---
name: youspot-api
description: Call YouSpot over plain HTTP: public profile endpoints with no auth, and the tool surface with a bearer token.
---

# YouSpot over HTTP

## Public, no auth

```bash
curl https://youspot.com/api/human/dharmesh.json
curl https://youspot.com/api/human/dharmesh.md
curl https://youspot.com/api/network/members
```

## Authenticated

The tool surface is JSON-RPC over HTTP POST to `https://youspot.com/mcp`.

```bash
curl -X POST https://youspot.com/mcp \
  -H "Authorization: Bearer $YOUSPOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A member mints `$YOUSPOT_TOKEN` on the MCP tab at `https://youspot.com/user/integrations/mcp`. An OAuth 2.1 access token works the same way.

## Discovery

- `https://youspot.com/.well-known/oauth-authorization-server`
- `https://youspot.com/.well-known/oauth-protected-resource`
- `https://youspot.com/llms.txt`

Any page also answers markdown: add `.md`, or send `Accept: text/markdown`.

## Docs

https://youspot.com/docs/api.md
