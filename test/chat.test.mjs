import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../src/cli.mjs";
import { saveSession } from "../src/index.mjs";
import { BASE, setup } from "./fake.mjs";

function chatRoutes() {
  let turn = 0;
  return {
    "POST /api/youspot/chat": (call) => {
      turn += 1;
      return {
        success: true,
        reply: `reply ${turn}`,
        conversation_id: call.body.conversation_id ?? `cht_${turn}`,
        tool_calls: turn === 1 ? ["search_graph_objects"] : [],
        credits: 50 - turn,
        model_label: "Default",
      };
    },
    "POST /api/auth/session/revoke": { success: true, revoked: true },
    "POST /mcp": {
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: "tool ok" }] },
    },
    "GET /api/session": {
      success: true,
      authenticated: true,
      user: { email: "ada@acme.com", credits: 12, plan_tier: "free" },
    },
  };
}

function signedIn(options = {}) {
  const t = setup({ routes: chatRoutes(), ...options });
  saveSession(BASE, { session_token: "ses_saved", email: "ada@acme.com" }, { dir: t.dir });
  return t;
}

describe("youspot chat", () => {
  test("continues the stored conversation on the next run and --new starts over", async () => {
    const t = signedIn();
    expect(await run(["chat", "hello", "there"], t.io)).toBe(0);
    expect(await run(["chat", "and", "again"], t.io)).toBe(0);
    expect(await run(["chat", "--new", "fresh"], t.io)).toBe(0);

    const [first, second, third] = t.server.called("POST /api/youspot/chat");
    expect(first.headers["X-AgentAI-User-Token"]).toBe("ses_saved");
    expect(first.body).toEqual({
      client: "cli",
      messages: [{ role: "user", content: "hello there" }],
    });
    expect(second.body).toEqual({
      client: "cli",
      conversation_id: "cht_1",
      messages: [
        { role: "user", content: "hello there" },
        { role: "assistant", content: "reply 1" },
        { role: "user", content: "and again" },
      ],
    });
    expect(third.body).toEqual({ client: "cli", messages: [{ role: "user", content: "fresh" }] });
    expect(t.stdout.text).toBe("reply 1\nreply 2\nreply 3\n");
    expect(t.stderr.text).toContain("Credits left: 49");
  });

  test("keeps separate conversations per server", async () => {
    const t = signedIn();
    await run(["chat", "hello"], t.io);
    const stored = JSON.parse(readFileSync(join(t.dir, "conversations.json"), "utf8"));
    expect(Object.keys(stored)).toEqual([BASE]);
    expect(stored[BASE].conversation_id).toBe("cht_1");
  });

  test("a reply prints as text, and --json keeps the markup", async () => {
    const html = '<p>Set to <a href="/user/profile">your profile</a> &amp; saved.</p>';
    const routes = {
      ...chatRoutes(),
      "POST /api/youspot/chat": { success: true, reply: html, conversation_id: "cht_9" },
    };
    const t = setup({ routes });
    saveSession(BASE, { session_token: "ses_saved", email: "ada@acme.com" }, { dir: t.dir });
    await run(["chat", "hi"], t.io);
    expect(t.stdout.text).toBe(`Set to your profile (${BASE}/user/profile) & saved.\n`);
    await run(["chat", "--json", "again"], t.io);
    expect(t.stdout.text).toContain('"reply": "<p>Set to');
  });

  test("--verbose lists the tools and --json prints the raw response", async () => {
    const t = signedIn();
    await run(["chat", "--verbose", "--json", "hi"], t.io);
    expect(t.stderr.text).toContain("Tools: search_graph_objects");
    expect(JSON.parse(t.stdout.text).conversation_id).toBe("cht_1");
  });

  test("piped stdin sends one turn per non-empty line", async () => {
    const t = signedIn({ stdin: ["first line\n\n", "second line\n"] });
    t.io.stdin.isTTY = false;
    expect(await run(["chat"], t.io)).toBe(0);
    const turns = t.server.called("POST /api/youspot/chat");
    expect(turns).toHaveLength(2);
    expect(turns[1].body.conversation_id).toBe("cht_1");
    expect(turns[1].body.messages.at(-1)).toEqual({ role: "user", content: "second line" });
  });

  test("without a session it says to log in or sign up", async () => {
    const t = setup({ routes: chatRoutes() });
    expect(await run(["chat", "hi"], t.io)).toBe(1);
    expect(t.stderr.text).toContain("youspot login");
    expect(t.stderr.text).toContain("youspot signup");
    expect(t.server.calls).toHaveLength(0);
  });

  test("a failed turn surfaces the server's message and keeps the stored history unchanged", async () => {
    const t = signedIn();
    await run(["chat", "hello"], t.io);
    t.server.calls.length = 0;
    const failing = setup({
      routes: {
        "POST /api/youspot/chat": [
          402,
          {
            success: false,
            error: "insufficient_credits",
            message: "You're out of credits for this month.",
          },
        ],
      },
    });
    const io = { ...t.io, fetch: failing.server.fetch };
    expect(await run(["chat", "more"], io)).toBe(1);
    expect(t.stderr.text).toContain("You're out of credits for this month.");
    const stored = JSON.parse(readFileSync(join(t.dir, "conversations.json"), "utf8"))[BASE];
    expect(stored.messages).toHaveLength(2);
  });
});

