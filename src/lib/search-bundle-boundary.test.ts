import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the global app shell does not eagerly import the operator search corpus", () => {
  const input = readFileSync("src/components/search/SearchInput.tsx", "utf8");
  const overlay = readFileSync("src/components/search/SearchOverlay.tsx", "utf8");

  assert.doesNotMatch(input, /import\s*\{[\s\S]*?searchPMs[\s\S]*?\}\s*from\s*["']@\/lib\/pm-search["']/);
  assert.match(input, /import\("@\/lib\/pm-search"\)/);
  assert.doesNotMatch(overlay, /import\s*\{\s*SearchModal\s*\}\s*from\s*["']\.\/SearchModal["']/);
  assert.match(overlay, /dynamic\([\s\S]*import\("\.\/SearchModal"\)/);
  assert.match(overlay, /\{open && <SearchModal/);
});
