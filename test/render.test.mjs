import { describe, expect, test } from "bun:test";
import { replyText } from "../src/render.mjs";

const BASE = "http://localhost:3001";

describe("chat replies read as text in a terminal", () => {
  test("paragraphs become blank-line separated and entities are decoded", () => {
    const html =
      "<p>Done, it&#x27;s set to <strong>acme.com</strong> &amp; saved.</p><p>Next &lt;step&gt;.</p>";
    expect(replyText(html, BASE)).toBe("Done, it's set to acme.com & saved.\n\nNext <step>.");
  });

  test("an app link gains the server it points at, and a bare URL shows once", () => {
    const html =
      '<p>Change it at <a href="/user/profile">your profile</a> or ' +
      '<a href="https://www.linkedin.com/in/someone" target="_blank">linkedin.com/in/someone</a>.</p>';
    expect(replyText(html, BASE)).toBe(
      `Change it at your profile (${BASE}/user/profile) or https://www.linkedin.com/in/someone.`,
    );
  });

  test("a question card lists its choices in order", () => {
    const html =
      '<p>Pick one.</p>\n<ui-component type="ask_user" header="Next step" o2="Import my export" ' +
      'o1="Try again" q="How should I get your posts in?"></ui-component>';
    expect(replyText(html, BASE)).toBe(
      "Pick one.\n\nHow should I get your posts in?\n  1. Try again\n  2. Import my export",
    );
  });

  test("lists keep one item per line and other cards leave a marker", () => {
    const html =
      '<ul><li>One</li><li>Two</li></ul><ui-component type="calendar_events"></ui-component>';
    expect(replyText(html, BASE)).toBe("- One\n- Two\n\n[calendar_events]");
  });
});
