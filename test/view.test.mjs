import { describe, expect, test } from "bun:test";
import { run } from "../src/cli.mjs";
import { setup } from "./fake.mjs";

const TOOLS = [
  { name: "query_graph_objects", annotations: { readOnlyHint: true } },
  { name: "delete_graph_object", annotations: { readOnlyHint: false } },
];

const PEOPLE = {
  objects: [
    { object_id: "per_1", type: "contact", name: "Dana Whitfield", email: "dana@north.example" },
  ],
  returned: 1,
};

function viewRoutes() {
  return {
    "POST /mcp": (call) => ({
      jsonrpc: "2.0",
      id: 1,
      result:
        call.body.method === "tools/list"
          ? { tools: TOOLS }
          : {
              content: [{ type: "text", text: JSON.stringify(PEOPLE) }],
              structuredContent: PEOPLE,
              isError: false,
            },
    }),
  };
}

const toolCalls = (t) =>
  t.server.called("POST /mcp").filter((call) => call.body.method === "tools/call");

describe("youspot view", () => {
  test("a read tool runs once and prints as a table", async () => {
    const t = setup({ routes: viewRoutes(), env: { YOUSPOT_TOKEN: "ses_token" } });
    const code = await run(["view", "query_graph_objects", '{"type":"contact"}'], t.io);
    expect(code).toBe(0);
    expect(toolCalls(t).map((call) => call.body.params)).toEqual([
      { name: "query_graph_objects", arguments: { type: "contact" } },
    ]);
    expect(t.stdout.text).toContain("Dana Whitfield  dana@north.example  contact");
    expect(t.stdout.text).toContain("Returned: 1");
  });

  test("a tool that changes data is refused before it runs", async () => {
    const t = setup({ routes: viewRoutes(), env: { YOUSPOT_TOKEN: "ses_token" } });
    const code = await run(["view", "delete_graph_object", '{"object_id":"per_1"}'], t.io);
    expect(code).toBe(1);
    expect(toolCalls(t)).toEqual([]);
    expect(t.stderr.text).toContain("changes data");
  });
});
