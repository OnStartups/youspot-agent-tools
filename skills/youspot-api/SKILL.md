---
name: youspot-api
description: Call YouSpot over plain HTTP: public profile and directory endpoints with no auth, batched reads, the sandbox, and the MCP tool surface with a bearer token. Use when integrating without an MCP client, generating client code, or debugging a 401 or 429.
license: MIT
metadata:
  author: YouSpot, Inc.
  homepage: https://youspot.com/docs
  version: "1.1.0"
---

# YouSpot over HTTP

## Public, no auth

```bash
curl https://youspot.com/api/human/dharmesh.json
curl https://youspot.com/api/human/dharmesh.md
curl https://youspot.com/api/network/members
```

## Batch

Up to 20 GET reads in one round trip. Each item answers with its own `status` and `body`, in order, so one failure never hides the others.

```bash
curl -X POST https://youspot.com/api/batch \
  -H "Content-Type: application/json" \
  -d '{"requests":[{"id":"dir","path":"/api/network/members","query":{"q":"consulting"}},{"id":"me","path":"/api/human/dharmesh"}]}'
```

## Sandbox

Every anonymous path also answers under `https://youspot.com/sandbox`, where `/mcp/v1` is the demo-account MCP server: `tools/call` needs no credential and writes are refused. `GET https://youspot.com/sandbox` describes the mount and says whether the demo account is seeded.

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
