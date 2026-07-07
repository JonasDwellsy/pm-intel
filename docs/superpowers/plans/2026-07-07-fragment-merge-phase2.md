# Within-Market Fragment Merge — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the apply-path so human-curated "possible"-tier merge decisions (stored in `OperatorMergeDecision`) take effect in the seed — via an export script (DB → committed `merge_decisions.json`) and a merge-map extension to the Phase-1 grouping.

**Architecture:** `within_market_key` (pure, in `operator_grouping.py`) gains an optional merge-map: a curated member key remaps to its survivor key, so member operators' rows pool and metrics recompute — identical to the exact tier. A tsx export script reads the DB via Prisma, resolves member slugs → name-keys against the current seed, and writes the committed `merge_decisions.json`. Ships as a **zero-diff-to-seed enabling change** (no curation yet → empty file → pipeline no-op → no re-seed needed to merge).

**Tech Stack:** Python 3 (stdlib, `unittest`) for the pipeline; tsx/Prisma for the export; Node test runner.

**Spec:** `docs/superpowers/specs/2026-07-07-fragment-merge-phase2-design.md`

## Global Constraints
- Do NOT run `prisma db seed`; do NOT read `.env*`. Pipeline runs use scratch `--out-dir`.
- Run the Python pipeline from `scripts/data-pipeline/`.
- `merge_decisions.json` ships **empty** (`{"decisions": []}`) — no curation exists yet; the change must be a no-op on the seed (no re-seed to merge the PR).
- Merge-map keys are the full `name:<namekey>` form, matching `within_market_key`'s output. `survivorKey` is itself a member key (maps to itself, carrying `canonicalName`/`survivorSlug`).
- Precedence in `within_market_key`: parent-id → placeholder guard → do-not-merge → **merge-map** → normal name-key. Only no-parent (name-keyed) operators are merge candidates.
- The TS export's name-key normalization MUST match Python `name_key` exactly (lowercase, alphanumeric-only) — pin it with a test.
- Merged operator: display = `canonicalName`, slug = `survivorSlug` (URL stability). Don't touch exact-tier / do-not-merge / parent-linked / `overallGap` behavior.

---

### Task 1: Merge-map in `operator_grouping` (pure) + tests + empty file

**Files:**
- Modify: `scripts/data-pipeline/operator_grouping.py`
- Modify: `scripts/data-pipeline/test_operator_grouping.py`
- Create: `scripts/data-pipeline/merge_decisions.json`

**Interfaces produced (used by Task 2):**
- `load_merge_decisions(path) -> dict[(marketId, key) -> {"survivorKey","canonicalName","survivorSlug"}]`
- `within_market_key(parent_id, child_id, name, market_id, do_not_merge, merge_map=None) -> str`
- `merged_override(market_id, key, merge_map) -> {"canonicalName","survivorSlug"} | None`

- [ ] **Step 1: Write failing tests** — add to `test_operator_grouping.py`:

