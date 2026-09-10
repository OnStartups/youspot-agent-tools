export const BASE_URL = process.env.YOUSPOT_BASE_URL ?? "https://youspot.com";
export const MCP_URL = `${BASE_URL}/mcp/v1`;
export const DOCS_MCP_URL = `${BASE_URL}/mcp/docs`;
export const SANDBOX_MCP_URL = `${BASE_URL}/mcp/sandbox`;

const USER_AGENT = "youspot-cli";

export class YouSpotError extends Error {
  constructor(message, { status, code, url } = {}) {
    super(message);
    this.name = "YouSpotError";
    this.status = status;
    this.code = code;
    this.url = url;
  }
}

async function request(url, { method = "GET", body, token } = {}) {
  const response = await fetch(url, {
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

async function rpc(url, method, params, token) {
  const body = { jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) };
  const answer = await request(url, { method: "POST", body, token });
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

export function callTool(name, args = {}, { token = process.env.YOUSPOT_TOKEN } = {}) {
  if (!token) {
    throw new YouSpotError(
      `Calling ${name} needs a token, because every tool reads one person's own CRM. Mint one at ${BASE_URL}/user/mcp and set YOUSPOT_TOKEN, or read ${BASE_URL}/auth.md for the OAuth flow.`,
      { code: "no_token" },
    );
  }
  return rpc(MCP_URL, "tools/call", { name, arguments: args }, token);
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
