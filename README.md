# youspot

The official CLI and SDK for [YouSpot](https://youspot.com), the AI-native personal CRM.

Node 18 or newer. No dependencies.

```bash
bunx youspot ask "what does it cost"
bunx youspot docs oauth pkce
bunx youspot read /docs/mcp
bunx youspot tools
```

Sign up or sign in once, then chat with your account from the terminal:

```bash
bunx youspot signup
bunx youspot chat "who do I know at Acme?"
```

The account commands and `youspot call` need a session. Everything else reads pages that are
already public.

## Commands

| Command                      | What it does                                                                                 | Credential                    |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------- |
| `youspot signup`             | Creates an account: email, password, the emailed code. Saves the session.                    | none                          |
| `youspot login`              | Signs in through the browser with a one-time code. Saves the session.                        | none                          |
| `youspot whoami`             | The account this terminal is signed in as, checked with the server.                          | session                       |
| `youspot logout`             | Ends the session on the server, then deletes it here.                                        | session                       |
| `youspot chat [message]`     | Chats with your account. One message, a prompt (`you> `), or one turn per line of stdin.     | session                       |
| `youspot ask <question>`     | Asks about YouSpot. Answers are passages from its own pages, each with the URL it came from. | none                          |
| `youspot docs <query>`       | Searches the developer docs over the documentation MCP server.                               | none                          |
| `youspot read <path>`        | One page as markdown, for example `/docs/mcp` or `/pricing`.                                 | none                          |
| `youspot pages`              | Every page that can be read.                                                                 | none                          |
| `youspot tools`              | Lists the MCP tools on the product server.                                                   | none                          |
| `youspot call <tool> [json]` | Calls one MCP tool.                                                                          | `YOUSPOT_TOKEN`, else session |
| `youspot member <username>`  | One public member profile.                                                                   | none                          |
| `youspot directory`          | A page of the public member directory.                                                       | none                          |
| `youspot index`              | Every endpoint, and what each one costs in credentials.                                      | none                          |

`--json` prints the raw response. `--limit n` applies to `ask`, `docs` and `directory`.
Results go to stdout and messages to stderr. The exit code is 0 on success, 1 on a failure and
2 on a usage error (130 when Ctrl-C stops a sign-in).

### Signing in

`youspot login` prints a link and a code such as `ABCD-EFGH`, opens the link in your browser
(`--no-browser`, or no terminal, only prints it), and waits. Approve the request on the page
once the code matches, and the terminal prints `Signed in as <email>`.

`youspot signup` asks for an email, a password (twice, never shown) and your acceptance of the
Terms of Service and Privacy Policy, then for the code we email you. Type `resend` at the code
prompt for a new one. Every answer can come from a flag instead, so it also runs with no
terminal at all:

```bash
youspot signup --email you@example.com --password "$PASSWORD" --code 123456 --accept-terms
```

`YOUSPOT_PASSWORD` works in place of `--password`, which keeps the password out of your shell
history.

### Chatting

```bash
youspot chat "what needs my attention today?"
youspot chat                       # a prompt; /new starts over, /exit or Ctrl-D leaves
printf 'first\nsecond\n' | youspot chat   # one turn per line
youspot chat --new "start over"
youspot chat --verbose "find Dana"  # also lists the tools each turn called
youspot chat "@research what changed at Acme this week?"  # hands it to that agent
youspot chat --wait "@research what changed at Acme this week?"  # and waits for the reply
```

The conversation continues across runs until `--new`. Credits left print on stderr after
each turn.

## Credentials

Every YouSpot tool reads or writes one person's own contacts, companies, notes and files, so
a credential always belongs to a person.

`youspot login` and `youspot signup` save a revocable session in
`${XDG_CONFIG_HOME:-~/.config}/youspot/credentials.json` (mode 0600, in a 0700 directory),
keyed by server so a local and a production session live side by side. The conversation
history sits next to it in `conversations.json`. `youspot logout` revokes the session and
deletes both.

For `youspot call` you can also mint a named token at
[youspot.com/user/integrations/mcp](https://youspot.com/user/integrations/mcp) and set `YOUSPOT_TOKEN`, which wins over a
saved session, or follow the OAuth 2.1 flow in [auth.md](https://youspot.com/auth.md).

`YOUSPOT_BASE_URL` picks the server, for example `http://localhost:3001` against a local
stack. The sign-in link is built from it too.

## Testing and evals

Headless runs work end to end with flags and environment variables. Against a development
server, whose sign-in runs on a Clerk development instance, any address containing
`+clerk_test` is a test address: Clerk sends no email and accepts the fixed code `424242`.

```bash
export YOUSPOT_BASE_URL=http://localhost:3001
youspot signup --email "eval+clerk_test@example.com" --password "$EVAL_PASSWORD" --code 424242 --accept-terms
youspot chat --new --json "what can you do?"
youspot logout
```

Point `XDG_CONFIG_HOME` at a scratch directory to keep an eval's session apart from your own.

## As a library

```js
import { ask, tools, callTool, login, signup, chat } from "youspot";

const answer = await ask("how do I connect a client");
const available = await tools();
const summary = await callTool("get_connections_summary", {}, { token });

await signup({ email, password, acceptTerms: true, code: "424242" });
const { reply, conversation_id } = await chat("who do I know at Acme?");
```

`login`, `signup` and `chat` take `baseUrl`, `fetch` and `dir` (where sessions are saved);
`login` also takes a `clock` and an `onPending({ url, userCode })` callback, and `signup`
takes `code` as a string or as a function that is asked for each attempt.

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

The CLI prompts for the target agent. These skills are authored by YouSpot, Inc. for
[youspot.com](https://youspot.com), and maintained together in this public repository:

| Skill                       | Use it for                                                                                     | Source                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `youspot-mcp`               | OAuth setup, Brain and LinkedIn searches, attention review, interaction logging and follow-ups | [SKILL.md](skills/youspot-mcp/SKILL.md)               |
| `youspot-api`               | Public HTTP reads, batched reads, sandbox, MCP JSON-RPC and authentication errors              | [SKILL.md](skills/youspot-api/SKILL.md)               |
| `youspot-solo-crm-playbook` | Daily relationship reviews, meeting briefs and confirmed next steps                            | [SKILL.md](skills/youspot-solo-crm-playbook/SKILL.md) |

Replace `youspot-mcp` in the install command with another name from this table. The default
install is project-local; add `--agent <agent-name>` to choose an agent explicitly. Installing
a skill adds instructions, not account access. Product tool calls still need the member's
consent and credential and may consume credits.

The site also serves the [skill index](https://youspot.com/.well-known/agent-skills/index.json)
with content digests. The [youspot-mcp listing on skills.sh](https://skills.sh/onstartups/youspot-agent-tools/youspot-mcp)
is another discovery path; skills.sh classification is not a substitute for checking the publisher and source.

## What is in this package

- `bin/youspot.mjs`, `src/cli.mjs`, `src/index.mjs`: the CLI and the SDK. `test/` holds their tests (`bun test`).
- `plugin.json` and `mcp.json`: the [Agent Plugins](https://agent-plugins.org) 1.0.0 manifest
  and the MCP server list it points at (both servers, streamable HTTP). The skills are
  discovered from `skills/`, as the spec reads them.
- `AGENTS.md`, `.cursorrules`: instructions for coding agents.
- `skills/`: the three agent skills, byte-identical to the ones served at
  `youspot.com/.well-known/agent-skills/`.

`AGENTS.md`, `.cursorrules` and `skills/` are generated, not hand-written. Skill bodies and
index descriptions come from `frontend/lib/agent/skills.ts` in the source monorepo. The site
computes a sha256 of each served skill, so edit the source and regenerate with
`bun run sync:agent-tools` from the monorepo root instead of editing generated files alone.
CI runs `check:agent-tools` and fails if they drift. This check runs outside the frontend
build because `.vercelignore` excludes `*.md` from Vercel's build context.

## Publishing and skills.sh discovery

The source of truth is `packages/youspot-agent-tools` in the private monorepo. Its public
mirror is [OnStartups/youspot-agent-tools](https://github.com/OnStartups/youspot-agent-tools).
All three skills belong in that one repository. No additional repository or npm release is
needed for the Skills CLI to install them from GitHub.

Publication is manual and separate from local edits:

1. Merge the reviewed source changes to the monorepo's `main` branch. Regenerate from that
   published source with `bun run sync:agent-tools`, then copy only this package's public
   contents to the existing mirror. Do not copy private monorepo files or internal plugins.
2. Review the mirror diff and publish it with the maintainer's approval. Deploy the matching
   site source so its served skills and digests agree with the mirror.
3. After the mirror is current, list its skills with
   `bunx skills add OnStartups/youspot-agent-tools --list`, then install the desired skill with
   `bunx skills add OnStartups/youspot-agent-tools --skill youspot-mcp`.
4. Check the corresponding skills.sh listing after real installations. The
   [skills.sh FAQ](https://skills.sh/docs/faq) says listings appear automatically through
   anonymous installation telemetry, with no manual registry submission. Listing with
   `--list` is not an installation; telemetry-disabled installs do not contribute to indexing.
   Do not generate artificial installs to influence counts. The directory does not document
   a guaranteed indexing time or an automatic official-publisher badge.

Publishing the `youspot` CLI/SDK to npm is a separate maintainer-controlled release, with
package versioning and registry credentials. It is not a prerequisite for GitHub skill
installation or skills.sh discovery.