```python
from operator_grouping import (
    within_market_key, load_do_not_merge, merged_override,  # merged_override new
)
import json as _json, tempfile as _tf, os as _os

class MergeMap(unittest.TestCase):
    MAP = {
        ("phoenix-az", "name:krsholdings"): {"survivorKey": "name:krsholdings",
            "canonicalName": "KRS Holdings", "survivorSlug": "krs-holdings"},
        ("phoenix-az", "name:jamiebrightkrsholdings"): {"survivorKey": "name:krsholdings",
            "canonicalName": "KRS Holdings", "survivorSlug": "krs-holdings"},
    }
    def test_member_remaps_to_survivor(self):
        self.assertEqual(
            within_market_key("", "1", "Jamie Bright, KRS Holdings", "phoenix-az", set(), self.MAP),
            "name:krsholdings")
    def test_survivor_maps_to_itself(self):
        self.assertEqual(
            within_market_key("", "2", "KRS Holdings", "phoenix-az", set(), self.MAP),
            "name:krsholdings")
    def test_market_scoped(self):
        self.assertEqual(
            within_market_key("", "3", "Jamie Bright, KRS Holdings", "denver-co", set(), self.MAP),
            "name:jamiebrightkrsholdings")   # different market -> normal key
    def test_unknown_key_untouched(self):
        self.assertEqual(
            within_market_key("", "4", "Some Other Realty", "phoenix-az", set(), self.MAP),
            "name:someotherrealty")
    def test_no_merge_map_is_noop(self):
        self.assertEqual(
            within_market_key("", "5", "KRS Holdings", "phoenix-az", set(), None),
            "name:krsholdings")
    def test_do_not_merge_wins_over_merge_map(self):
        dnm = {("phoenix-az", "krsholdings")}
        self.assertEqual(
            within_market_key("", "9", "KRS Holdings", "phoenix-az", dnm, self.MAP), "9")
    def test_merged_override_returns_survivor_identity(self):
        ov = merged_override("phoenix-az", "name:krsholdings", self.MAP)
        self.assertEqual(ov, {"canonicalName": "KRS Holdings", "survivorSlug": "krs-holdings"})
    def test_merged_override_none_for_non_survivor(self):
        self.assertIsNone(merged_override("phoenix-az", "name:someotherrealty", self.MAP))
        self.assertIsNone(merged_override("phoenix-az", "name:krsholdings", None))

class LoadMergeDecisions(unittest.TestCase):
    def test_loads_and_expands_members(self):
        from operator_grouping import load_merge_decisions
        blob = {"decisions": [{"marketId": "phoenix-az", "survivorKey": "name:krsholdings",
            "canonicalName": "KRS Holdings", "survivorSlug": "krs-holdings",
            "memberKeys": ["name:krsholdings", "name:jamiebrightkrsholdings"]}]}
        with _tf.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            _json.dump(blob, f); p = f.name
        m = load_merge_decisions(p); _os.unlink(p)
        self.assertEqual(m[("phoenix-az", "name:jamiebrightkrsholdings")]["survivorKey"], "name:krsholdings")
        self.assertEqual(len(m), 2)
    def test_missing_file_empty(self):
        from operator_grouping import load_merge_decisions
        self.assertEqual(load_merge_decisions("/no/such.json"), {})
```

Run `cd scripts/data-pipeline && python3 test_operator_grouping.py` → FAIL (no `merged_override`/`load_merge_decisions`).

- [ ] **Step 2: Implement** in `operator_grouping.py`:

```python
def load_merge_decisions(path):
    """Load merge_decisions.json -> {(marketId, memberKey): {survivorKey, canonicalName,
    survivorSlug}}. survivorKey is itself a member (maps to itself)."""
    if not os.path.isfile(path):
        return {}
    with open(path) as f:
        data = json.load(f)
    out = {}
    for d in data.get("decisions", []):
        info = {"survivorKey": d["survivorKey"], "canonicalName": d["canonicalName"],
                "survivorSlug": d["survivorSlug"]}
        for mk in d["memberKeys"]:
            out[(d["marketId"], mk)] = info
    return out


def merged_override(market_id, key, merge_map):
    """If `key` is a merged SURVIVOR key in this market, return its
    {canonicalName, survivorSlug}; else None."""
    if not merge_map:
        return None
    info = merge_map.get((market_id, key))
    if info and info["survivorKey"] == key:
        return {"canonicalName": info["canonicalName"], "survivorSlug": info["survivorSlug"]}
    return None
```

And extend `within_market_key` (add `merge_map=None` param; insert the remap after the do-not-merge check, before the final `return f"name:{nkey}"`):

```python
def within_market_key(parent_id, child_id, name, market_id, do_not_merge, merge_map=None):
    pid = (parent_id or "").strip()
    if pid:
        return pid
    cid = (child_id or "").strip()
    nkey = name_key(name)
    if not nkey or nkey in PLACEHOLDER_NAME_KEYS:
        return cid
    if (market_id, nkey) in do_not_merge:
        return cid or f"name:{nkey}"
    base = f"name:{nkey}"
    if merge_map:
        info = merge_map.get((market_id, base))
        if info:
            return info["survivorKey"]
    return base
```

Run tests → OK.

- [ ] **Step 3: Create the empty committed file** `scripts/data-pipeline/merge_decisions.json`:

```json
{"decisions": []}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/data-pipeline/operator_grouping.py scripts/data-pipeline/test_operator_grouping.py scripts/data-pipeline/merge_decisions.json
git commit -m "feat(pipeline): merge-map in within_market_key for curated fragment merges"
```

---

### Task 2: Wire the merge-map into `pipeline.py`

**Files:** Modify `scripts/data-pipeline/pipeline.py` (import; `MERGE_MAP` load; grouping block ~484–505; slug-assignment ~1583; a validation log).

**Interfaces consumed:** `load_merge_decisions`, `merged_override` (Task 1).

