import { describe, expect, test } from "bun:test";
import { run } from "../src/cli.mjs";
import { saveSession } from "../src/index.mjs";
import { BASE, setup } from "./fake.mjs";

const RUN = { trace_id: "tr_1", handle: "research", name: "Research", node_id: "agent_1" };

function dispatchRoute(status = "running", reason) {
  return {
    success: true,
    reply: "Sent to @research. Working on it.",
    conversation_id: "cht_7",
    agent_runs: [{ ...RUN, status, ...(reason ? { reason } : {}) }],
    credits: 41,
  };
}

const USER_ROW = {
  id: 10,
  role: "user",
  content: "@research what changed?",
  author: null,
  agent_runs: null,
};
const DISPATCH_ROW = {
  id: 11,
  role: "assistant",
  content: "Sent to @research. Working on it.",
  author: null,
  agent_runs: [{ ...RUN, status: "running" }],
};
const REPLY_ROW = {
  id: 12,
  role: "assistant",
  content: "<p>Acme <strong>raised</strong> prices.</p>",
  author: { kind: "agent", handle: "research", name: "Research" },
  agent_runs: null,
};

function pollRoutes(pages) {
  let poll = 0;
  return {
    "GET /api/youspot/chat/agent-runs": (call) => {
      const page = pages[Math.min(poll, pages.length - 1)];
      poll += 1;
      return typeof page === "function" ? page(call) : page;
    },
  };
}

function signedIn(routes) {
  const t = setup({ routes });
  saveSession(BASE, { session_token: "ses_saved", email: "ada@acme.com" }, { dir: t.dir });
  return t;
}

describe("youspot chat with a mention", () => {
  test("prints one dispatch line per agent instead of a reply", async () => {
    const t = signedIn({ "POST /api/youspot/chat": dispatchRoute() });
    expect(await run(["chat", "@research", "what", "changed?"], t.io)).toBe(0);
    expect(t.stdout.text).toBe("Sent to @research. Working on it.\n");
    expect(t.stderr.text).toContain("Credits left: 41");
    expect(t.server.called("GET /api/youspot/chat/agent-runs")).toHaveLength(0);
  });

  test("a refused run is reported and exits non-zero", async () => {
    const t = signedIn({ "POST /api/youspot/chat": dispatchRoute("refused", "rate_capped") });
    expect(await run(["chat", "@research", "again"], t.io)).toBe(1);
    expect(t.stdout.text).toBe("@research could not start.\n");
  });

  test("--wait polls every three seconds and prints the reply under its handle", async () => {
    const t = signedIn({
      "POST /api/youspot/chat": dispatchRoute(),
      ...pollRoutes([
        {
          success: true,
          runs: [{ ...RUN, status: "running" }],
          messages: [USER_ROW, DISPATCH_ROW],
        },
        {
          success: true,
          runs: [{ ...RUN, status: "replied" }],
          messages: [REPLY_ROW],
        },
      ]),
    });
    expect(await run(["chat", "--wait", "@research", "what", "changed?"], t.io)).toBe(0);
    expect(t.stdout.text).toBe(
      "Sent to @research. Working on it.\n@research:\nAcme raised prices.\n",
    );
    expect(t.clock.sleeps).toEqual([3000, 3000]);
    const polls = t.server.called("GET /api/youspot/chat/agent-runs");
    expect(polls).toHaveLength(2);
    expect(polls[0].headers["X-AgentAI-User-Token"]).toBe("ses_saved");
    expect(polls[0].url.searchParams.get("conversation_id")).toBe("cht_7");
    expect(polls[0].url.searchParams.get("after_id")).toBeNull();
    expect(polls[1].url.searchParams.get("after_id")).toBe("11");
  });

  test("--wait does not reprint an earlier reply that sits before the dispatch row", async () => {
    const earlier = { ...REPLY_ROW, id: 9, content: "<p>Old news.</p>" };
    const t = signedIn({
      "POST /api/youspot/chat": dispatchRoute(),
      ...pollRoutes([
        {
          success: true,
          runs: [{ ...RUN, status: "replied" }],
          messages: [earlier, USER_ROW, DISPATCH_ROW, REPLY_ROW],
        },
      ]),
    });
    expect(await run(["chat", "--wait", "@research", "now?"], t.io)).toBe(0);
    expect(t.stdout.text).not.toContain("Old news.");
    expect(t.stdout.text).toContain("@research:\nAcme raised prices.\n");
  });

  test("--wait exits non-zero when the run fails", async () => {
    const t = signedIn({
      "POST /api/youspot/chat": dispatchRoute(),
      ...pollRoutes([
        {
          success: true,
          runs: [{ ...RUN, status: "failed", reason: "start_failed" }],
          messages: [USER_ROW, DISPATCH_ROW],
        },
      ]),
    });
    expect(await run(["chat", "--wait", "@research", "go"], t.io)).toBe(1);
    expect(t.stderr.text).toContain("@research failed (start_failed).");
  });

  test("--wait gives up after ten minutes and says where the reply will land", async () => {
    const t = signedIn({
      "POST /api/youspot/chat": dispatchRoute(),
      ...pollRoutes([
        {
          success: true,
          runs: [{ ...RUN, status: "running" }],
          messages: [USER_ROW, DISPATCH_ROW],
        },
      ]),
    });
    expect(await run(["chat", "--wait", "@research", "go"], t.io)).toBe(1);
    expect(t.clock.sleeps).toHaveLength(200);
    expect(t.stderr.text).toContain("Still working after 10 minutes: @research.");
    expect(t.stderr.text).toContain(`${BASE}/chat`);
  });

  test("--wait with --json prints the reply row as JSON", async () => {
    const t = signedIn({
      "POST /api/youspot/chat": dispatchRoute(),
      ...pollRoutes([
        {
          success: true,
          runs: [{ ...RUN, status: "replied" }],
          messages: [DISPATCH_ROW, REPLY_ROW],
        },
      ]),
    });
    expect(await run(["chat", "--wait", "--json", "@research", "go"], t.io)).toBe(0);
    const [, rowLine] = t.stdout.text.trim().split("\n}\n");
    expect(JSON.parse(rowLine).author.handle).toBe("research");
  });

  test("a turn without agent_runs prints the reply as before", async () => {
    const t = signedIn({
      "POST /api/youspot/chat": { success: true, reply: "<p>Hi.</p>", conversation_id: "cht_1" },
    });
    expect(await run(["chat", "--wait", "hello"], t.io)).toBe(0);
    expect(t.stdout.text).toBe("Hi.\n");
    expect(t.server.called("GET /api/youspot/chat/agent-runs")).toHaveLength(0);
  });
});
