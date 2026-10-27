import { spawn } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { replyText } from "./render.mjs";
import {
  YouSpotError,
  agentRuns,
  ask,
  callSandboxTool,
  callTool,
  chat,
  cliConfig,
  configDir,
  directory,
  forgetConversation,
  getArtifact,
  index,
  listDocs,
  loadSession,
  login,
  logout,
  member,
  readDoc,
  readMarkdown,
  savedView,
  searchDocs,
  signup,
  systemClock,
  tools,
  view,
  whoami,
} from "./index.mjs";

class UsageError extends YouSpotError {}

class Cancelled extends Error {}

function usage(baseUrl, store) {
  return `youspot: the official CLI for YouSpot (${baseUrl})

Your account
  youspot signup                   Create an account from the terminal.
  youspot login                    Sign in through the browser.
  youspot whoami                   Who this terminal is signed in as.
  youspot logout                   Sign out and forget the saved session.
  youspot chat [message...]        Chat with your account. No message opens a prompt.

Public
  youspot ask <question...>        Ask about YouSpot. Answers come from its own pages.
  youspot docs <query...>          Search the developer docs.
  youspot read <path>              Read one page as markdown, e.g. /docs/mcp or /pricing.
  youspot pages                    Every page that can be read.
  youspot tools                    List the MCP tools. Needs no credential.
  youspot call <tool> [json]       Call one MCP tool. Needs a session or YOUSPOT_TOKEN.
  youspot sandbox <tool> [json]    Call one read tool against the demo account. No credential.
  youspot member <username>        One public member profile.
  youspot directory [--limit n]    A page of the public member directory.
  youspot index                    Every endpoint, and what each costs in credentials.

Options
  --json                           Print the raw JSON rather than text.
  --limit <n>                      How many results (ask, docs, directory).
  --no-browser                     login: print the link rather than opening it.
  --email <address>                signup: the account to create.
  --password <password>            signup: its password. YOUSPOT_PASSWORD works too.
  --code <code>                    signup: the code from the email.
  --accept-terms                   signup: accept the Terms of Service and Privacy Policy.
  --new                            chat: start a fresh conversation.
  --verbose                        chat: list the tools each turn called.
  --wait                           chat: wait for the agents you mentioned and print their replies.

Sessions are kept per server in ${store}.
YOUSPOT_BASE_URL picks the server, e.g. http://localhost:3001 for local development.
YOUSPOT_TOKEN, when set, is used by 'call' instead of the saved session.
`;
}

const VALUE_FLAGS = {
  "--limit": "limit",
  "--email": "email",
  "--password": "password",
  "--code": "code",
};
const SWITCHES = {
  "--json": "json",
  "--no-browser": "noBrowser",
  "--accept-terms": "acceptTerms",
  "--new": "fresh",
  "--verbose": "verbose",
  "--wait": "wait",
  "--help": "help",
  "-h": "help",
};

function parse(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const [arg, inline] =
      argv[i].startsWith("--") && argv[i].includes("=")
        ? [argv[i].slice(0, argv[i].indexOf("=")), argv[i].slice(argv[i].indexOf("=") + 1)]
        : [argv[i], undefined];
    if (arg in SWITCHES) flags[SWITCHES[arg]] = true;
    else if (arg in VALUE_FLAGS) {
      const value = inline ?? argv[(i += 1)];
      if (value === undefined) throw new UsageError(`${arg} needs a value.`);
      flags[VALUE_FLAGS[arg]] = arg === "--limit" ? Number(value) : value;
    } else positional.push(argv[i]);
  }
  return { flags, positional };
}

function textOf(result) {
  return (result?.content ?? [])
    .flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("\n\n");
}

function jsonArgs(json) {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    throw new UsageError(`Arguments must be JSON. Got: ${json}`);
  }
}

export function openBrowser(url, { platform = process.platform } = {}) {
  const [command, args] =
    platform === "darwin"
      ? ["open", [url]]
      : platform === "win32"
        ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {}
}