- [ ] **Step 1: Import + load** — extend the existing `from operator_grouping import ...` line to add `load_merge_decisions, merged_override`; near the `DO_NOT_MERGE = load_do_not_merge(...)` line add:

```python
MERGE_MAP = load_merge_decisions(os.path.join(_SCRIPT_DIR, "merge_decisions.json"))
```

- [ ] **Step 2: Pass merge-map + apply canonical display** — in the grouping block, pass `MERGE_MAP` to `within_market_key`, then override the display name for a merged survivor:

```python
        key = within_market_key(_parent_id_raw, _child_id_raw, company, _mkt["id"], DO_NOT_MERGE, MERGE_MAP)
        disp = (row.get("parent_company_name") or "").strip() if _parent_id_raw else company.strip()
        if not disp:
            disp = company.strip()
        _ov = merged_override(_mkt["id"], key, MERGE_MAP)
        if _ov:
            disp = _ov["canonicalName"]
        norm = key
```

- [ ] **Step 3: Force the survivor slug** — in the slug-assignment block (~1583), a merged survivor keeps its curated `survivorSlug` instead of the name-derived slug:

```python
    _ov = merged_override(_mkt["id"], norm, MERGE_MAP)
    if _ov:
        slug = _ov["survivorSlug"]
    else:
        base_slug = pm_slug(name)
        n_seen = seen_slugs_in_market.get(base_slug, 0)
        if n_seen == 0:
            slug = base_slug
        else:
            slug = f"{base_slug}-{n_seen + 1}"
            slug_collisions.append((norm, base_slug, slug))
        seen_slugs_in_market[base_slug] = n_seen + 1
```

- [ ] **Step 4: Validation log** — after ranking, before the final summary, log each applied merge (guardrail). Add a loop over the merged survivors present in `pm_features`:

```python
_seen_merges = set()
for _norm in pm_features:
    _ov = merged_override(_mkt["id"], _norm, MERGE_MAP)
    if _ov and _norm not in _seen_merges:
        _seen_merges.add(_norm)
        _t12 = pm_features[_norm].get("t12_listings")
        log(f"[merge] applied curated merge → {_ov['canonicalName']!r} (slug {_ov['survivorSlug']}), T12={_t12}")
```

- [ ] **Step 5: No-op integration check (empty file)** — with the committed empty `merge_decisions.json`, run a market and confirm nothing changed:

```bash
cd scripts/data-pipeline && python3 pipeline.py --market montgomery-al --config markets.json --out-dir /tmp/iq_p2 >/dev/null 2>&1 && echo "ran clean"
python3 test_operator_grouping.py && python3 test_tenancy_survival.py
```
Expected: clean run; no `[merge] applied` lines (empty map); tests green.

- [ ] **Step 6: Commit**

```bash
git add scripts/data-pipeline/pipeline.py
git commit -m "feat(pipeline): apply curated merge-map (display + survivor slug + log)"
```

---

### Task 3: `export_merge_decisions.ts` (DB → committed file)

**Files:** Create `scripts/data-pipeline/export_merge_decisions.ts` + `scripts/data-pipeline/export_merge_decisions.test.ts`.

**Interfaces produced:** a pure `resolveDecisions(decisions, seedPms)` core + a thin `main()` (Prisma read + file write).

- [ ] **Step 1: Write the failing test** (`export_merge_decisions.test.ts`) — unit-test the pure resolver, incl. the skip-on-unresolvable guard and name-key parity:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { nameKey, resolveDecisions } from "./export_merge_decisions";

test("nameKey matches Python name_key (lowercase alphanumerics only)", () => {
  assert.equal(nameKey("Jamie Bright, KRS Holdings"), "jamiebrightkrsholdings");
  assert.equal(nameKey("R.P. Management, Inc."), "rpmanagementinc");
});

test("resolveDecisions maps member slugs to name-keys", () => {
  const seed = [
    { slug: "krs-holdings", name: "KRS Holdings", marketId: "phoenix-az" },
    { slug: "jamie-bright-krs-holdings", name: "Jamie Bright, KRS Holdings", marketId: "phoenix-az" },
  ];
  const decisions = [{ marketId: "phoenix-az", decision: "merge", canonicalName: "KRS Holdings",
    survivorSlug: "krs-holdings", memberSlugs: JSON.stringify(["krs-holdings", "jamie-bright-krs-holdings"]) }];
  const { decisions: out, skipped } = resolveDecisions(decisions as any, seed);
  assert.equal(skipped.length, 0);
  assert.deepEqual(out[0].memberKeys.sort(), ["name:jamiebrightkrsholdings", "name:krsholdings"]);
  assert.equal(out[0].survivorKey, "name:krsholdings");
});

