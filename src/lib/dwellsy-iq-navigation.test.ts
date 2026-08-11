import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { OWNER_NAV_ITEMS } from "@/lib/nav";

test("owner navigation exposes the seven decision-system destinations", () => {
  assert.deepEqual(
    OWNER_NAV_ITEMS.map((item) => item.label),
    ["Today", "Portfolio", "Markets", "Properties", "Operators", "Watchlists", "Reports"]
  );
});

test("workflow destinations stay in Portfolio context instead of global navigation", () => {
  const globalNav = readFileSync("src/lib/nav.ts", "utf8");
  const contextNav = readFileSync("src/components/dwellsy-iq/DwellsyIqWorkspaceNav.tsx", "utf8");
  const ownerNavBlock = globalNav.slice(globalNav.indexOf("OWNER_NAV_ITEMS"), globalNav.indexOf("PRIMARY_CTA"));

  for (const label of ["Launch briefing", "Changes", "Collaboration", "Financial impact", "Outcomes"]) {
    assert.doesNotMatch(ownerNavBlock, new RegExp(`label: "${label}"`, "i"));
    assert.match(contextNav, new RegExp(label, "i"));
  }
  assert.doesNotMatch(contextNav, /overflow-x-auto|min-w-max/);
});

test("owner header remains isolated behind authenticated preview mode", () => {
  const header = readFileSync("src/components/layout/SiteHeader.tsx", "utf8");
  assert.match(header, /isSignedIn && portfolioIqPreviewEnabled\(\)/);
  assert.match(header, /HeaderNavigation ownerMode=\{ownerMode\}/);
});