function askLine(question, { stdin, stderr }) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: stdin, output: stderr, terminal: true });
    let answered = false;
    rl.on("SIGINT", () => {
      answered = true;
      rl.close();
      reject(new Cancelled());
    });
    rl.on("close", () => {
      if (!answered) resolve(null);
    });
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(answer);
    });
  });
}

function askHidden(question, { stdin, stderr }) {
  return new Promise((resolve, reject) => {
    let value = "";
    const raw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stderr.write(question);
    const finish = (settle) => {
      stdin.setRawMode(raw);
      stdin.pause();
      stdin.off("data", onData);
      stderr.write("\n");
      settle();
    };
    function onData(chunk) {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004")
          return finish(() => resolve(value));
        if (char === "\u0003") return finish(() => reject(new Cancelled()));
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    }
    stdin.on("data", onData);
  });
}

function defaultPrompt(io) {
  return (question, { hidden = false } = {}) =>
    hidden && io.stdin.setRawMode ? askHidden(question, io) : askLine(question, io);
}

function createIo(overrides) {
  const stdin = overrides.stdin ?? process.stdin;
  const stdout = overrides.stdout ?? process.stdout;
  const stderr = overrides.stderr ?? process.stderr;
  const io = {
    env: overrides.env ?? process.env,
    fetch: overrides.fetch ?? globalThis.fetch,
    clock: overrides.clock ?? systemClock,
    open: overrides.open ?? openBrowser,
    stdin,
    stdout,
    stderr,
    interactive: overrides.interactive ?? Boolean(stdin.isTTY && stderr.isTTY),
  };
  io.prompt = overrides.prompt ?? defaultPrompt(io);
  return io;
}

function onInterrupt(controller) {
  const stop = () => controller.abort(new Cancelled());
  process.once("SIGINT", stop);
  return () => process.off("SIGINT", stop);
}

async function runLogin({ flags, io, baseUrl, dir }) {
  const controller = new AbortController();
  const release = onInterrupt(controller);
  try {
    const result = await login({
      baseUrl,
      fetch: io.fetch,
      clock: io.clock,
      signal: controller.signal,
      dir,
      onPending: ({ url, userCode }) => {
        const opening = !flags.noBrowser && io.interactive;
        io.stderr.write(
          `${opening ? "Opening" : "Open"} this link to sign in:\n  ${url}\n\nConfirm the code ${userCode} in your browser.\nWaiting for approval (Ctrl-C to stop)...\n`,
        );
        if (opening) io.open(url);
      },
    });
    io.stdout.write(`Signed in as ${result.email}\n`);
    return 0;
  } finally {
    release();
  }
}

async function readPassword(flags, io) {
  if (flags.password) return flags.password;
  if (io.env.YOUSPOT_PASSWORD) return io.env.YOUSPOT_PASSWORD;
  if (!io.interactive) {
    throw new UsageError("Pass --password or set YOUSPOT_PASSWORD when not running in a terminal.");
  }
  for (let tries = 0; tries < 3; tries += 1) {
    const first = await io.prompt("Password: ", { hidden: true });
    if (!first) continue;
    const second = await io.prompt("Password again: ", { hidden: true });
    if (first === second) return first;
    io.stderr.write("The passwords did not match. Try again.\n");
  }
  throw new YouSpotError("No password was set.", { code: "password_required" });
}

async function acceptTerms(flags, io, config) {
  const links = [
    config.terms_url && `Terms of Service: ${config.terms_url}`,
    config.privacy_url && `Privacy Policy: ${config.privacy_url}`,
  ].filter(Boolean);
  io.stderr.write(
    `Creating an account means accepting the YouSpot Terms of Service and Privacy Policy.\n${links.map((line) => `  ${line}\n`).join("")}`,
  );
  if (flags.acceptTerms) return;
  if (!io.interactive) throw new UsageError("Pass --accept-terms to accept them.");
  const answer = await io.prompt("Do you accept them? [y/N] ");
  if (!/^y(es)?$/i.test((answer ?? "").trim())) {
    throw new YouSpotError("No account was created: the terms were not accepted.", {
      code: "terms_not_accepted",
    });
  }
}