test("resolveDecisions SKIPS a decision with an unresolvable member slug", () => {
  const seed = [{ slug: "krs-holdings", name: "KRS Holdings", marketId: "phoenix-az" }];
  const decisions = [{ marketId: "phoenix-az", decision: "merge", canonicalName: "KRS Holdings",
    survivorSlug: "krs-holdings", memberSlugs: JSON.stringify(["krs-holdings", "gone-slug"]) }];
  const { decisions: out, skipped } = resolveDecisions(decisions as any, seed);
  assert.equal(out.length, 0);
  assert.equal(skipped.length, 1);
});
```

Run `npx tsx --test scripts/data-pipeline/export_merge_decisions.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement** `export_merge_decisions.ts`:

```typescript
// Reads curated OperatorMergeDecision "merge" rows and writes a committed
// merge_decisions.json the Python pipeline applies. Resolves member SLUGS to
// grouping name-keys against the current committed seed. Run before a re-seed.
//   npx tsx scripts/data-pipeline/export_merge_decisions.ts
import fs from "node:fs";
import path from "node:path";

export function nameKey(name: string): string {
  // MUST match Python operator_grouping.name_key: lowercase, alphanumerics only.
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface DbDecision { marketId: string; decision: string; canonicalName: string | null;
  survivorSlug: string | null; memberSlugs: string; }
interface SeedPm { slug: string; name: string; marketId: string; }
interface OutDecision { marketId: string; survivorKey: string; canonicalName: string;
  survivorSlug: string; memberKeys: string[]; }

export function resolveDecisions(rows: DbDecision[], seedPms: SeedPm[]) {
  const keyBySlug = new Map<string, string>(); // `${market}::${slug}` -> `name:<k>`
  for (const p of seedPms) keyBySlug.set(`${p.marketId}::${p.slug}`, `name:${nameKey(p.name)}`);
  const decisions: OutDecision[] = [];
  const skipped: { marketId: string; reason: string }[] = [];
  for (const r of rows) {
    if (r.decision !== "merge") continue;
    const members: string[] = JSON.parse(r.memberSlugs || "[]");
    const memberKeys: string[] = [];
    let unresolved: string | null = null;
    for (const s of members) {
      const k = keyBySlug.get(`${r.marketId}::${s}`);
      if (!k) { unresolved = s; break; }
      if (!memberKeys.includes(k)) memberKeys.push(k);
    }
    const survivorKey = r.survivorSlug ? keyBySlug.get(`${r.marketId}::${r.survivorSlug}`) : undefined;
    if (unresolved || !survivorKey || !r.canonicalName || memberKeys.length < 2) {
      skipped.push({ marketId: r.marketId, reason: unresolved ? `unresolvable slug ${unresolved}` : "incomplete/degenerate" });
      continue;
    }
    decisions.push({ marketId: r.marketId, survivorKey, canonicalName: r.canonicalName,
      survivorSlug: r.survivorSlug!, memberKeys: memberKeys.sort() });
  }
  decisions.sort((a, b) => (a.marketId + a.survivorKey).localeCompare(b.marketId + b.survivorKey));
  return { decisions, skipped };
}

async function main() {
  const { prisma } = await import("../../src/lib/prisma");
  const rows = await prisma.operatorMergeDecision.findMany({ where: { decision: "merge" } });
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/data/scorecard_data.json"), "utf8"));
  const { decisions, skipped } = resolveDecisions(rows as any, seed.pms);
  for (const s of skipped) console.warn(`[export] SKIPPED ${s.marketId}: ${s.reason}`);
  const out = { generatedAt: new Date().toISOString(), decisions };
  fs.writeFileSync(path.join(__dirname, "merge_decisions.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`[export] wrote ${decisions.length} merge decision(s), skipped ${skipped.length}`);
  await prisma.$disconnect();
}
// Only run main() when invoked directly (not when imported by the test).
if (process.argv[1] && process.argv[1].endsWith("export_merge_decisions.ts")) main();
```

