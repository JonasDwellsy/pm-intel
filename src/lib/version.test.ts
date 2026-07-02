// v0.23 — drift guard. The displayed methodology version MUST equal what
// the pipeline stamps on the seed. Reads the lightweight markets-summary
// sidecar (not the 37MB scorecard blob). If this fails, the pipeline
// bumped the methodology version and version.ts needs updating (or vice
// versa) — the footer/hero must never disagree with the data again.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { METHODOLOGY_VERSION } from "./version";

test("METHODOLOGY_VERSION matches the seed's methodologyVersion", () => {
  const summary = JSON.parse(
    readFileSync(join(process.cwd(), "src/data/markets-summary.json"), "utf8")
  ) as { methodologyVersion?: string };
  assert.equal(
    METHODOLOGY_VERSION,
    summary.methodologyVersion,
    `version.ts METHODOLOGY_VERSION (${METHODOLOGY_VERSION}) must equal the ` +
      `seed's methodologyVersion (${summary.methodologyVersion}). Bump ` +
      `version.ts whenever the pipeline bumps the methodology.`
  );
});