async function runSignup({ flags, io, baseUrl, dir }) {
  const config = await cliConfig({ baseUrl, fetch: io.fetch });
  if (!config.signup_available) {
    throw new YouSpotError(
      `Signing up from the terminal is not open right now. Create an account at ${baseUrl}/sign-up, then run 'youspot login'.`,
      { code: "signup_unavailable" },
    );
  }
  let email = flags.email;
  if (!email) {
    if (!io.interactive) throw new UsageError("Pass --email when not running in a terminal.");
    email = ((await io.prompt("Email: ")) ?? "").trim();
    if (!email) throw new UsageError("An email address is needed to create an account.");
  }
  const password = await readPassword(flags, io);
  await acceptTerms(flags, io, config);

  let first = true;
  const result = await signup({
    email,
    password,
    acceptTerms: true,
    baseUrl,
    fetch: io.fetch,
    dir,
    code: async ({ email: address, error, resent }) => {
      const fromFlag = first && flags.code;
      if (first && !flags.code && io.interactive)
        io.stderr.write(`We emailed a code to ${address}.\n`);
      first = false;
      if (fromFlag) return flags.code;
      if (!io.interactive) return null;
      if (error) io.stderr.write(`${error.message}\n`);
      if (resent) io.stderr.write(`We sent a new code to ${address}.\n`);
      return io.prompt("Code (or type resend): ");
    },
  });
  io.stdout.write(`${result.created ? "Account created for" : "Signed in as"} ${result.email}\n`);
  return 0;
}

function toolNames(answer) {
  return (answer.tool_calls ?? [])
    .map((call) => (typeof call === "string" ? call : call?.name))
    .filter(Boolean);
}

function artifactIds(html) {
  return [
    ...String(html ?? "").matchAll(
      /<ui-component\b(?=[^>]*\btype="artifact_card")[^>]*\bid="([^"]+)"/gi,
    ),
  ].map((match) => match[1]);
}

async function replyViews(answer, { io, baseUrl, dir }) {
  const ids = artifactIds(answer.reply);
  if (!ids.length) return;
  const token = loadSession(baseUrl, { dir })?.session_token;
  for (const id of ids) {
    const artifact = await getArtifact(id, { baseUrl, fetch: io.fetch, dir });
    if (artifact?.kind !== "view") continue;
    const shown = await savedView(artifact, { token, baseUrl, fetch: io.fetch });
    io.stdout.write(`\n${shown.text}\n`);
  }
}

const WAIT_INTERVAL_MS = 3000;
const WAIT_LIMIT_MS = 10 * 60 * 1000;

function dispatchLine(run) {
  return run.status === "running"
    ? `Sent to @${run.handle}. Working on it.`
    : `@${run.handle} could not start.`;
}

function printReply(row, { flags, io, baseUrl }) {
  if (flags.json) io.stdout.write(`${JSON.stringify(row)}\n`);
  else io.stdout.write(`@${row.author.handle}:\n${replyText(row.content, baseUrl)}\n`);
}

async function waitForReplies(runs, conversationId, context) {
  const { io, baseUrl, dir } = context;
  const pending = new Map(
    runs.filter((run) => run.status === "running").map((run) => [run.trace_id, run]),
  );
  let failed = runs.length > pending.size;
  let afterId;
  const deadline = io.clock.now() + WAIT_LIMIT_MS;
  while (pending.size && io.clock.now() < deadline) {
    await io.clock.sleep(WAIT_INTERVAL_MS);
    const page = await agentRuns(conversationId, { afterId, baseUrl, fetch: io.fetch, dir });
    const rows = page.messages ?? [];
    const dispatchRow = rows.find((row) =>
      (row.agent_runs ?? []).some((run) => pending.has(run.trace_id)),
    );
    const floor = afterId ?? dispatchRow?.id ?? 0;
    for (const row of rows) {
      if (row.author && row.id > floor) printReply(row, context);
      afterId = Math.max(afterId ?? 0, row.id);
    }
    for (const run of page.runs ?? []) {
      if (!pending.has(run.trace_id) || run.status === "running") continue;
      pending.delete(run.trace_id);
      if (run.status !== "replied") {
        failed = true;
        io.stderr.write(`@${run.handle} ${run.status}${run.reason ? ` (${run.reason})` : ""}.\n`);
      }
    }
  }
  if (pending.size) {
    io.stderr.write(
      `Still working after ${WAIT_LIMIT_MS / 60000} minutes: ${[...pending.values()].map((run) => `@${run.handle}`).join(", ")}. The reply will be in the thread at ${baseUrl}/chat.\n`,
    );
    return 1;
  }
  return failed ? 1 : 0;
}