Run the test → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add scripts/data-pipeline/export_merge_decisions.ts scripts/data-pipeline/export_merge_decisions.test.ts
git commit -m "feat(pipeline): export_merge_decisions.ts (DB decisions -> committed file)"
```

---

### Task 4: End-to-end smoke test + verify + PR

**Files:** none committed beyond the above (the smoke test's temp file is reverted).

- [ ] **Step 1: End-to-end mechanic smoke test** — prove the apply pools two real same-market operators. Pick two ranked operators in one market from the current seed (any two; the mechanic doesn't require a true near-match), hand-write a temp `merge_decisions.json` for them (survivor = one of them), run that market's pipeline to a scratch dir, and confirm one merged operator with the survivor slug + canonicalName + combined T12:

```bash
cd "$(git rev-parse --show-toplevel)"
python3 - <<'PY'
import json
d=json.load(open('src/data/scorecard_data.json'))
mkt='montgomery-al'
ops=[p for p in d['pms'] if p.get('marketId')==mkt][:2]
def nk(s): return ''.join(c.lower() for c in s if c.isalnum())
keys=[f"name:{nk(p['name'])}" for p in ops]
blob={"generatedAt":"test","decisions":[{"marketId":mkt,"survivorKey":keys[0],
  "canonicalName":"MERGE SMOKE TEST","survivorSlug":ops[0]['slug'],"memberKeys":keys}]}
open('scripts/data-pipeline/merge_decisions.json','w').write(json.dumps(blob,indent=2))
print("members:", [p['name'] for p in ops], "| slugs", [p['slug'] for p in ops])
PY
cd scripts/data-pipeline && python3 pipeline.py --market montgomery-al --config markets.json --out-dir /tmp/iq_p2smoke 2>&1 | grep -i "\[merge\] applied"
python3 -c "import json,glob; b=json.load(open(sorted(glob.glob('/tmp/iq_p2smoke/*ontgomery*'))[0])); m=[p for p in b['pms'] if p['name']=='MERGE SMOKE TEST']; print('merged op count:', len(m), '| slug', m[0]['slug'] if m else None, '| t12', m[0].get('coverage',{}).get('t12Listings') if m else None)"
```
Expected: a `[merge] applied` log line; exactly 1 operator named "MERGE SMOKE TEST" with the survivor slug and the two operators' combined T12.

- [ ] **Step 2: Revert the smoke-test file**

```bash
cd "$(git rev-parse --show-toplevel)" && git checkout scripts/data-pipeline/merge_decisions.json
python3 -c "import json;assert json.load(open('scripts/data-pipeline/merge_decisions.json'))['decisions']==[], 'must be empty'; print('merge_decisions.json empty ✓')"
```

- [ ] **Step 3: Full verify** — `npx tsc --noEmit`; `npm run test:watch-list`; `cd scripts/data-pipeline && python3 test_operator_grouping.py && python3 test_tenancy_survival.py`. All green. Confirm `git status` shows a clean tree (no stray seed change).

- [ ] **Step 4: Commit (if anything staged) + PR**

```bash
git push -u origin feat/fragment-merge-phase2
gh pr create --base main --title "Within-market fragment merge (Phase 2: curated apply-path)" --body-file <summary>
```
PR notes: enabling infra, ships zero-diff-to-seed (empty `merge_decisions.json`, pipeline no-op); when curation happens, run `export_merge_decisions.ts` → re-run → re-seed. Do NOT merge — Jonas merges.

---

## Self-Review

**Spec coverage:** §3 merge mechanic → Task 1 (+ Task 2 wiring); §3 display/slug → Task 2 Steps 2–3; §4 export + skip-guard → Task 3; §5 file format → Tasks 1/3; §6 validation log → Task 2 Step 4; §8 zero-diff + smoke test → Task 4. All covered. §9 (admin status indicator, ingestion rewire, real curation) correctly out of scope.

**Placeholder scan:** every code step has complete code or an exact command + expected output. Task 4's PR body is a `<summary>` placeholder (written at PR time from the results) — standard.

**Type/name consistency:** `load_merge_decisions` / `within_market_key(…, merge_map)` / `merged_override` signatures match between Task 1 (def + tests) and Task 2 (call sites). Merge-map value shape `{survivorKey, canonicalName, survivorSlug}` identical in Python (Task 1), the file format, and the TS export output (Task 3). `name:<namekey>` form consistent across `within_market_key` output, the export's `nameKey`, and the merge-map keys. TS `nameKey` parity with Python `name_key` is pinned by a Task 3 test.

**Ordering:** Task 2 depends on Task 1; Task 4 depends on 1–3. Export (Task 3) is independent of pipeline (Task 2) — both consume the shared file format only.
