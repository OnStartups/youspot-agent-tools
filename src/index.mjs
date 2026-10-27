import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

export const BASE_URL = process.env.YOUSPOT_BASE_URL ?? "https://youspot.com";
export const MCP_URL = `${BASE_URL}/mcp`;
export const DOCS_MCP_URL = `${BASE_URL}/mcp/docs`;
export const SANDBOX_MCP_URL = `${BASE_URL}/mcp/sandbox`;

const USER_AGENT = "youspot-cli";
const HISTORY_LIMIT = 40;

export class YouSpotError extends Error {
  constructor(message, { status, code, url, body } = {}) {
    super(message);
    this.name = "YouSpotError";
    this.status = status;
    this.code = code;
    this.url = url;
    this.body = body;
  }
}

async function request(
  url,
  { method = "GET", body, token, fetch: fetchImpl = globalThis.fetch } = {},
) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new YouSpotError(
      `${url} answered ${response.status} with ${response.headers.get("content-type") ?? "no content type"} instead of JSON`,
      { status: response.status, url },
    );
  }

  if (!response.ok) {
    throw new YouSpotError(
      parsed.error_description ?? parsed.error ?? `${url} answered ${response.status}`,
      { status: response.status, code: parsed.error, url },
    );
  }
  return parsed;
}

async function rpc(url, method, params, token, fetchImpl) {
  const body = { jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) };
  const answer = await request(url, { method: "POST", body, token, fetch: fetchImpl });
  if (answer.error) {
    throw new YouSpotError(answer.error.message, { code: String(answer.error.code), url });
  }
  return answer.result;
}

export function index() {
  return request(`${BASE_URL}/v1`);
}

export function ask(query, { limit = 5 } = {}) {
  const params = new URLSearchParams({ query, limit: String(limit) });
  return request(`${BASE_URL}/ask?${params}`);
}

export function searchDocs(query, { limit = 5 } = {}) {
  return rpc(DOCS_MCP_URL, "tools/call", {
    name: "search_docs",
    arguments: { query, limit },
  });
}

export function readDoc(path) {
  return rpc(DOCS_MCP_URL, "tools/call", { name: "read_doc", arguments: { path } });
}

export function listDocs() {
  return rpc(DOCS_MCP_URL, "tools/call", { name: "list_docs", arguments: {} });
}

export async function readMarkdown(path) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const target = clean === "/" ? "/index.md" : `${clean.replace(/\.md$/, "")}.md`;
  const response = await fetch(`${BASE_URL}${target}`, {
    headers: { Accept: "text/markdown", "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new YouSpotError(`No page at ${target}`, { status: response.status, url: target });
  }
  return response.text();
}

export function tools() {
  return rpc(MCP_URL, "tools/list");
}

export function callTool(
  name,
  args = {},
  { token = process.env.YOUSPOT_TOKEN, baseUrl = BASE_URL, fetch: fetchImpl } = {},
) {
  if (!token) {
    throw new YouSpotError(
      `Calling ${name} needs a credential, because every tool reads one person's own CRM. Run 'youspot login' or 'youspot signup', or mint a token at ${baseUrl}/user/mcp and set YOUSPOT_TOKEN.`,
      { code: "no_token" },
    );
  }
  return rpc(`${baseUrl}/mcp`, "tools/call", { name, arguments: args }, token, fetchImpl);
}

export function sandboxTools() {
  return rpc(SANDBOX_MCP_URL, "tools/list");
}

export function callSandboxTool(name, args = {}) {
  return rpc(SANDBOX_MCP_URL, "tools/call", { name, arguments: args });
}

export function identity(type = "anonymous", { token } = {}) {
  return request(`${BASE_URL}/agent/identity`, { method: "POST", body: { type }, token });
}

export function member(username) {
  return request(`${BASE_URL}/api/human/${encodeURIComponent(username)}`);
}

export function directory({ limit = 20, page = 1 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), page: String(page) });
  return request(`${BASE_URL}/api/network/members?${params}`);
}