async function turn(message, context) {
  const { flags, io, baseUrl, dir } = context;
  const answer = await chat(message, { baseUrl, fetch: io.fetch, dir });
  const runs = Array.isArray(answer.agent_runs) ? answer.agent_runs : [];
  if (flags.json) io.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
  else if (runs.length) io.stdout.write(`${runs.map(dispatchLine).join("\n")}\n`);
  else {
    io.stdout.write(`${replyText(answer.reply, baseUrl)}\n`);
    await replyViews(answer, context);
  }
  if (flags.verbose) {
    const names = toolNames(answer);
    io.stderr.write(`Tools: ${names.length ? names.join(", ") : "none"}\n`);
  }
  if (typeof answer.credits === "number") io.stderr.write(`Credits left: ${answer.credits}\n`);
  if (!runs.length) return 0;
  if (!flags.wait) return runs.some((run) => run.status !== "running") ? 1 : 0;
  return waitForReplies(runs, answer.conversation_id, context);
}

async function runRepl(context) {
  const { io, baseUrl, dir } = context;
  io.stderr.write(
    "Chatting with YouSpot. /new starts a fresh conversation, /exit or Ctrl-D leaves.\n",
  );
  const rl = createInterface({ input: io.stdin, output: io.stderr, terminal: true });
  rl.on("SIGINT", () => rl.close());
  rl.setPrompt("you> ");
  rl.prompt();
  for await (const line of rl) {
    const message = line.trim();
    if (message === "/exit") break;
    if (message === "/new") {
      forgetConversation(baseUrl, { dir });
      io.stderr.write("Started a new conversation.\n");
    } else if (message) {
      try {
        await turn(message, context);
      } catch (error) {
        if (!(error instanceof YouSpotError)) throw error;
        io.stderr.write(`${error.message}\n`);
        if (error.code === "not_signed_in" || error.code === "not_authenticated") {
          rl.close();
          return 1;
        }
      }
    }
    rl.prompt();
  }
  rl.close();
  return 0;
}

async function runChat(context, words) {
  const { flags, io, baseUrl, dir } = context;
  if (!loadSession(baseUrl, { dir })) {
    throw new YouSpotError(
      `Not signed in to ${baseUrl}. Run 'youspot login', or 'youspot signup' to create an account.`,
      { code: "not_signed_in" },
    );
  }
  if (flags.fresh) forgetConversation(baseUrl, { dir });
  const message = words.join(" ").trim();
  if (message) return turn(message, context);
  if (io.stdin.isTTY) return runRepl(context);
  const rl = createInterface({ input: io.stdin, terminal: false });
  let code = 0;
  for await (const line of rl) {
    if (line.trim()) code = Math.max(code, await turn(line.trim(), context));
  }
  return code;
}

