# youspot

The official CLI and SDK for [YouSpot](https://youspot.com), the AI-native personal CRM.

Node 18 or newer. No dependencies.

```bash
npx youspot ask "what does it cost"
npx youspot docs oauth pkce
npx youspot read /docs/mcp
npx youspot tools
```

Only `youspot call` needs a credential. Everything else reads pages that are already public.

## Commands

| Command                      | What it does                                                                                 | Credential      |
| ---------------------------- | -------------------------------------------------------------------------------------------- | --------------- |
| `youspot ask <question>`     | Asks about YouSpot. Answers are passages from its own pages, each with the URL it came from. | none            |
| `youspot docs <query>`       | Searches the developer docs over the documentation MCP server.                               | none            |
| `youspot read <path>`        | One page as markdown, for example `/docs/mcp` or `/pricing`.                                 | none            |
| `youspot pages`              | Every page that can be read.                                                                 | none            |
| `youspot tools`              | Lists the MCP tools on the product server.                                                   | none            |
| `youspot call <tool> [json]` | Calls one MCP tool.                                                                          | `YOUSPOT_TOKEN` |
| `youspot member <username>`  | One public member profile.                                                                   | none            |
| `youspot directory`          | A page of the public member directory.                                                       | none            |
| `youspot index`              | Every endpoint, and what each one costs in credentials.                                      | none            |

`--json` prints the raw response. `--limit n` applies to `ask`, `docs` and `directory`.

## Credentials

Every YouSpot tool reads or writes one person's own contacts, companies, notes and files, so
there is no service credential and no API key: a token always belongs to a person. Mint one at
[youspot.com/user/mcp](https://youspot.com/user/mcp) and set `YOUSPOT_TOKEN`, or follow the
OAuth 2.1 flow in [auth.md](https://youspot.com/auth.md).

## As a library

```js
import { ask, tools, callTool } from "youspot";

const answer = await ask("how do I connect a client");
const available = await tools();
const summary = await callTool("get_connections_summary", {}, { token });
```

`YOUSPOT_BASE_URL` overrides the origin, for anyone running YouSpot elsewhere.

## Install an agent skill

List the skills in the official public repository:

```bash
bunx skills add OnStartups/youspot-agent-tools --list
```

Install only the skill you need into your current project:

```bash
bunx skills add OnStartups/youspot-agent-tools --skill youspot-mcp
```

The CLI prompts for the target agent. The available skills are:

- `youspot-mcp`: connect an MCP client and work with a member's CRM using OAuth.
- `youspot-api`: use the public HTTP endpoints and documentation.
- `youspot-solo-crm-playbook`: organize a personal CRM and plan follow-ups.

Replace `youspot-mcp` in the command with another name from this list. Installing a skill
adds instructions to your agent; it does not grant access to a YouSpot account or register
the repository with skills.sh. A skills.sh listing is separate from these source files.

## What is in this package

- `bin/youspot.mjs`, `src/index.mjs`: the CLI and the SDK.
- `plugin.json` and `mcp.json`: the [Agent Plugins](https://agent-plugins.org) 1.0.0 manifest
  and the MCP server list it points at (both servers, streamable HTTP). The skills are
  discovered from `skills/`, as the spec reads them.
- `AGENTS.md`, `.cursorrules`: instructions for coding agents.
- `skills/`: the three agent skills, byte-identical to the ones served at
  `youspot.com/.well-known/agent-skills/`.

`AGENTS.md`, `.cursorrules` and `skills/` are generated, not hand-written. The site publishes a
sha256 of each skill's served bytes, so a hand-copied file here would eventually disagree with
the digest on the site and with every client that verifies it. Regenerate with
`bun run sync:agent-tools` from the repo root. CI runs `check:agent-tools` and fails if they
have drifted. It runs there rather than in the frontend build because `.vercelignore` excludes
`*.md`, so on Vercel these four files are not in the build context at all.

## Publishing

The source of truth is `packages/youspot-agent-tools` in a private monorepo. This repo is its
public mirror, and npm is published from here, so that `repository` and `homepage` both resolve:
those two links are how an agent tells the official package from a lookalike.

```bash
npm login
npm publish
```

Nothing publishes automatically. To refresh the mirror after a change upstream, run
`bun run sync:agent-tools` in the monorepo, then copy this directory over and commit.