const MESSAGES = {
  unreachable: "Could not reach the server. Check your connection, or YOUSPOT_BASE_URL.",
  not_signed_in:
    "Not signed in here yet. Run 'youspot login', or 'youspot signup' to create an account.",
  not_authenticated: "The saved session has ended. Run 'youspot login' to sign in again.",
  session_expired: "This sign-in request expired. Run 'youspot login' again.",
  not_found: "This sign-in request no longer exists. Run 'youspot login' again.",
  already_claimed: "This sign-in request was already used. Run 'youspot login' again.",
  terms_not_accepted:
    "Creating an account needs you to accept the Terms of Service and Privacy Policy.",
  password_rejected: "That password was not accepted. Choose a longer, less common one.",
  account_exists: "An account already exists for that email.",
  email_invalid: "That does not look like an email address.",
  email_domain_blocked: "Accounts cannot be created with that email domain.",
  browser_required: "This account has to finish signing up in the browser.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  signup_unavailable:
    "Signing up from the terminal is not available right now. Sign up in the browser, then run 'youspot login'.",
  code_required: "Enter the code we emailed you.",
  code_incorrect: "That code is not right.",
  too_many_attempts: "Too many wrong codes. Run 'youspot signup' again for a new one.",
  code_expired: "That code expired. Run 'youspot signup' again for a new one.",
  signup_expired: "This sign-up expired. Run 'youspot signup' again.",
  beta_access_required: "Chat opens once your account is admitted to YouSpot.",
  insufficient_credits: "You are out of credits.",
  conversation_not_found:
    "That conversation was deleted. Run 'youspot chat --new' to start another.",
  conversation_busy: "Another message in this conversation is being answered.",
  duplicate_turn: "That question is already being answered.",
};

const HINTS = {
  account_exists: "Run 'youspot login' to sign in.",
  browser_required: "Run 'youspot login' to sign in with the browser instead.",
};

function codeOf(parsed) {
  if (typeof parsed.code === "string") return parsed.code;
  if (typeof parsed.error === "string" && !/\s/.test(parsed.error)) return parsed.error;
  return undefined;
}

function explain(parsed, code, status, url) {
  const own = typeof parsed.message === "string" && parsed.message.trim();
  const sentence =
    typeof parsed.error === "string" && /\s/.test(parsed.error) ? parsed.error : undefined;
  let message =
    own || MESSAGES[code] || sentence || parsed.error_description || `${url} answered ${status}`;
  if (code === "code_incorrect" && typeof parsed.attempts_left === "number") {
    const left = parsed.attempts_left;
    message = `${message} ${left} ${left === 1 ? "try" : "tries"} left.`;
  }
  if (HINTS[code] && !message.includes("youspot login")) message = `${message} ${HINTS[code]}`;
  return message;
}

