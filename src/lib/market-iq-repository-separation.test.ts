import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workflowsDirectory = join(process.cwd(), ".github/workflows");
const workflows = readdirSync(workflowsDirectory).filter((file) => file.endsWith(".yml"));

test("pm-intel does not schedule or monitor standalone Market IQ operations", () => {
  assert.deepEqual(
    workflows.filter((file) => file.startsWith("market-iq-")),
    [],
  );

  for (const file of workflows) {
    const source = readFileSync(join(workflowsDirectory, file), "utf8");
    assert.doesNotMatch(source, /market-iq-git-codex-market-iq-integration/);
    assert.doesNotMatch(source, /api\/market-iq\/(?:source|daily-watchlist-delivery)/);
  }
});
