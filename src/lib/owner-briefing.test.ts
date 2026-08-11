import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOwnerBriefingEmail, buildOwnerBriefingSnapshot, ownerBriefingHasMaterialContent, ownerBriefingMaterialFingerprint } from "@/lib/portfolio-iq/owner-briefing";

function snapshot() {
  return buildOwnerBriefingSnapshot({
    generatedAt: new Date("2026-08-11T12:00:00Z"),
    portfolio: { id: "portfolio-1", name: "Cleveland Pilot Owner Portfolio", marketId: "cleveland" },
    attention: [{ signalId: "signal-1", severity: "high", category: "market", headline: "One-bedroom rents changed: 2 portfolio assets exposed", narrative: "Asking-market evidence changed.", exposedAssets: [{ name: "Villas of Fox Hollow", slug: "villas", operatorName: "Operator A" }, { name: "398 W. Bagley Rd", slug: "bagley", operatorName: "Operator B" }], decisionState: "acknowledged", assignedTo: "Asset management", dueAt: "2026-08-18T00:00:00Z" }],
    decisions: { active: 2, assigned: 1, due: 1, monitoring: 1 },
    collaboration: { awaitingResponse: 1, overdue: 0, awaitingOwnerReview: 1, acceptedPlans: 0 },
    financial: { ready: 1, incomplete: 1, conservative: 12000, base: 24000, upside: 36000 },
    outcomes: { ready: 1, due: 1, waiting: 0, reviewed: 0 },
    sources: [{ label: "Dwellsy IQ Trends", status: "current", detail: "Through 2026-06-01" }],
  });
}

test("owner briefing summarizes portfolio exposure and follow-through", () => {
  const report = snapshot();
  assert.equal(report.attention[0].exposedAssets.length, 2);
  assert.match(report.executiveSummary, /2 portfolio assets/);
  assert.match(report.executiveSummary, /1 decision is due/);
  assert.match(report.executiveSummary, /1 property-manager response awaits owner review/);
});

test("owner briefing email uses the same connected snapshot and preserves evidence limits", () => {
  const email = buildOwnerBriefingEmail({ snapshot: snapshot(), recipientName: "Jonas", reportUrl: "https://preview.example/portfolio-iq/reports", preview: true });
  assert.match(email.subject, /^\[preview\] Dwellsy IQ:/);
  assert.match(email.text, /Villas of Fox Hollow, 398 W\. Bagley Rd/);
  assert.match(email.html, /\$12,000/);
  assert.match(email.html, /\$36,000/);
  assert.match(email.html, /Open decision case/);
  assert.match(email.text, /\/today\/cases\/signal-1/);
  assert.match(email.text, /does not measure occupancy, signed leases, concessions, effective rent, or NOI/);
});

test("owner briefing delivery fingerprint ignores generation time but detects decision changes", () => {
  const first = snapshot();
  const regenerated = { ...first, generatedAt: "2026-08-18T12:00:00.000Z" };
  const reassigned = { ...regenerated, decisions: { ...regenerated.decisions, assigned: 2 } };
  assert.equal(ownerBriefingMaterialFingerprint(first), ownerBriefingMaterialFingerprint(regenerated));
  assert.notEqual(ownerBriefingMaterialFingerprint(first), ownerBriefingMaterialFingerprint(reassigned));
  assert.equal(ownerBriefingHasMaterialContent(first), true);
});

test("a first empty briefing is not treated as a material delivery", () => {
  const empty = buildOwnerBriefingSnapshot({
    generatedAt: new Date("2026-08-11T12:00:00Z"),
    portfolio: { id: "portfolio-1", name: "Cleveland Pilot Owner Portfolio", marketId: "cleveland" },
    attention: [],
    decisions: { active: 0, assigned: 0, due: 0, monitoring: 0 },
    collaboration: { awaitingResponse: 0, overdue: 0, awaitingOwnerReview: 0, acceptedPlans: 0 },
    financial: { ready: 0, incomplete: 0, conservative: 0, base: 0, upside: 0 },
    outcomes: { ready: 0, due: 0, waiting: 0, reviewed: 0 },
    sources: [{ label: "Dwellsy IQ Trends", status: "limited", detail: "No current trend observation" }],
  });
  assert.equal(ownerBriefingHasMaterialContent(empty), false);
});

test("Reports navigation is a real owner route and manual email stays self-addressed", () => {
  const nav = readFileSync("src/lib/nav.ts", "utf8");
  const page = readFileSync("src/app/portfolio-iq/reports/page.tsx", "utf8");
  const action = readFileSync("src/app/portfolio-iq/reports/actions.ts", "utf8");
  assert.match(nav, /href: "\/portfolio-iq\/reports", label: "Reports"/);
  assert.match(page, /loadOwnerBriefing/);
  assert.match(action, /currentUser\(\)/);
  assert.match(action, /user\.primaryEmailAddressId/);
  assert.doesNotMatch(action, /formData|get\("email"\)/);
});

test("scheduled owner delivery uses the unified briefing and preserves the sent snapshot", () => {
  const runner = readFileSync("src/lib/portfolio-iq/digest-run.server.ts", "utf8");
  const delivery = readFileSync("src/lib/portfolio-iq/owner-briefing-delivery.server.ts", "utf8");
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const reports = readFileSync("src/app/portfolio-iq/reports/page.tsx", "utf8");
  assert.match(runner, /buildOwnerBriefingEmail/);
  assert.match(runner, /ownerBriefingMaterialFingerprint/);
  assert.doesNotMatch(runner, /buildPortfolioIqDigest/);
  assert.match(runner, /snapshot: JSON\.stringify\(snapshot\)/);
  assert.match(delivery, /triggerKind: "preview"/);
  assert.match(schema, /deliveryKey\s+String\s+@unique/);
  assert.match(schema, /materialFingerprint\s+String\?/);
  assert.match(reports, /Email the signed-in user when the briefing materially changes/);
  assert.match(reports, /Identical briefings are suppressed/);
});
