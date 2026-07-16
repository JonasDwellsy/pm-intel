import test from "node:test";
import { strict as assert } from "node:assert";
import {
  computePmNamePatch,
  computeCanonicalMemberPatch,
  applyCorrectionsToSeedData,
} from "./name-correction";

function pmBlob(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    canonicalOperatorId: null,
    canonicalOperatorName: undefined,
    pm: { name: "Pmi Mile High", quadrant7Cell: "SFR Independent" },
    market: { name: "Denver" },
    ...over,
  });
}

test("computePmNamePatch sets column + blob pm.name", () => {
  const out = computePmNamePatch(
    { name: "Pmi Mile High", scorecardData: pmBlob() },
    "PMI Mile High"
  );
  assert.equal(out.name, "PMI Mile High");
  assert.equal(JSON.parse(out.scorecardData).pm.name, "PMI Mile High");
});

test("computePmNamePatch keeps a casing-only canonicalOperatorName consistent", () => {
  // blob had a DBA alias equal (case-insensitively) to the old name →
  // must move with the correction so toPmListItem doesn't show stale casing.
  const blob = pmBlob({ canonicalOperatorName: "pmi mile high" });
  const out = computePmNamePatch(
    { name: "Pmi Mile High", scorecardData: blob },
    "PMI Mile High"
  );
  assert.equal(JSON.parse(out.scorecardData).canonicalOperatorName, "PMI Mile High");
  // live/seed parity: the column patch must also move, so the caller can
  // write it to PM.canonicalOperatorName.
  assert.equal(out.canonicalOperatorName, "PMI Mile High");
});

test("computePmNamePatch leaves a genuine DBA alias untouched", () => {
  const blob = pmBlob({ canonicalOperatorName: "29th Street Property Management" });
  const out = computePmNamePatch(
    { name: "Haven Residential", scorecardData: blob },
    "Haven Residential LLC"
  );
  assert.equal(
    JSON.parse(out.scorecardData).canonicalOperatorName,
    "29th Street Property Management"
  );
  // genuine DBA alias untouched → column patch must be absent, not overwritten.
  assert.equal(out.canonicalOperatorName, undefined);
});

test("computePmNamePatch omits canonicalOperatorName when there is no alias", () => {
  const out = computePmNamePatch(
    { name: "Pmi Mile High", scorecardData: pmBlob() },
    "PMI Mile High"
  );
  assert.equal(out.canonicalOperatorName, undefined);
});

test("computeCanonicalMemberPatch sets member alias column + blob", () => {
  const out = computeCanonicalMemberPatch(
    { scorecardData: pmBlob({ canonicalOperatorName: "Edward Rose" }) },
    "Edward Rose & Sons"
  );
  assert.equal(out.canonicalOperatorName, "Edward Rose & Sons");
  assert.equal(
    JSON.parse(out.scorecardData).canonicalOperatorName,
    "Edward Rose & Sons"
  );
});

test("applyCorrectionsToSeedData stamps pm + canonical in-memory and reports staleness", () => {
  const pms = [
    { slug: "a-denver-co", name: "Pmi Mile High", canonicalOperatorName: null },
    {
      slug: "er-milwaukee",
      name: "Edward Rose",
      canonicalOperatorId: "edward-rose-sons",
      canonicalOperatorName: "Edward Rose",
    },
  ];
  const canon = { "edward-rose-sons": { canonicalName: "Edward Rose" } };
  const corrections = [
    { targetKind: "pm", targetKey: "a-denver-co", correctedName: "PMI Mile High", originalName: "Pmi Mile High" },
    { targetKind: "canonical", targetKey: "edward-rose-sons", correctedName: "Edward Rose & Sons", originalName: "Edward Rose" },
    { targetKind: "pm", targetKey: "gone", correctedName: "X", originalName: "Y" },
  ];
  const res = applyCorrectionsToSeedData(pms, canon, corrections);
  assert.equal(pms[0].name, "PMI Mile High");
  assert.equal(canon["edward-rose-sons"].canonicalName, "Edward Rose & Sons");
  // canonical correction also stamps member alias:
  assert.equal(pms[1].canonicalOperatorName, "Edward Rose & Sons");
  assert.equal(res.applied, 2);
  assert.deepEqual(res.stale, ["gone"]); // unknown target logged as stale/skipped
  assert.deepEqual(res.drifted, []); // both resolved corrections matched their originalName
});

test("applyCorrectionsToSeedData reports drift when the current source name no longer matches originalName", () => {
  const pms = [
    // A full refresh renamed this operator's source name after the
    // correction was recorded — originalName is now stale, but the
    // correction is still applied (correctedName wins).
    { slug: "a-denver-co", name: "PMI Mile High Renamed", canonicalOperatorName: null },
    { slug: "b-denver-co", name: "Pmi Mile High", canonicalOperatorName: null },
    {
      slug: "er-milwaukee",
      name: "Edward Rose",
      canonicalOperatorId: "edward-rose-sons",
      canonicalOperatorName: "Edward Rose",
    },
  ];
  const canon = { "edward-rose-sons": { canonicalName: "Edward Rose Renamed" } };
  const corrections = [
    { targetKind: "pm", targetKey: "a-denver-co", correctedName: "PMI Mile High", originalName: "Pmi Mile High" },
    { targetKind: "pm", targetKey: "b-denver-co", correctedName: "PMI Mile High", originalName: "Pmi Mile High" },
    { targetKind: "canonical", targetKey: "edward-rose-sons", correctedName: "Edward Rose & Sons", originalName: "Edward Rose" },
  ];
  const res = applyCorrectionsToSeedData(pms, canon, corrections);
  assert.equal(res.applied, 3);
  // still applied despite drift:
  assert.equal(pms[0].name, "PMI Mile High");
  assert.equal(canon["edward-rose-sons"].canonicalName, "Edward Rose & Sons");
  assert.deepEqual(res.drifted, ["a-denver-co", "edward-rose-sons"]);
  assert.ok(!res.drifted.includes("b-denver-co")); // name matched originalName → no drift
});
