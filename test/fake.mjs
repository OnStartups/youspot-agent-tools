import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

export const BASE = "http://localhost:3001";

export function fakeServer(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const key = `${init.method ?? "GET"} ${parsed.pathname}`;
    const call = {
      key,
      url: parsed,
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const handler = routes[key];
    if (!handler)
      return new Response(JSON.stringify({ success: false, error: "no_route" }), { status: 404 });
    const answer = typeof handler === "function" ? await handler(call, calls) : handler;
    const [status, body] = Array.isArray(answer) ? answer : [200, answer];
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch, calls, called: (key) => calls.filter((call) => call.key === key) };
}

export function sink() {
  const out = { text: "", write: (chunk) => ((out.text += chunk), true) };
  return out;
}

export function fakeClock() {
  const clock = { time: 0, sleeps: [] };
  clock.now = () => clock.time;
  clock.sleep = async (ms) => {
    clock.sleeps.push(ms);
    clock.time += ms;
  };
  return clock;
}

export function home() {
  return mkdtempSync(join(tmpdir(), "youspot-cli-"));
}

export function setup({ routes, env = {}, interactive = false, answers = [], stdin } = {}) {
  const server = fakeServer(routes);
  const config = home();
  const stdout = sink();
  const stderr = sink();
  const opened = [];
  const asked = [];
  const clock = fakeClock();
  const pending = [...answers];
  const io = {
    env: { YOUSPOT_BASE_URL: BASE, XDG_CONFIG_HOME: config, ...env },
    fetch: server.fetch,
    clock,
    open: (url) => opened.push(url),
    stdout,
    stderr,
    stdin: stdin ? Readable.from(stdin) : Readable.from([]),
    interactive,
    prompt: async (question, options = {}) => {
      asked.push({ question, hidden: Boolean(options.hidden) });
      return pending.length ? pending.shift() : null;
    },
  };
  return { server, io, config, dir: join(config, "youspot"), stdout, stderr, opened, asked, clock };
}
