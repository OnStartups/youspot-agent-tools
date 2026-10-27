import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../src/cli.mjs";
import { BASE, setup } from "./fake.mjs";

const CONFIG = {
  success: true,
  api_base: BASE,
  signup_available: true,
  legal_consent_required: true,
  terms_url: "https://youspot.com/terms",
  privacy_url: "https://youspot.com/privacy",
};

function routes(overrides = {}) {
  return {
    "GET /api/cli/config": CONFIG,
    "POST /api/cli/signup/start": (call) => ({
      success: true,
      signup_id: "su_1",
      email: call.body.email,
      expires_in: 600,
    }),
    "POST /api/cli/signup/verify": (call) => ({
      success: true,
      session_token: "ses_new",
      email: "x+clerk_test@acme.com",
      created: true,
      user_token: "permanent_user_token",
    }),
    ...overrides,
  };
}

const FLAGS = [
  "signup",
  "--email",
  "x+clerk_test@acme.com",
  "--password",
  "Correct-Horse-9",
  "--code",
  "424242",
  "--accept-terms",
];

describe("youspot signup without a terminal", () => {
  test("creates the account from flags alone and saves only the revocable session", async () => {
    const t = setup({ routes: routes() });
    expect(await run(FLAGS, t.io)).toBe(0);
    expect(t.stdout.text).toBe("Account created for x+clerk_test@acme.com\n");
    expect(t.asked).toEqual([]);

    const [start] = t.server.called("POST /api/cli/signup/start");
    expect(start.body).toEqual({
      email: "x+clerk_test@acme.com",
      password: "Correct-Horse-9",
      accept_terms: true,
      entry_source: "cli",
    });
    const [verify] = t.server.called("POST /api/cli/signup/verify");
    expect(verify.body).toEqual({ signup_id: "su_1", code: "424242" });

    const saved = JSON.parse(readFileSync(join(t.dir, "credentials.json"), "utf8"))[BASE];
    expect(saved.session_token).toBe("ses_new");
    expect(JSON.stringify(saved)).not.toContain("permanent_user_token");
    expect(t.stdout.text + t.stderr.text).not.toContain("Correct-Horse-9");
    expect(t.stderr.text).toContain("https://youspot.com/terms");
  });

  test("reads the password from YOUSPOT_PASSWORD", async () => {
    const t = setup({ routes: routes(), env: { YOUSPOT_PASSWORD: "From-The-Env-1" } });
    const args = FLAGS.filter((arg, i) => arg !== "--password" && FLAGS[i - 1] !== "--password");
    expect(await run(args, t.io)).toBe(0);
    expect(t.server.called("POST /api/cli/signup/start")[0].body.password).toBe("From-The-Env-1");
  });

  test("says Signed in as when the account already existed", async () => {
    const t = setup({
      routes: routes({
        "POST /api/cli/signup/verify": {
          success: true,
          session_token: "s",
          email: "old@acme.com",
          created: false,
        },
      }),
    });
    expect(await run(FLAGS, t.io)).toBe(0);
    expect(t.stdout.text).toBe("Signed in as old@acme.com\n");
  });

  test("refuses before starting when sign-up is closed", async () => {
    const t = setup({
      routes: routes({ "GET /api/cli/config": { ...CONFIG, signup_available: false } }),
    });
    expect(await run(FLAGS, t.io)).toBe(1);
    expect(t.stderr.text).toContain("not open right now");
    expect(t.server.called("POST /api/cli/signup/start")).toHaveLength(0);
  });

  test("without --accept-terms it is a usage error and nothing is sent", async () => {
    const t = setup({ routes: routes() });
    expect(
      await run(
        FLAGS.filter((arg) => arg !== "--accept-terms"),
        t.io,
      ),
    ).toBe(2);
    expect(t.stderr.text).toContain("--accept-terms");
    expect(t.server.called("POST /api/cli/signup/start")).toHaveLength(0);
  });

  test.each([
    [
      "password_rejected",
      { message: "Passwords must be at least 8 characters." },
      "Passwords must be at least 8 characters.",
    ],
    ["account_exists", {}, "Run 'youspot login' to sign in."],
    ["browser_required", {}, "Run 'youspot login' to sign in with the browser instead."],
    [
      "browser_required",
      { message: "Finish this one in the browser." },
      "Finish this one in the browser. Run 'youspot login'",
    ],
  ])("maps %s to its message with exit code 1", async (error, extra, expected) => {
    const t = setup({
      routes: routes({ "POST /api/cli/signup/start": [400, { success: false, error, ...extra }] }),
    });
    expect(await run(FLAGS, t.io)).toBe(1);
    expect(t.stderr.text).toContain(expected);
    expect(t.server.called("POST /api/cli/signup/verify")).toHaveLength(0);
  });

  test("a wrong code fails once when nobody can be asked again", async () => {
    const t = setup({
      routes: routes({
        "POST /api/cli/signup/verify": [
          400,
          { success: false, error: "code_incorrect", attempts_left: 2 },
        ],
      }),
    });
    expect(await run(FLAGS, t.io)).toBe(1);
    expect(t.stderr.text).toContain("That code is not right. 2 tries left.");
    expect(t.server.called("POST /api/cli/signup/verify")).toHaveLength(1);
  });
});

describe("youspot signup in a terminal", () => {
  test("prompts for everything, hides the password, re-asks after a wrong code, and honours resend", async () => {
    const codes = ["111111", "resend", "424242"];
    const t = setup({
      interactive: true,
      answers: ["ada@acme.com", "Secret-Pass-1", "Secret-Pass-1", "y", ...codes],
      routes: routes({
        "POST /api/cli/signup/verify": (call) =>
          call.body.code === "424242"
            ? { success: true, session_token: "ses_i", email: "ada@acme.com", created: true }
            : [400, { success: false, error: "code_incorrect", attempts_left: 2 }],
        "POST /api/cli/signup/resend": { success: true, email: "ada@acme.com" },
      }),
    });
    expect(await run(["signup"], t.io)).toBe(0);
    expect(t.asked.map((q) => q.hidden)).toEqual([false, true, true, false, false, false, false]);
    expect(t.stderr.text).toContain("We emailed a code to ada@acme.com.");
    expect(t.stderr.text).toContain("That code is not right. 2 tries left.");
    expect(t.stderr.text).toContain("We sent a new code to ada@acme.com.");
    expect(t.server.called("POST /api/cli/signup/resend")[0].body).toEqual({ signup_id: "su_1" });
    expect(t.server.called("POST /api/cli/signup/verify").map((call) => call.body.code)).toEqual([
      "111111",
      "424242",
    ]);
    expect(t.stdout.text).toBe("Account created for ada@acme.com\n");
  });

  test("declining the terms creates nothing", async () => {
    const t = setup({ interactive: true, answers: ["n"], routes: routes() });
    expect(await run(["signup", "--email", "a@b.com", "--password", "Pass-word-1"], t.io)).toBe(1);
    expect(t.server.called("POST /api/cli/signup/start")).toHaveLength(0);
  });
});
