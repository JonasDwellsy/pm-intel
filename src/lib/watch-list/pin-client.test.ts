import test from "node:test";
import { strict as assert } from "node:assert";
import { addOperatorsToWatchList } from "./pin-client";

function stubFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  (globalThis as { fetch?: unknown }).fetch = async (input: unknown, init?: RequestInit) => {
    const { status = 200, body } = handler(String(input), init);
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  };
}

test("newName target creates a criteria-less list then pins each memberKey", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  stubFetch((url, init) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url === "/api/watch-lists") return { body: { watchList: { id: "list-new" } } };
    return { body: { ok: true } }; // /members
  });
  const res = await addOperatorsToWatchList({ newName: "My PMs" }, ["acme", "beta"]);
  assert.equal(res.listId, "list-new");
  assert.equal(res.added, 2);
  assert.equal(res.failed, 0);
  const create = calls.find((c) => c.url === "/api/watch-lists")!;
  assert.deepEqual(create.body, {
    name: "My PMs",
    requiredCriteria: [], preferredCriteria: [], excludedCriteria: [],
  });
  assert.equal(calls.filter((c) => c.url === "/api/watch-lists/list-new/members").length, 2);
});

test("listId target skips creation and pins into the existing list; counts failures", async () => {
  // memberKey travels in the POST body, not the URL (the /members URL is
  // the same "/api/watch-lists/list-x/members" for every key) — so the
  // per-key failure has to be keyed off the body, not the url.
  stubFetch((url, init) => {
    if (url.endsWith("/members")) {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      return body.memberKey === "beta" ? { status: 500, body: {} } : { body: {} };
    }
    throw new Error("should not create a list");
  });
  const res = await addOperatorsToWatchList({ listId: "list-x" }, ["acme", "beta"]);
  assert.equal(res.listId, "list-x");
  assert.equal(res.added, 1);
  assert.equal(res.failed, 1);
});