async function dispatch(command, rest, context) {
  const { flags, io, baseUrl, dir } = context;
  const show = (value, render) => {
    if (flags.json) io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    else io.stdout.write(`${render(value)}\n`);
  };

  if (command === "login") return runLogin(context);
  if (command === "signup") return runSignup(context);
  if (command === "chat") return runChat(context, rest);

  if (command === "whoami") {
    const saved = loadSession(baseUrl, { dir });
    if (!saved) {
      throw new YouSpotError(
        `Not signed in to ${baseUrl}. Run 'youspot login' or 'youspot signup'.`,
        {
          code: "not_signed_in",
        },
      );
    }
    show(await whoami({ baseUrl, fetch: io.fetch, dir }), (value) =>
      [
        value.email,
        `Server: ${value.base_url}`,
        ...(typeof value.credits === "number"
          ? [`Credits: ${value.credits}${value.plan ? ` (${value.plan})` : ""}`]
          : []),
      ].join("\n"),
    );
    return 0;
  }

  if (command === "logout") {
    const result = await logout({ baseUrl, fetch: io.fetch, dir });
    io.stdout.write(
      result.signed_out
        ? `Signed out${result.email ? ` ${result.email}` : ""} from ${baseUrl}\n`
        : `Not signed in to ${baseUrl}\n`,
    );
    return 0;
  }

  if (command === "ask") {
    const question = rest.join(" ");
    if (!question) throw new UsageError('Ask a question: youspot ask "what does it cost"');
    const answer = await ask(question, { limit: flags.limit ?? 5 });
    show(answer, (value) =>
      value.results.length
        ? value.results
            .map((result) => `${result.name}\n${result.url}\n\n${result.description}`)
            .join("\n\n---\n\n")
        : `Nothing on ${baseUrl} matches that. Try 'youspot pages'.`,
    );
    return 0;
  }

  if (command === "docs") {
    const query = rest.join(" ");
    if (!query) throw new UsageError("Search for something: youspot docs oauth");
    show(await searchDocs(query, { limit: flags.limit ?? 5 }), textOf);
    return 0;
  }

  if (command === "read") {
    const [path] = rest;
    if (!path) throw new UsageError("Name a path: youspot read /docs/mcp");
    if (flags.json) show(await readDoc(path), textOf);
    else io.stdout.write(await readMarkdown(path));
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
    if (!name) throw new UsageError("Name a tool: youspot call get_connections_summary");
    const args = jsonArgs(json);
    const token = io.env.YOUSPOT_TOKEN || loadSession(baseUrl, { dir })?.session_token;
    show(await callTool(name, args, { token, baseUrl, fetch: io.fetch }), textOf);
    return 0;
  }

  if (command === "view") {
    const [name, json] = rest;
    if (!name) throw new UsageError("Name a tool: youspot view list_graph_objects");
    const args = jsonArgs(json);
    const token = io.env.YOUSPOT_TOKEN || loadSession(baseUrl, { dir })?.session_token;
    if (!token) {
      throw new YouSpotError(
        `Not signed in to ${baseUrl}. Run 'youspot login', or 'youspot signup' to create an account.`,
        { code: "not_signed_in" },
      );
    }
    show(await view(name, args, { token, baseUrl, fetch: io.fetch }), (value) => value.text);
    return 0;
  }

  if (command === "sandbox") {
    const [name, json] = rest;
    if (!name) throw new UsageError("Name a tool: youspot sandbox search_graph_objects");
    show(await callSandboxTool(name, jsonArgs(json)), textOf);
    return 0;
  }

  if (command === "member") {
    const [username] = rest;
    if (!username) throw new UsageError("Name a member: youspot member dharmesh");
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

  io.stderr.write(
    `Unknown command: ${command}\n\n${usage(baseUrl, join(dir, "credentials.json"))}`,
  );
  return 2;
}

export async function run(argv, overrides = {}) {
  const io = createIo(overrides);
  const baseUrl = (io.env.YOUSPOT_BASE_URL ?? "https://youspot.com").replace(/\/+$/, "");
  const dir = configDir(io.env);
  try {
    const { flags, positional } = parse(argv);
    const [command, ...rest] = positional;
    if (!command || flags.help) {
      io.stdout.write(usage(baseUrl, join(dir, "credentials.json")));
      return 0;
    }
    return await dispatch(command, rest, { flags, io, baseUrl, dir });
  } catch (error) {
    if (error instanceof Cancelled || error?.cause instanceof Cancelled) {
      io.stderr.write("\nCancelled.\n");
      return 130;
    }
    if (error instanceof YouSpotError) {
      io.stderr.write(`${error.message}\n`);
      return error instanceof UsageError ? 2 : 1;
    }
    throw error;
  }
}
