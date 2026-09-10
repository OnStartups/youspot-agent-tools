#!/usr/bin/env node
import {
  BASE_URL,
  YouSpotError,
  ask,
  callSandboxTool,
  callTool,
  directory,
  index,
  listDocs,
  member,
  readDoc,
  readMarkdown,
  searchDocs,
  tools,
} from "../src/index.mjs";

const USAGE = `youspot: the official CLI for YouSpot (${BASE_URL})

  youspot ask <question...>        Ask about YouSpot. Answers come from its own pages.
  youspot docs <query...>          Search the developer docs.
  youspot read <path>              Read one page as markdown, e.g. /docs/mcp or /pricing.
  youspot pages                    Every page that can be read.
  youspot tools                    List the MCP tools. Needs no credential.
  youspot call <tool> [json]       Call one MCP tool. Needs YOUSPOT_TOKEN.
  youspot sandbox <tool> [json]    Call one read tool against the demo account. No credential.
  youspot member <username>        One public member profile.
  youspot directory [--limit n]    A page of the public member directory.
  youspot index                    Every endpoint, and what each costs in credentials.

Options
  --json                           Print the raw JSON rather than text.
  --limit <n>                      How many results (ask, docs, directory).

A token is only ever needed for 'call'. Everything else is public.
Mint one at ${BASE_URL}/user/mcp, or read ${BASE_URL}/auth.md for the OAuth flow.
`;

function parse(argv) {
  const flags = { json: false, limit: undefined };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--limit") {
      i += 1;
      flags.limit = Number(argv[i]);
    } else if (arg === "--help" || arg === "-h") flags.help = true;
    else positional.push(arg);
  }
  return { flags, positional };
}

function textOf(result) {
  return (result?.content ?? [])
    .flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("\n\n");
}

async function main() {
  const { flags, positional } = parse(process.argv.slice(2));
  const [command, ...rest] = positional;

  if (!command || flags.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const show = (value, render) => {
    if (flags.json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    else process.stdout.write(`${render(value)}\n`);
  };

  if (command === "ask") {
    const question = rest.join(" ");
    if (!question) throw new YouSpotError('Ask a question: youspot ask "what does it cost"');
    const answer = await ask(question, { limit: flags.limit ?? 5 });
    show(answer, (value) =>
      value.results.length
        ? value.results
            .map((result) => `${result.name}\n${result.url}\n\n${result.description}`)
            .join("\n\n---\n\n")
        : `Nothing on ${BASE_URL} matches that. Try 'youspot pages'.`,
    );
    return 0;
  }

  if (command === "docs") {
    const query = rest.join(" ");
    if (!query) throw new YouSpotError("Search for something: youspot docs oauth");
    show(await searchDocs(query, { limit: flags.limit ?? 5 }), textOf);
    return 0;
  }

  if (command === "read") {
    const [path] = rest;
    if (!path) throw new YouSpotError("Name a path: youspot read /docs/mcp");
    if (flags.json) show(await readDoc(path), textOf);
    else process.stdout.write(await readMarkdown(path));
    return 0;
  }

  if (command === "pages") {
    show(await listDocs(), textOf);
    return 0;
  }

  if (command === "tools") {
    show(await tools(), (value) =>
      value.tools.map((tool) => `${tool.name}\n  ${tool.description}`).join("\n\n"),
    );
    return 0;
  }

  if (command === "call") {
    const [name, json] = rest;
    if (!name) throw new YouSpotError("Name a tool: youspot call get_connections_summary");
    let args = {};
    if (json) {
      try {
        args = JSON.parse(json);
      } catch {
        throw new YouSpotError(`Arguments must be JSON. Got: ${json}`);
      }
    }
    show(await callTool(name, args), textOf);
    return 0;
  }

  if (command === "sandbox") {
    const [name, json] = rest;
    if (!name) throw new YouSpotError("Name a tool: youspot sandbox search_graph_objects");
    let args = {};
    if (json) {
      try {
        args = JSON.parse(json);
      } catch {
        throw new YouSpotError(`Arguments must be JSON. Got: ${json}`);
      }
    }
    show(await callSandboxTool(name, args), textOf);
    return 0;
  }

  if (command === "member") {
    const [username] = rest;
    if (!username) throw new YouSpotError("Name a member: youspot member dharmesh");
    show(await member(username), (value) =>
      [value.name, value.username, value.linkedin_profile_url].filter(Boolean).join("\n"),
    );
    return 0;
  }

  if (command === "directory") {
    show(await directory({ limit: flags.limit ?? 20 }), (value) =>
      value.members
        .map(
          (entry) =>
            `${entry.name} (${entry.username})${entry.headline ? `\n  ${entry.headline}` : ""}`,
        )
        .join("\n"),
    );
    return 0;
  }

  if (command === "index") {
    show(await index(), (value) =>
      value.endpoints
        .map(
          (endpoint) =>
            `${endpoint.method} ${endpoint.url}\n  auth: ${endpoint.auth}\n  ${endpoint.description}`,
        )
        .join("\n\n"),
    );
    return 0;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
  return 2;
}

try {
  process.exit(await main());
} catch (error) {
  if (error instanceof YouSpotError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
