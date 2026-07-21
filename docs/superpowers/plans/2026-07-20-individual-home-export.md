# Individual-Home Export (Property Detail Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the individual scattered-SFR homes an operator manages (address + un-scored per-home observations) as a new "Homes" sheet on the existing Properties export, backed by a new Neon `PropertyHome` table read on demand.

**Architecture:** Pipeline emits a per-home extract (`property_homes.jsonl`) from its existing per-listing loop → an owner-run loader upserts it into a `PropertyHome` Neon table → the Properties export route reads it on demand and appends a "Homes" sheet. No scorecard-blob reseed (separate table). Design: `docs/superpowers/specs/2026-07-20-individual-home-export-design.md`.

**Tech Stack:** Prisma + Neon, TypeScript, `node:test`, XLSX, Python 3 (`unittest`), Next.js route handler.

## Global Constraints

- **Un-scored:** `PropertyHome` and the Homes sheet carry NO star/percentile/rank/score column (rank-leak guardrail — mirrors `property-detail-view.ts` / `property-export.ts`).
- **Grain:** one row per distinct home per operator, deduped on the source address id. Scattered SFR only — MF-community listings are excluded (they're the Phase 1 per-community rollup).
- **Coverage:** eligible operators only (the operators that get a full `pm_out` / `propertyDetail`).
- **Final column set (source-driven):** the source listings have `bedrooms` but **no bathrooms** field, so there is **no bathrooms column**. Home fields: `addressId`, `address`, `submarket`, `latitude`, `longitude`, `bedrooms`, `medianRentT12`, `domT12`, `lastListedDate`, `nListings`, `concession`.
- **Entitlement:** the export route's existing gate is the ONLY control (same `resolveViewerEntitlement()`/`isMarketEntitled()`, 404-not-403 as the PDF route). No new authz. Homes never render in-app or on `/sample`.
- **DB writes:** never run `prisma db seed`/migrations against Neon by hand from here; the migration ships via `vercel-build`'s `prisma migrate deploy`. The loader is owner-run.
- **TEST CONVENTION:** Python = stdlib `unittest`, run `python3 <test>.py` from `scripts/data-pipeline/`. TS = `node:test` via `npx tsx --test`.
- **Pipeline can't run here** (needs the Shared-Drive source CSVs) — the pipeline collector (Task 3) is verified by `py_compile` + the pure aggregation's unit tests; real data validation happens on the owner's pipeline run.

---

## File Structure

**Create:**
- `prisma/migrations/<ts>_property_home/migration.sql` — the `PropertyHome` table.
- `scripts/load-property-homes.ts` — owner-run loader (extract → Neon upsert).
- `scripts/data-pipeline/test_property_homes.py` — unit tests for the pure aggregation.

**Modify:**
- `prisma/schema.prisma` — add `PropertyHome` model.
- `scripts/data-pipeline/property_detail.py` — add pure `build_home_records()`.
- `scripts/data-pipeline/pipeline.py` — accumulate `home_recs` in the SFR per-listing path + emit `property_homes.jsonl`.
- `src/lib/scorecard/property-export.ts` — `buildHomesSheet()` + `buildPropertyWorkbook(scorecard, homes)`.
- `src/lib/scorecard/property-export.test.ts` — Homes-sheet tests (create if absent).
- `src/app/api/scorecard/[slug]/properties/route.ts` — fetch `PropertyHome`, pass to the workbook, adjust the 404.

---

## Task 1: `PropertyHome` schema + migration

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/<timestamp>_property_home/migration.sql`

**Interfaces:** Produces the `PropertyHome` model (Prisma Client type) consumed by Tasks 4 (loader) + 5 (route).

- [ ] **Step 1: Add the model** — append to `prisma/schema.prisma`:

```prisma
// v0.27 — Phase 2 individual-home detail. One row per distinct scattered-SFR
// home per operator, deduped on the source address id. Populated by the
// owner-run scripts/load-property-homes.ts from the pipeline's
// property_homes.jsonl extract (NOT reseeded with scorecardData). Read
// on-demand by the Properties export route to append a "Homes" sheet.
// Un-scored — observations only.
model PropertyHome {
  id             String    @id @default(cuid())
  pmSlug         String
  marketId       String
  addressId      String
  address        String
  submarket      String?
  latitude       Float?
  longitude      Float?
  bedrooms       Int?
  medianRentT12  Int?
  domT12         Int?
  lastListedDate DateTime?
  nListings      Int       @default(0)
  concession     Boolean   @default(false)
  createdAt      DateTime  @default(now())

  @@unique([pmSlug, addressId])
  @@index([pmSlug])
}
```

- [ ] **Step 2: Generate the migration SQL** (do NOT apply to Neon)

Run: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` is not the flow here; instead create the migration file directly to avoid touching the shared DB. Create `prisma/migrations/<timestamp>_property_home/migration.sql` (timestamp format `YYYYMMDDHHMMSS`, matching existing dirs):

```sql
-- CreateTable
CREATE TABLE "PropertyHome" (
    "id" TEXT NOT NULL,
    "pmSlug" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "submarket" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "medianRentT12" INTEGER,
    "domT12" INTEGER,
    "lastListedDate" TIMESTAMP(3),
    "nListings" INTEGER NOT NULL DEFAULT 0,
    "concession" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyHome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyHome_pmSlug_addressId_key" ON "PropertyHome"("pmSlug", "addressId");

-- CreateIndex
CREATE INDEX "PropertyHome_pmSlug_idx" ON "PropertyHome"("pmSlug");
```
> Match the exact column SQL Prisma would emit by cross-checking a recent migration in `prisma/migrations/`. If unsure of the emitted form for any type, generate it with `prisma migrate dev --create-only` against a LOCAL throwaway DB, never the shared Neon.

- [ ] **Step 3: Regenerate client + typecheck**

Run: `npx prisma generate && npx tsc --noEmit 2>&1 | grep -i propertyhome || echo clean`
Expected: `clean` (the `PropertyHome` delegate now exists on the Prisma client).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(homes): PropertyHome table + migration"
```

---

## Task 2: Pure per-home aggregation (Python)

**Files:** Modify `scripts/data-pipeline/property_detail.py`; Test `scripts/data-pipeline/test_property_homes.py`

**Interfaces:**
- Consumes: a `home_recs` dict keyed by `addressId` → accumulator (see shape below), built by Task 3.
- Produces: `build_home_records(home_recs) -> list[dict]` — one per-home record; each = `{addressId, address, submarket, latitude, longitude, bedrooms, medianRentT12, domT12, lastListedDate, nListings, concession}`.

- [ ] **Step 1: Write the failing test** — `scripts/data-pipeline/test_property_homes.py`

```python
import unittest
from property_detail import build_home_records


def _acc(**kw):
    base = {"address": "", "submarket": None, "lat": None, "lng": None,
            "brs": [], "rents": [], "doms": [], "dates": [], "concession": False, "n": 0}
    base.update(kw)
    return base


class BuildHomeRecords(unittest.TestCase):
    def test_aggregates_one_home_across_events(self):
        recs = {"a1": _acc(address="12 Oak St", submarket="chattanooga", lat=35.0, lng=-85.3,
                           brs=[3, 3], rents=[1400, 1500], doms=[20, 30],
                           dates=["2026-01-01", "2026-06-01"], concession=True, n=2)}
        out = build_home_records(recs)
        self.assertEqual(len(out), 1)
        r = out[0]
        self.assertEqual(r["addressId"], "a1")
        self.assertEqual(r["address"], "12 Oak St")
        self.assertEqual(r["submarket"], "chattanooga")
        self.assertEqual(r["bedrooms"], 3)                       # modal
        self.assertEqual(r["medianRentT12"], 1450)               # median rounded
        self.assertEqual(r["domT12"], 25)                        # median rounded
        self.assertEqual(r["lastListedDate"], "2026-06-01")      # max
        self.assertEqual(r["nListings"], 2)
        self.assertTrue(r["concession"])

    def test_nulls_when_no_numeric_data(self):
        out = build_home_records({"a2": _acc(address="9 Elm", n=1)})
        r = out[0]
        self.assertIsNone(r["medianRentT12"])
        self.assertIsNone(r["domT12"])
        self.assertIsNone(r["bedrooms"])
        self.assertIsNone(r["lastListedDate"])

    def test_sorted_by_address(self):
        out = build_home_records({"a": _acc(address="Zebra Ln", n=1),
                                  "b": _acc(address="Alpha Rd", n=1)})
        self.assertEqual([r["address"] for r in out], ["Alpha Rd", "Zebra Ln"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it — verify RED**

Run: `cd scripts/data-pipeline && python3 test_property_homes.py`
Expected: FAIL — `ImportError: cannot import name 'build_home_records'`.

- [ ] **Step 3: Implement** — add to `scripts/data-pipeline/property_detail.py`:

```python
import statistics
from collections import Counter


def build_home_records(home_recs):
    """Per-home aggregation for Phase 2 individual-home export. Pure.

    home_recs: dict[address_id] -> accumulator with keys:
      address:str, submarket:str|None, lat:float|None, lng:float|None,
      brs:list[int], rents:list[float], doms:list[int], dates:list[str],
      concession:bool, n:int
    Returns one record per home, sorted by address, un-scored.
    """
    def _median_int(xs):
        return round(statistics.median(xs)) if xs else None

    def _modal_int(xs):
        return Counter(xs).most_common(1)[0][0] if xs else None

    out = []
    for aid, a in home_recs.items():
        out.append({
            "addressId": aid,
            "address": a.get("address") or "",
            "submarket": a.get("submarket"),
            "latitude": a.get("lat"),
            "longitude": a.get("lng"),
            "bedrooms": _modal_int(a.get("brs") or []),
            "medianRentT12": _median_int(a.get("rents") or []),
            "domT12": _median_int(a.get("doms") or []),
            "lastListedDate": max(a["dates"]) if a.get("dates") else None,
            "nListings": a.get("n") or 0,
            "concession": bool(a.get("concession")),
        })
    out.sort(key=lambda r: (r["address"] or "").lower())
    return out
```
> `dates` are ISO `YYYY-MM-DD` strings, so lexical `max` == chronological max.

- [ ] **Step 4: Run it — verify GREEN**

Run: `cd scripts/data-pipeline && python3 test_property_homes.py`
Expected: `OK` (3 tests). Also confirm no regression: `python3 test_property_detail.py`.

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/property_detail.py scripts/data-pipeline/test_property_homes.py
git commit -m "feat(homes): pure per-home aggregation build_home_records"
```

---

## Task 3: Pipeline collector + extract emission

**Files:** Modify `scripts/data-pipeline/pipeline.py`

**Interfaces:** Consumes `build_home_records` (Task 2). Produces `property_homes.jsonl` (one JSON object per home) written alongside the per-market pipeline output; consumed by Task 4's loader.

- [ ] **Step 1: Init the accumulator** — in the per-operator dict init (`init_rich`, ~line 469, beside `"sfr_dom"`/`"sfr_homes"`), add:

```python
        # Phase 2 — per-home accumulator, keyed by address1_id. Scattered SFR
        # only (community listings are the Phase 1 per-community rollup).
        "home_recs": {},
```

- [ ] **Step 2: Populate it in the SFR per-listing path.** The T12 SFR branch is `elif addr_city_slug:` at ~line 702. Immediately after the existing `d["sfr_*"]` accumulation there, add (all fields are already locals in this loop — `aid`, `row`, `addr_city_slug`, `lat`, `lng`, `br`, `rent`, `ct`):

```python
                if aid:
                    hr = d["home_recs"].setdefault(aid, {
                        "address": "", "submarket": addr_city_slug, "lat": None, "lng": None,
                        "brs": [], "rents": [], "doms": [], "dates": [], "concession": False, "n": 0,
                    })
                    hr["n"] += 1
                    if not hr["address"]:
                        hr["address"] = (row.get("address_1") or "").strip() or addr_city or ""
                    if hr["lat"] is None and lat is not None: hr["lat"] = lat
                    if hr["lng"] is None and lng is not None: hr["lng"] = lng
                    if br is not None: hr["brs"].append(br)
                    if rent and rent > 0: hr["rents"].append(rent)
                    if ct: hr["dates"].append(ct.date().isoformat())
```

- [ ] **Step 3: Fold DOM + concession into the same home.** In the DOM block, the SFR arm is `elif addr_city_slug: d["sfr_dom"][addr_city_slug].append(dom_days)` (~line 720) — add beside it:

```python
                    if aid and aid in d["home_recs"]:
                        d["home_recs"][aid]["doms"].append(dom_days)
```
And in the concession block, the SFR arm is `elif addr_city_slug: d["sfr_concession"][addr_city_slug] += 1` (~line 758) — add beside it:

```python
                    if aid and aid in d["home_recs"]:
                        d["home_recs"][aid]["concession"] = True
```
> Both guard on `aid in d["home_recs"]` so a listing with a `cid` (community) never lands in `home_recs` — the `home_recs` entry is only created in the SFR (`elif addr_city_slug`) branch of Step 2.

- [ ] **Step 4: Emit the extract.** Where `propertyDetail` is attached to `pm_out` (~line 2060, `assemble_property_detail(...)` block), for eligible operators only (the same `pm_out` path), append this operator's homes to the market extract file:

```python
    from property_detail import build_home_records  # top-of-file import in practice
    homes = build_home_records(pm_out_dict_source["home_recs"])  # use the operator's `d`
    with open(HOMES_EXTRACT_PATH, "a") as hf:
        for h in homes:
            h["pmSlug"] = pm_out["slug"]
            h["marketId"] = MARKET_ID   # the market being processed
            hf.write(json.dumps(h) + "\n")
```
> Wire `HOMES_EXTRACT_PATH` next to where the per-market `Scorecard_Data_*.json` is written (same OUTPUT dir + market slug: `property_homes_<market>.jsonl`), truncated at the start of each market run. Use the actual local variable holding the operator accumulator (`d`) and the operator slug/marketId as they exist at that emit site — confirm names when editing. Import `build_home_records` at the top with the other `property_detail` imports.

- [ ] **Step 5: Verify (no pipeline run here)**

Run: `cd scripts/data-pipeline && python3 -c "import py_compile; py_compile.compile('pipeline.py', doraise=True); print('compile ok')"` and re-run `python3 test_property_homes.py` + `python3 test_property_detail.py`.
Expected: compile ok; tests OK. **Report that real-data validation requires the owner's pipeline run** (source CSVs absent here) — same constraint as Phase 1.

- [ ] **Step 6: Commit**

```bash
git add scripts/data-pipeline/pipeline.py
git commit -m "feat(homes): pipeline collects per-home records + emits property_homes.jsonl"
```

---

## Task 4: Loader `scripts/load-property-homes.ts`

**Files:** Create `scripts/load-property-homes.ts`

**Interfaces:** Reads `property_homes_*.jsonl`; upserts `PropertyHome` (Task 1). Mirrors `scripts/backfill-trajectory.ts` (chunked upsert, `--reset`, ambient `DATABASE_URL`).

- [ ] **Step 1: Implement**

```ts
// Owner-run loader: read the pipeline's per-home extract (property_homes_*.jsonl)
// and upsert PropertyHome rows into Neon. Mirrors backfill-trajectory.ts —
// ambient DATABASE_URL via the shared prisma singleton, chunked upsert so a
// re-run REFRESHES (idempotent on @@unique([pmSlug, addressId])). Run directly:
//   HOMES_DIR=/path/to/pipeline/output npx tsx scripts/load-property-homes.ts
//   npx tsx scripts/load-property-homes.ts --reset   # clear loaded operators first
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

interface HomeRec {
  pmSlug: string; marketId: string; addressId: string; address: string;
  submarket: string | null; latitude: number | null; longitude: number | null;
  bedrooms: number | null; medianRentT12: number | null; domT12: number | null;
  lastListedDate: string | null; nListings: number; concession: boolean;
}

export function parseHomeRecord(line: string): HomeRec | null {
  const t = line.trim();
  if (!t) return null;
  const o = JSON.parse(t);
  if (!o.pmSlug || !o.addressId) return null;
  return {
    pmSlug: o.pmSlug, marketId: o.marketId ?? "", addressId: o.addressId,
    address: o.address ?? "", submarket: o.submarket ?? null,
    latitude: o.latitude ?? null, longitude: o.longitude ?? null,
    bedrooms: o.bedrooms ?? null, medianRentT12: o.medianRentT12 ?? null,
    domT12: o.domT12 ?? null, lastListedDate: o.lastListedDate ?? null,
    nListings: o.nListings ?? 0, concession: !!o.concession,
  };
}

async function main() {
  const reset = process.argv.includes("--reset");
  const dir = process.env.HOMES_DIR || path.join(process.cwd(), "scripts/data-pipeline");
  const files = fs.readdirSync(dir).filter((f) => /^property_homes.*\.jsonl$/.test(f));
  const recs: HomeRec[] = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      const r = parseHomeRecord(line);
      if (r) recs.push(r);
    }
  }
  console.log(`files=${files.length} homes=${recs.length}`);
  if (reset) {
    const slugs = [...new Set(recs.map((r) => r.pmSlug))];
    const del = await prisma.propertyHome.deleteMany({ where: { pmSlug: { in: slugs } } });
    console.log(`reset: deleted ${del.count} rows for ${slugs.length} operators`);
  }
  const CHUNK = 20;
  for (let i = 0; i < recs.length; i += CHUNK) {
    await Promise.all(recs.slice(i, i + CHUNK).map((r) => {
      const data = { ...r, lastListedDate: r.lastListedDate ? new Date(r.lastListedDate) : null };
      const { pmSlug, addressId, ...rest } = data;
      return prisma.propertyHome.upsert({
        where: { pmSlug_addressId: { pmSlug, addressId } },
        create: data,
        update: rest,
      });
    }));
    if (i % 2000 === 0) console.log(`  ${i}/${recs.length}`);
  }
  const total = await prisma.propertyHome.count();
  console.log(`DONE. PropertyHome rows: ${total}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Test the pure parser** — Create `scripts/load-property-homes.test.ts`:

```ts
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
```
> `load-property-homes.ts` imports `@/lib/prisma` at module top; if that makes the `node:test` import connect to Neon, move `parseHomeRecord` to keep the test DB-free (guard `main()` behind `if (process.argv[1]?.includes("load-property-homes"))`), or extract the parser to a sibling `load-property-homes.pure.ts`. Confirm the test runs without a live DB.

Run: `npx tsx --test scripts/load-property-homes.test.ts` → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit**

```bash
git add scripts/load-property-homes.ts scripts/load-property-homes.test.ts
git commit -m "feat(homes): owner-run loader extract -> PropertyHome (upsert)"
```

---

## Task 5: Export "Homes" sheet + route wiring

**Files:** Modify `src/lib/scorecard/property-export.ts`, `src/app/api/scorecard/[slug]/properties/route.ts`; Test `src/lib/scorecard/property-export.test.ts`

**Interfaces:** Consumes `PropertyHome` rows (Task 1) from the route; extends `buildPropertyWorkbook`.

- [ ] **Step 1: Add the Homes sheet builder + optional param** — in `src/lib/scorecard/property-export.ts`:

```ts
/** Row shape the Homes sheet needs (subset of the PropertyHome model). */
export interface PropertyHomeRow {
  address: string; submarket: string | null; bedrooms: number | null;
  medianRentT12: number | null; domT12: number | null;
  lastListedDate: Date | null; nListings: number; concession: boolean;
}

const HOME_HEADERS = [
  "Address", "Submarket", "Beds", "Median Rent", "Median DOM",
  "Last Listed", "N Listings", "Concession",
] as const;

function buildHomesSheet(homes: PropertyHomeRow[]): WorkSheet {
  const rows = homes.map((h) => [
    h.address, h.submarket, h.bedrooms, h.medianRentT12, h.domT12,
    h.lastListedDate ? h.lastListedDate.toISOString().slice(0, 10) : null,
    h.nListings, h.concession ? "Yes" : "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([[...HOME_HEADERS], ...rows]);
  ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 6 }, { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 11 }, { wch: 11 }];
  return ws;
}
```
Then change `buildPropertyWorkbook` to accept homes and append the sheet when non-empty:

```ts
export function buildPropertyWorkbook(
  scorecard: ScorecardData,
  homes: PropertyHomeRow[] = []
): PropertyExportResult {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildPropertiesSheet(scorecard), "Properties");
  if (homes.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildHomesSheet(homes), "Homes");
  }
  const generatedAt = new Date(scorecard.dataAsOf);
  return { workbook: wb, filename: buildFilename(`${scorecard.pm.name} properties`, generatedAt) };
}
```

- [ ] **Step 2: Wire the route** — in `src/app/api/scorecard/[slug]/properties/route.ts`:

Fetch homes after `parseScorecard`, and relax the 404 to fire only when BOTH are empty:

```ts
    const scorecard = parseScorecard(pm);
    const homes = await prisma.propertyHome.findMany({
      where: { pmSlug: slug },
      orderBy: [{ submarket: "asc" }, { address: "asc" }],
    });

    const hasRollup = !!scorecard.propertyDetail && scorecard.propertyDetail.properties.length > 0;
    if (!hasRollup && homes.length === 0) {
      return new Response("No property detail available", { status: 404 });
    }

    const { workbook, filename } = buildPropertyWorkbook(scorecard, homes);
```
> The `PropertyHome` rows already match `PropertyHomeRow` structurally (extra fields are ignored by the builder). Keep the entitlement gate above exactly as-is.

- [ ] **Step 3: Tests** — extend/create `src/lib/scorecard/property-export.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import * as XLSX from "xlsx";
import { buildPropertyWorkbook, type PropertyHomeRow } from "./property-export";

const sc: any = { pm: { name: "Acme" }, dataAsOf: "2026-07-15",
  propertyDetail: { properties: [{ label: "X", kind: "sfr-submarket", submarket: "c", units: null, homes: 5, nListings: 8, medianDomT12: 20, medianRentT12: 1400, rentYoY: 0.03, concessionRate: 0.05, listingQuality: 70 }], comps: { medianDomT12: 25, medianRentT12: 1500, rentYoY: 0.02, concessionRate: 0.03 } } };
const homes: PropertyHomeRow[] = [
  { address: "12 Oak St", submarket: "c", bedrooms: 3, medianRentT12: 1450, domT12: 25, lastListedDate: new Date("2026-06-01"), nListings: 2, concession: true },
];

test("workbook has a Homes sheet when homes present", () => {
  const { workbook } = buildPropertyWorkbook(sc, homes);
  assert.deepEqual(workbook.SheetNames, ["Properties", "Homes"]);
});
test("no Homes sheet when homes empty", () => {
  const { workbook } = buildPropertyWorkbook(sc, []);
  assert.deepEqual(workbook.SheetNames, ["Properties"]);
});
test("Homes sheet has address + no score column", () => {
  const { workbook } = buildPropertyWorkbook(sc, homes);
  const aoa = XLSX.utils.sheet_to_json(workbook.Sheets["Homes"], { header: 1 }) as any[][];
  assert.deepEqual(aoa[0], ["Address", "Submarket", "Beds", "Median Rent", "Median DOM", "Last Listed", "N Listings", "Concession"]);
  assert.equal(aoa[1][0], "12 Oak St");
  assert.ok(!aoa[0].some((h: string) => /score|star|percentile|rank/i.test(h)));
});
```

Run: `npx tsx --test src/lib/scorecard/property-export.test.ts` → PASS. `npx tsc --noEmit` clean. Run the component/watch-list suites if they touch these.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scorecard/property-export.ts src/lib/scorecard/property-export.test.ts "src/app/api/scorecard/[slug]/properties/route.ts"
git commit -m "feat(homes): Homes sheet on the Properties export (read PropertyHome on demand)"
```

---

## Post-implementation (operational, owner-run)

1. Owner runs the pipeline (emits `property_homes_*.jsonl` per market).
2. `HOMES_DIR=<pipeline output> npx tsx scripts/load-property-homes.ts` → `PropertyHome` populated in Neon. `--reset` on a refresh.
3. Deploy already shipped the migration (empty table) + the export code; the Homes sheet goes live for entitled users once rows exist. No scorecard reseed.

## Self-Review Notes

- **Spec coverage:** model (§3) → T1; pure aggregation (§4) → T2; pipeline collector (§4) → T3; loader (§5) → T4; export sheet + route + 404 (§6) → T5; rollout (§9) → Post-implementation. Covered.
- **Bathrooms:** dropped vs the spec's tentative "if source has them" — the source has only `bedrooms`. Stated in Global Constraints; no `bathrooms` column anywhere.
- **Un-scored:** no score column in the model or the Homes sheet; a test asserts the header carries no score/star/percentile/rank.
- **Type consistency:** `PropertyHomeRow` (export) is a structural subset of the `PropertyHome` model; the loader's `HomeRec` matches the extract keys emitted by Task 3; `build_home_records` output keys == the extract record == the model columns.
- **Field names in Task 3** are anchored to real pipeline locals (`aid`, `row.get("address_1")`, `addr_city_slug`, `lat`, `lng`, `br`, `rent`, `ct`, `dom_days`) confirmed in `pipeline.py`; the emit-site variable names (`d`, operator slug, market id) must be confirmed at that site when editing.