describe("youspot logout and whoami", () => {
  test("logout revokes on the server before deleting the local session", async () => {
    const t = signedIn();
    await run(["chat", "hello"], t.io);
    let presentDuringRevoke;
    const revoking = setup({
      routes: {
        "POST /api/auth/session/revoke": (call) => {
          presentDuringRevoke = readFileSync(join(t.dir, "credentials.json"), "utf8").includes(
            "ses_saved",
          );
          return { success: true, revoked: true };
        },
      },
    });
    expect(await run(["logout"], { ...t.io, fetch: revoking.server.fetch })).toBe(0);
    const [revoke] = revoking.server.called("POST /api/auth/session/revoke");
    expect(revoke.headers["X-AgentAI-User-Token"]).toBe("ses_saved");
    expect(presentDuringRevoke).toBe(true);
    expect(existsSync(join(t.dir, "credentials.json"))).toBe(false);
    expect(existsSync(join(t.dir, "conversations.json"))).toBe(false);
  });

  test("a failed revoke keeps the local session so logout can be retried", async () => {
    const t = signedIn();
    const failing = setup({
      routes: { "POST /api/auth/session/revoke": [503, { success: false, error: "unavailable" }] },
    });
    expect(await run(["logout"], { ...t.io, fetch: failing.server.fetch })).toBe(1);
    expect(existsSync(join(t.dir, "credentials.json"))).toBe(true);
  });

  test("whoami verifies the saved session against the server", async () => {
    const t = signedIn();
    expect(await run(["whoami"], t.io)).toBe(0);
    expect(t.server.called("GET /api/session")[0].headers["X-AgentAI-User-Token"]).toBe(
      "ses_saved",
    );
    expect(t.stdout.text).toBe(`ada@acme.com\nServer: ${BASE}\nCredits: 12 (free)\n`);
  });

  test("whoami fails when the server no longer knows the session", async () => {
    const t = signedIn();
    const stale = setup({
      routes: { "GET /api/session": { success: true, authenticated: false, user: null } },
    });
    expect(await run(["whoami"], { ...t.io, fetch: stale.server.fetch })).toBe(1);
    expect(t.stderr.text).toContain("youspot login");
  });
});

describe("youspot call", () => {
  test("prefers YOUSPOT_TOKEN over the saved session", async () => {
    const t = signedIn({ env: { YOUSPOT_TOKEN: "env_token" } });
    expect(await run(["call", "get_my_plan"], t.io)).toBe(0);
    const [call] = t.server.called("POST /mcp");
    expect(call.headers.Authorization).toBe("Bearer env_token");
    expect(call.body.params).toEqual({ name: "get_my_plan", arguments: {} });
    expect(t.stdout.text).toBe("tool ok\n");
  });

  test("falls back to the saved session", async () => {
    const t = signedIn();
    expect(await run(["call", "get_my_plan", '{"x":1}'], t.io)).toBe(0);
    expect(t.server.called("POST /mcp")[0].headers.Authorization).toBe("Bearer ses_saved");
  });

  test("with neither it explains how to get a credential", async () => {
    const t = setup({ routes: chatRoutes() });
    expect(await run(["call", "get_my_plan"], t.io)).toBe(1);
    expect(t.stderr.text).toContain("youspot login");
    expect(t.server.calls).toHaveLength(0);
  });
});
