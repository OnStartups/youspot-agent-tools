import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { run } from "../src/cli.mjs";
import { BASE, setup } from "./fake.mjs";

function loginRoutes(statuses) {
  const queue = [...statuses];
  return {
    "POST /api/cli/login/start": {
      success: true,
      session_id: "sess_1",
      user_code: "ABCD-EFGH",
      verification_url: "https://youspot.com/cli/login?session_id=sess_1",
      expires_in: 600,
      interval: 5,
    },
    "GET /api/cli/login/status": () => ({ success: true, status: queue.shift() ?? "pending" }),
    "POST /api/cli/login/claim": {
      success: true,
      session_token: "ses_claimed",
      email: "ada@acme.com",
    },
  };
}

describe("youspot login", () => {
  test("polls until approved, claims with the verifier behind the challenge, and saves the session privately", async () => {
    const t = setup({ routes: loginRoutes(["pending", "approved"]), interactive: true });
    const code = await run(["login"], t.io);

    expect(code).toBe(0);
    expect(t.stdout.text).toBe("Signed in as ada@acme.com\n");
    expect(t.stderr.text).toContain("Confirm the code ABCD-EFGH in your browser");
    expect(t.server.called("GET /api/cli/login/status")).toHaveLength(2);
    expect(t.clock.sleeps).toEqual([5000, 5000]);

    const [start] = t.server.called("POST /api/cli/login/start");
    const [claim] = t.server.called("POST /api/cli/login/claim");
    expect(claim.body.session_id).toBe("sess_1");
    const digest = createHash("sha256").update(claim.body.code_verifier).digest("base64url");
    expect(digest).toBe(start.body.code_challenge);
    expect(start.body.code_challenge).not.toContain("=");
    expect(Buffer.from(claim.body.code_verifier, "base64url")).toHaveLength(32);

    const file = join(t.dir, "credentials.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(t.dir).mode & 0o777).toBe(0o700);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved[BASE].session_token).toBe("ses_claimed");
    expect(saved[BASE].email).toBe("ada@acme.com");
  });

  test("opens the approval page on the configured server, not the one the backend names", async () => {
    const t = setup({ routes: loginRoutes(["approved"]), interactive: true });
    await run(["login"], t.io);
    expect(t.opened).toEqual([`${BASE}/cli/login?session_id=sess_1`]);
    expect(t.stderr.text).toContain(`${BASE}/cli/login?session_id=sess_1`);
    expect(t.stderr.text).not.toContain("https://youspot.com/cli/login");
  });

  test("--no-browser and a missing terminal print the link without opening it", async () => {
    const flagged = setup({ routes: loginRoutes(["approved"]), interactive: true });
    await run(["login", "--no-browser"], flagged.io);
    expect(flagged.opened).toEqual([]);
    expect(flagged.stderr.text).toContain(`${BASE}/cli/login?session_id=sess_1`);

    const headless = setup({ routes: loginRoutes(["approved"]), interactive: false });
    expect(await run(["login"], headless.io)).toBe(0);
    expect(headless.opened).toEqual([]);
  });

  test("an expired request fails, says to run login again, and saves nothing", async () => {
    const t = setup({ routes: loginRoutes(["pending", "expired"]) });
    expect(await run(["login"], t.io)).toBe(1);
    expect(t.stderr.text).toContain("Run 'youspot login' again");
    expect(t.server.called("POST /api/cli/login/claim")).toHaveLength(0);
    expect(existsSync(join(t.dir, "credentials.json"))).toBe(false);
  });

  test("gives up once expires_in has passed while still pending", async () => {
    const routes = {
      ...loginRoutes([]),
      "POST /api/cli/login/start": {
        success: true,
        session_id: "s",
        user_code: "C",
        expires_in: 20,
        interval: 5,
      },
    };
    const t = setup({ routes });
    expect(await run(["login"], t.io)).toBe(1);
    expect(t.server.called("GET /api/cli/login/status")).toHaveLength(4);
  });
});
