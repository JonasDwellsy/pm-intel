// DB-free: only exercises the pure line parser. Importing this module must
// NOT run main() or connect to Neon — see the argv[1] guard in
// load-property-homes.ts (exact-suffix match on this file's own name, since
// this test file's path also contains the substring "load-property-homes").
import test from "node:test";
import { strict as assert } from "node:assert";
import { parseHomeRecord } from "./load-property-homes";

test("parses a full record", () => {
  const r = parseHomeRecord(JSON.stringify({ pmSlug: "x", marketId: "m", addressId: "a", address: "1 St", nListings: 2, concession: true }));
  assert.equal(r?.pmSlug, "x"); assert.equal(r?.nListings, 2); assert.equal(r?.concession, true);
});
test("blank/invalid lines → null", () => {
  assert.equal(parseHomeRecord("   "), null);
  assert.equal(parseHomeRecord(JSON.stringify({ marketId: "m" })), null); // no pmSlug/addressId
});
test("malformed JSON line → null, does not throw", () => {
  assert.doesNotThrow(() => parseHomeRecord("{not valid json"));
  assert.equal(parseHomeRecord("{not valid json"), null);
});