async function send(
  path,
  {
    method = "GET",
    body,
    session,
    query,
    baseUrl = BASE_URL,
    fetch: fetchImpl = globalThis.fetch,
  } = {},
) {
  const url = `${baseUrl}${path}${query ? `?${new URLSearchParams(query)}` : ""}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(session ? { "X-AgentAI-User-Token": session } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new YouSpotError(MESSAGES.unreachable, { code: "unreachable", url });
  }
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new YouSpotError(
      `${url} answered ${response.status} with ${response.headers.get("content-type") ?? "no content type"} instead of JSON`,
      { status: response.status, url },
    );
  }
  if (!response.ok || parsed.success === false) {
    const code = codeOf(parsed);
    throw new YouSpotError(explain(parsed, code, response.status, url), {
      status: response.status,
      code,
      url,
      body: parsed,
    });
  }
  return parsed;
}

export function configDir(env = process.env) {
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "youspot");
}

function keyOf(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

function readStore(dir, name) {
  const path = join(dir, name);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new YouSpotError(`${path} is not valid JSON. Delete it and sign in again.`, {
      code: "store_corrupt",
    });
  }
}

function writeStore(dir, name, data) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const path = join(dir, name);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

function updateStore(dir, name, baseUrl, value) {
  const data = readStore(dir, name);
  if (value === undefined) {
    if (!(keyOf(baseUrl) in data)) return;
    delete data[keyOf(baseUrl)];
  } else data[keyOf(baseUrl)] = value;
  if (Object.keys(data).length) writeStore(dir, name, data);
  else rmSync(join(dir, name), { force: true });
}

export function loadSession(baseUrl = BASE_URL, { dir = configDir() } = {}) {
  return readStore(dir, "credentials.json")[keyOf(baseUrl)] ?? null;
}

export function saveSession(baseUrl, { session_token, email }, { dir = configDir() } = {}) {
  updateStore(dir, "credentials.json", baseUrl, {
    session_token,
    email,
    saved_at: new Date().toISOString(),
  });
  updateStore(dir, "conversations.json", baseUrl, undefined);
}

export function forgetSession(baseUrl = BASE_URL, { dir = configDir() } = {}) {
  updateStore(dir, "credentials.json", baseUrl, undefined);
  updateStore(dir, "conversations.json", baseUrl, undefined);
}

export function loadConversation(baseUrl = BASE_URL, { dir = configDir() } = {}) {
  return readStore(dir, "conversations.json")[keyOf(baseUrl)] ?? null;
}

export function forgetConversation(baseUrl = BASE_URL, { dir = configDir() } = {}) {
  updateStore(dir, "conversations.json", baseUrl, undefined);
}

function saveConversation(baseUrl, conversation, dir) {
  updateStore(dir, "conversations.json", baseUrl, {
    ...conversation,
    updated_at: new Date().toISOString(),
  });
}

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export const systemClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", stop);
        resolve();
      }, ms);
      function stop() {
        clearTimeout(timer);
        reject(signal.reason);
      }
      signal?.addEventListener("abort", stop, { once: true });
    }),
};

export function cliConfig({ baseUrl = BASE_URL, fetch } = {}) {
  return send("/api/cli/config", { baseUrl, fetch });
}

export function loginUrl(sessionId, baseUrl = BASE_URL) {
  return `${keyOf(baseUrl)}/cli/login?${new URLSearchParams({ session_id: sessionId })}`;
}

export async function login({
  baseUrl = BASE_URL,
  fetch,
  clock = systemClock,
  signal,
  clientName = `youspot CLI on ${hostname()}`,
  onPending = () => {},
  dir = configDir(),
} = {}) {
  const { verifier, challenge } = pkcePair();
  const started = await send("/api/cli/login/start", {
    method: "POST",
    body: { code_challenge: challenge, client_name: clientName },
    baseUrl,
    fetch,
  });
  const sessionId = started.session_id;
  await onPending({
    url: loginUrl(sessionId, baseUrl),
    userCode: started.user_code,
    expiresIn: started.expires_in,
  });
  const interval = Math.max(1, Number(started.interval) || 5) * 1000;
  const deadline = clock.now() + (Number(started.expires_in) || 600) * 1000;
  for (;;) {
    if (clock.now() >= deadline)
      throw new YouSpotError(MESSAGES.session_expired, { code: "session_expired" });
    await clock.sleep(interval, signal);
    const { status } = await send("/api/cli/login/status", {
      query: { session_id: sessionId },
      baseUrl,
      fetch,
    });
    if (status === "pending") continue;
    if (status === "expired" || status === "not_found") {
      const code = status === "expired" ? "session_expired" : "not_found";
      throw new YouSpotError(MESSAGES[code], { code });
    }
    if (status === "claimed")
      throw new YouSpotError(MESSAGES.already_claimed, { code: "already_claimed" });
    try {
      const claimed = await send("/api/cli/login/claim", {
        method: "POST",
        body: { session_id: sessionId, code_verifier: verifier },
        baseUrl,
        fetch,
      });
      saveSession(baseUrl, claimed, { dir });
      return { email: claimed.email, session_token: claimed.session_token };
    } catch (error) {
      if (error instanceof YouSpotError && error.code === "authorization_pending") continue;
      throw error;
    }
  }
}

export async function signup({
  email,
  password,
  acceptTerms = false,
  code,
  baseUrl = BASE_URL,
  fetch,
  dir = configDir(),
} = {}) {
  if (!acceptTerms)
    throw new YouSpotError(MESSAGES.terms_not_accepted, { code: "terms_not_accepted" });
  const started = await send("/api/cli/signup/start", {
    method: "POST",
    body: { email, password, accept_terms: true, entry_source: "cli" },
    baseUrl,
    fetch,
  });
  const address = started.email || email;
  let error;
  let attemptsLeft;
  let resent = false;
  for (;;) {
    const entered =
      typeof code === "function"
        ? await code({ email: address, error, attemptsLeft, resent })
        : error
          ? null
          : code;
    const value = typeof entered === "string" ? entered.trim() : "";
    if (!value) throw error ?? new YouSpotError(MESSAGES.code_required, { code: "code_required" });
    if (value.toLowerCase() === "resend") {
      await send("/api/cli/signup/resend", {
        method: "POST",
        body: { signup_id: started.signup_id },
        baseUrl,
        fetch,
      });
      error = undefined;
      resent = true;
      continue;
    }
    resent = false;
    try {
      const verified = await send("/api/cli/signup/verify", {
        method: "POST",
        body: { signup_id: started.signup_id, code: value },
        baseUrl,
        fetch,
      });
      saveSession(baseUrl, verified, { dir });
      return {
        email: verified.email,
        created: Boolean(verified.created),
        session_token: verified.session_token,
      };
    } catch (failure) {
      const retryable =
        typeof code === "function" &&
        failure instanceof YouSpotError &&
        failure.code === "code_incorrect" &&
        failure.body?.attempts_left !== 0;
      if (!retryable) throw failure;
      error = failure;
      attemptsLeft = failure.body?.attempts_left;
    }
  }
}

function requireSession(baseUrl, token, dir) {
  const session = token ?? loadSession(baseUrl, { dir })?.session_token;
  if (!session) throw new YouSpotError(MESSAGES.not_signed_in, { code: "not_signed_in" });
  return session;
}

export async function chat(
  message,
  { baseUrl = BASE_URL, fetch, token, fresh = false, dir = configDir() } = {},
) {
  const session = requireSession(baseUrl, token, dir);
  const previous = fresh ? null : loadConversation(baseUrl, { dir });
  const messages = [...(previous?.messages ?? []), { role: "user", content: message }].slice(
    -HISTORY_LIMIT,
  );
  const answer = await send("/api/youspot/chat", {
    method: "POST",
    body: {
      client: "cli",
      messages,
      ...(previous?.conversation_id ? { conversation_id: previous.conversation_id } : {}),
    },
    session,
    baseUrl,
    fetch,
  });
  saveConversation(
    baseUrl,
    {
      conversation_id: answer.conversation_id ?? previous?.conversation_id ?? null,
      messages: [...messages, { role: "assistant", content: answer.reply ?? "" }].slice(
        -HISTORY_LIMIT,
      ),
    },
    dir,
  );
  return answer;
}

export function agentRuns(
  conversationId,
  { afterId, baseUrl = BASE_URL, fetch, token, dir = configDir() } = {},
) {
  const session = requireSession(baseUrl, token, dir);
  return send("/api/youspot/chat/agent-runs", {
    query: {
      conversation_id: conversationId,
      ...(afterId ? { after_id: String(afterId) } : {}),
    },
    session,
    baseUrl,
    fetch,
  });
}

export async function whoami({ baseUrl = BASE_URL, fetch, token, dir = configDir() } = {}) {
  const session = requireSession(baseUrl, token, dir);
  const state = await send("/api/session", { session, baseUrl, fetch });
  if (!state.authenticated || !state.user?.email) {
    throw new YouSpotError(MESSAGES.not_authenticated, { code: "not_authenticated" });
  }
  return {
    email: state.user.email,
    credits: state.user.credits ?? null,
    plan: state.user.plan_tier ?? null,
    base_url: keyOf(baseUrl),
  };
}

export async function logout({ baseUrl = BASE_URL, fetch, dir = configDir() } = {}) {
  const saved = loadSession(baseUrl, { dir });
  if (!saved?.session_token) return { signed_out: false };
  await send("/api/auth/session/revoke", {
    method: "POST",
    session: saved.session_token,
    baseUrl,
    fetch,
  });
  forgetSession(baseUrl, { dir });
  return { signed_out: true, email: saved.email ?? null };
}

async function viewRuntime() {
  process.env.OPENUI_TELEMETRY_DISABLED = "1";
  return import("./views.generated.mjs");
}

export async function getArtifact(
  id,
  { baseUrl = BASE_URL, fetch, token, dir = configDir() } = {},
) {
  const session = requireSession(baseUrl, token, dir);
  const answer = await send(`/api/studio/artifacts/${encodeURIComponent(id)}`, {
    session,
    baseUrl,
    fetch,
  });
  return answer.artifact;
}

function readTools({ token, baseUrl, fetch }) {
  return rpc(`${baseUrl}/mcp`, "tools/list", undefined, token, fetch).then(
    (listed) =>
      new Set(
        (listed.tools ?? [])
          .filter((tool) => tool.annotations?.readOnlyHint === true)
          .map((tool) => tool.name),
      ),
  );
}

function viewTools({ token, baseUrl = BASE_URL, fetch }) {
  let readable;
  const results = new Map();
  return async (name, args = {}) => {
    readable ??= readTools({ token, baseUrl, fetch });
    if (!(await readable).has(name)) {
      throw new YouSpotError(`${name} changes data, so a view cannot run it.`, {
        code: "tool_not_read_only",
      });
    }
    const key = JSON.stringify([name, args]);
    if (!results.has(key)) results.set(key, callTool(name, args, { token, baseUrl, fetch }));
    const result = await results.get(key);
    if (result?.isError) {
      const text = (result.content ?? []).map((part) => part.text ?? "").join("\n");
      throw new YouSpotError(text || `${name} reported an error.`, { code: "tool_error" });
    }
    return result;
  };
}

async function laidOut(source, run, webUrl) {
  const runtime = await viewRuntime();
  const resolved = await runtime.resolveView(source, runtime.spec.schema, async (name, args) =>
    runtime.toolData(await run(name, args)),
  );
  return {
    source,
    errors: resolved.errors,
    web_url: webUrl,
    text: runtime.renderText(resolved.root, { webUrl }),
  };
}

export async function view(name, args = {}, { token, baseUrl = BASE_URL, fetch } = {}) {
  const runtime = await viewRuntime();
  const run = viewTools({ token, baseUrl, fetch });
  const sample = runtime.toolData(await run(name, args));
  const source = runtime.generateView({ tool: name, args, sample, cards: false });
  return {
    tool: name,
    arguments: args,
    ...(await laidOut(source, run, runtime.webViewUrl(baseUrl, name, args))),
  };
}

export async function savedView(artifact, { token, baseUrl = BASE_URL, fetch } = {}) {
  const href = artifact.open_url ?? `/chat?artifact=${encodeURIComponent(artifact.id)}`;
  const webUrl = href.startsWith("/") ? `${baseUrl}${href}` : href;
  const run = viewTools({ token, baseUrl, fetch });
  return {
    id: artifact.id,
    title: artifact.title,
    ...(await laidOut(artifact.source, run, webUrl)),
  };
}

export { replyText } from "./render.mjs";
