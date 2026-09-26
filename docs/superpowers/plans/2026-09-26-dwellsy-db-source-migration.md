# Dwellsy DB Source Migration (Phase 1a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pipeline's per-market CSV reader with a read-only query against the Dwellsy production database, yielding the same 24 field names so no metric code changes.

**Architecture:** A new `dwellsy_source.py` module exposes `market_listings(msa_code, as_of)` returning an iterable of dicts keyed exactly as today's `csv.DictReader` rows. `pipeline.py` selects source via `--source={csv,db}`, defaulting to `csv` until the reconciliation gate passes. Correctness is proven by superset reconciliation against the existing CSVs, not by output equality.

**Tech Stack:** Python 3, `psycopg[binary]` 3.x, PostgreSQL 15 (`dwellsy_prod`), existing `unittest` suite in `scripts/data-pipeline/`.

## Global Constraints

- Connection string comes from `~/Documents/Dwellsy/secrets/db_connection.txt`. NEVER print, log, echo, commit, or include it in an error message.
- Every database session MUST be read-only: `SET TRANSACTION READ ONLY` plus `statement_timeout`. Only `SELECT` and catalog reads. Never create, alter, insert, update, delete, grant, or call a mutating routine.
- Qualify every production relation as `dwellsy_prod.<table>` (the dwellsy-database skill governs; ruling 2026-09-26).
- `organization_company_table` is a TRUE MANY-TO-MANY bridge (v1.13, EN-1963). A plain join through it multiplies rows. Use `EXISTS` for membership or a separately aggregated association set. NEVER pick the first organization arbitrarily.
- New York (`msa_code = '35620'`) is OUT OF SCOPE. Exclude it from every reconciliation and validation set.
- Do not change any metric definition. Operator identity is UNCHANGED (see decisions below); the only deliberate change is the population.

## Decisions after Task 2 (Jonas, 2026-09-26) — these govern over task text below

- **`field_mapping.md` governs every column expression.** Where a task's inline SQL disagrees with `scripts/data-pipeline/field_mapping.md` (bedrooms / latitude / longitude coalesces, timestamps, `msa_code::text`, `dwellsy_prod.` qualification), the mapping wins.
- **Identity stays on the company hierarchy.** `parent_company_id = company_table.parent_company_id` (a company self-reference), child = `p.company_id`, names and types from `company_table` / `company_type_table` — the export's own rule, matched 12,935/12,935 on Bozeman. Organizations are NOT identity: in Kansas City they split Beacon Management into 11 per-property operators. `organization_id` is carried as an inert extra key only.
- **Population = the data team's quality filters from `full_export_view`, minus its apartment-only clause and minus its date floor.** Rooms, out-of-range rents, blacklisted accounts, waitlist rows, sub-4-hour inactive listings, failed postal validation and inactive companies are excluded. Bozeman ≈ 18,670 rows (export 12,935, raw 21,863).
- **Timestamps are emitted as America/Los_Angeles wall-clock** (`to_char(ts at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS')`) for parity with the export. Moving to true UTC is a separate, later change.
- **Photos and amenities are current property state.** The DB has no usable history for them; this is accepted and noted in the restatement report.
- `uru_id` coverage was measured at 100% in Bozeman and New York on 2026-09-26. If a market reports less, stop and report rather than filling nulls.
- Target markets for validation: `14580` (Bozeman, reference case) and `28140` (Kansas City, mid-size).

---

### Task 1: Read-only database connection module

**Files:**
- Create: `scripts/data-pipeline/dwellsy_db.py`
- Test: `scripts/data-pipeline/test_dwellsy_db.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `connect() -> psycopg.Connection` (read-only session), `query(sql: str, params: dict | None = None) -> list[dict]`.

- [ ] **Step 1: Write the failing test**

```python
# scripts/data-pipeline/test_dwellsy_db.py
import os
import unittest

import dwellsy_db

SECRET = os.path.expanduser("~/Documents/Dwellsy/secrets/db_connection.txt")


@unittest.skipUnless(os.path.isfile(SECRET), "no Dwellsy credentials on this machine")
class DwellsyDbConnection(unittest.TestCase):
    def test_session_is_read_only(self):
        rows = dwellsy_db.query("select current_setting('transaction_read_only') as ro")
        self.assertEqual(rows[0]["ro"], "on")

    def test_query_returns_dicts_keyed_by_column(self):
        rows = dwellsy_db.query("select 1 as a, 'x' as b")
        self.assertEqual(rows, [{"a": 1, "b": "x"}])

    def test_writes_are_rejected(self):
        with self.assertRaises(Exception):
            dwellsy_db.query("create temporary table should_not_exist (i int)")

    def test_connection_string_is_never_returned(self):
        # A misconfigured error path must not leak the DSN.
        with self.assertRaises(Exception) as ctx:
            dwellsy_db.query("select * from table_that_does_not_exist_12345")
        self.assertNotIn("password", str(ctx.exception).lower())
        self.assertNotIn("@", str(ctx.exception))
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd scripts/data-pipeline && python3 -m unittest test_dwellsy_db -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'dwellsy_db'`

- [ ] **Step 3: Implement the module**

```python
# scripts/data-pipeline/dwellsy_db.py
"""Read-only access to the Dwellsy production database.

The connection string lives in ~/Documents/Dwellsy/secrets/db_connection.txt and
must never be printed, logged, or included in an exception message. Every
session is opened READ ONLY with a statement timeout; this module offers no way
to run a mutating statement.
"""
import os
import re

import psycopg
from psycopg.rows import dict_row

SECRET_PATH = os.path.expanduser("~/Documents/Dwellsy/secrets/db_connection.txt")
STATEMENT_TIMEOUT = "120s"


def _dsn() -> str:
    with open(SECRET_PATH) as fh:
        return fh.read().strip()


def _scrub(msg: str) -> str:
    """Remove anything DSN-shaped from an error before it escapes."""
    msg = re.sub(r"postgres(?:ql)?://\S+", "<dsn redacted>", msg)
    return re.sub(r"\S+:\S+@\S+", "<dsn redacted>", msg)


def connect() -> psycopg.Connection:
    conn = psycopg.connect(_dsn(), row_factory=dict_row, autocommit=False)
    with conn.cursor() as cur:
        cur.execute("SET TRANSACTION READ ONLY")
        cur.execute(f"SET statement_timeout = '{STATEMENT_TIMEOUT}'")
    return conn


def query(sql: str, params: dict | None = None) -> list[dict]:
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute(sql, params or {})
            return list(cur.fetchall())
    except Exception as exc:
        raise type(exc)(_scrub(str(exc))) from None
```

- [ ] **Step 4: Run the tests**

Run: `cd scripts/data-pipeline && python3 -m unittest test_dwellsy_db -v`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/dwellsy_db.py scripts/data-pipeline/test_dwellsy_db.py
git commit -m "feat: read-only Dwellsy database connection module"
```

---

### Task 2: Establish and prove the field mapping

The export's 53 columns are produced by the data team, not by a view. Three of the 24 fields the pipeline reads are NOT plain columns: `address_type` is a lookup, `amenities` is normalized across `amenity_table`/`amenity_map_table`, and `photos` was not found on any base table on 2026-09-26. This task discovers the true mapping and records it, rather than assuming one.

**Files:**
- Create: `scripts/data-pipeline/field_mapping.md`
- Create: `scripts/data-pipeline/probe_field_mapping.py`

**Interfaces:**
- Consumes: `dwellsy_db.query` from Task 1.
- Produces: `scripts/data-pipeline/field_mapping.md` — a table of `export_column -> source expression`, with a `VERIFIED` or `UNRESOLVED` marker per row. Task 3 reads this to build the query.

- [ ] **Step 1: Write the probe script**

```python
# scripts/data-pipeline/probe_field_mapping.py
"""Report where each of the 24 consumed export fields can be sourced.

Not a test — a one-shot investigation whose output is pasted into
field_mapping.md. Run it, read it, record conclusions.
"""
import dwellsy_db

CONSUMED = [
    "uru_id", "community_id", "address1_id", "address_1", "address_city",
    "address_type", "bedrooms", "rent_amount", "amenities", "photos",
    "description", "creation_time", "deactivation_time", "msa_code",
    "property_listing_status", "top_down_community_count", "company_name",
    "child_company_id", "child_company_type", "parent_company_id",
    "parent_company_name", "parent_company_type", "latitude", "longitude",
]

SQL = """
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'dwellsy_prod'
  and column_name = %(col)s
  and table_name not like 'full_export%%'
order by table_name
limit 8
"""

for col in CONSUMED:
    rows = dwellsy_db.query(SQL, {"col": col})
    where = ", ".join(f"{r['table_name']}.{r['column_name']}" for r in rows) or "NOT A COLUMN"
    print(f"{col:28s} {where}")
```

- [ ] **Step 2: Run it**

Run: `cd scripts/data-pipeline && python3 probe_field_mapping.py`
Expected: 24 lines. `address_type`, `amenities`, `photos` print `NOT A COLUMN` or point at lookup/bridge tables; the rest resolve to `property_table` or `property_listing_table`.

- [ ] **Step 3: Resolve the three hard fields**

Run each and record the answer in `field_mapping.md`:

```bash
# amenities: how does a listing reach amenity rows, and what does the export's
# delimited string correspond to?
python3 - <<'SQL'
import dwellsy_db
for q in [
  "select column_name from information_schema.columns where table_schema='dwellsy_prod' and table_name='amenity_map_table' order by ordinal_position",
  "select column_name from information_schema.columns where table_schema='dwellsy_prod' and table_name='address_type_table' order by ordinal_position",
  "select table_name from information_schema.tables where table_schema='dwellsy_prod' and (table_name ilike '%media%' or table_name ilike '%image%' or table_name ilike '%photo%')",
]:
    print(q.split("table_name=")[-1][:40]); [print("   ", r) for r in dwellsy_db.query(q)]
SQL
```

- [ ] **Step 4: Write field_mapping.md**

Record one row per consumed field:

```markdown
| export column | source expression | status |
|---|---|---|
| uru_id | `p.uru_id` | VERIFIED |
| msa_code | `p.msa_code` | VERIFIED |
| rent_amount | `pl.listing_amount` | VERIFIED |
| description | `pl.listing_long_text` | UNVERIFIED — population ratio matches (78.8% vs export 79.4%) but not proven; Task 5 reconciliation decides |
| ... | ... | ... |
```

Every one of the 24 gets a row. Any field still `UNRESOLVED` after this task blocks Task 3 and must be raised with the data team.

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/field_mapping.md scripts/data-pipeline/probe_field_mapping.py
git commit -m "docs: record the Dwellsy export field mapping, verified against live schema"
```

---

### Task 3: The market_listings reader — pass-through fields

Builds the reader for the fields that map to a plain column. Amenities/photos/address_type arrive in Task 4; operator identity in Task 6.

**Files:**
- Create: `scripts/data-pipeline/dwellsy_source.py`
- Test: `scripts/data-pipeline/test_dwellsy_source.py`

**Interfaces:**
- Consumes: `dwellsy_db.query`; `field_mapping.md` from Task 2.
- Produces: `market_listings(msa_code: str, as_of: str | None = None) -> Iterator[dict]`. Keys are export column names. Task 4 and Task 6 extend the same function.

- [ ] **Step 1: Write the failing test**

```python
# scripts/data-pipeline/test_dwellsy_source.py
import os
import unittest

import dwellsy_source

SECRET = os.path.expanduser("~/Documents/Dwellsy/secrets/db_connection.txt")
BOZEMAN = "14580"


@unittest.skipUnless(os.path.isfile(SECRET), "no Dwellsy credentials on this machine")
class MarketListings(unittest.TestCase):
    def test_yields_rows_for_a_known_market(self):
        rows = list(dwellsy_source.market_listings(BOZEMAN))
        # 21,863 measured 2026-09-26; allow growth, never collapse.
        self.assertGreater(len(rows), 20000)

    def test_rows_carry_the_passthrough_keys(self):
        row = next(iter(dwellsy_source.market_listings(BOZEMAN)))
        for key in ("uru_id", "msa_code", "rent_amount", "creation_time",
                    "deactivation_time", "property_listing_status",
                    "bedrooms", "latitude", "longitude", "address_1",
                    "address_city", "community_id", "address1_id",
                    "description", "top_down_community_count"):
            self.assertIn(key, row)

    def test_every_row_is_the_requested_market(self):
        for row in dwellsy_source.market_listings(BOZEMAN):
            self.assertEqual(row["msa_code"], BOZEMAN)

    def test_uru_coverage_is_total(self):
        rows = list(dwellsy_source.market_listings(BOZEMAN))
        missing = [r for r in rows if not r.get("uru_id")]
        self.assertEqual(missing, [], "uru_id was 100%% on 2026-09-26; a drop is a bug")

    def test_no_row_multiplication(self):
        # A join through a many-to-many bridge silently inflates counts. The
        # row count must equal the count of the base join.
        rows = list(dwellsy_source.market_listings(BOZEMAN))
        import dwellsy_db
        base = dwellsy_db.query(
            "select count(*) as n from property_listing_table pl "
            "join property_table p on p.id = pl.property_id where p.msa_code = %(m)s",
            {"m": BOZEMAN})[0]["n"]
        self.assertEqual(len(rows), base)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd scripts/data-pipeline && python3 -m unittest test_dwellsy_source -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'dwellsy_source'`

- [ ] **Step 3: Implement the reader**

```python
# scripts/data-pipeline/dwellsy_source.py
"""Read one market's listing history from the Dwellsy database.

Yields dicts keyed exactly like the CSV export's rows, so pipeline.py's row
handling is unchanged. See field_mapping.md for the column derivation and its
verification status.
"""
from typing import Iterator

import dwellsy_db

BASE_SQL = """
select
    p.uru_id::text                      as uru_id,
    p.community_id::text                as community_id,
    p.address1_id::text                 as address1_id,
    p.address_1                         as address_1,
    p.address_city                      as address_city,
    p.bedrooms                          as bedrooms,
    p.latitude                          as latitude,
    p.longitude                         as longitude,
    p.msa_code                          as msa_code,
    pl.listing_amount                   as rent_amount,
    pl.listing_long_text                as description,
    pl.creation_time                    as creation_time,
    pl.deactivation_time                as deactivation_time,
    pl.property_listing_status::text    as property_listing_status,
    ac.count_top_down                   as top_down_community_count
from property_listing_table pl
join property_table p on p.id = pl.property_id
left join address_community_table ac on ac.id = p.community_id
where p.msa_code = %(msa_code)s
"""


def market_listings(msa_code: str, as_of: str | None = None) -> Iterator[dict]:
    """One market's full listing history, newest-agnostic (the caller windows).

    `as_of` is accepted for parity with pipeline.py's --as-of but does NOT
    filter here: the pipeline computes its own T12 window from row timestamps,
    and filtering twice would silently change metric semantics.
    """
    for row in dwellsy_db.query(BASE_SQL, {"msa_code": msa_code}):
        yield _stringify(row)


def _stringify(row: dict) -> dict:
    """csv.DictReader yields strings; match that so downstream parsing is
    unchanged. None becomes '' exactly as an empty CSV cell does."""
    out = {}
    for key, value in row.items():
        out[key] = "" if value is None else str(value)
    return out
```

- [ ] **Step 4: Run the tests**

Run: `cd scripts/data-pipeline && python3 -m unittest test_dwellsy_source -v`
Expected: PASS, 5 tests. The Bozeman query takes ~1.3 s.

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/dwellsy_source.py scripts/data-pipeline/test_dwellsy_source.py
git commit -m "feat: market_listings reader for pass-through fields"
```

---

### Task 4: Amenities, photos and address_type

These three are not plain columns. `amenities` and `photos` arrive in the export as delimited strings; the pipeline splits them on `;` (see `marketing.py`, which counts `len([x for x in a.split(";") if x.strip()])`). Whatever shape the database holds, this task must produce the SAME delimited-string contract.

**Files:**
- Modify: `scripts/data-pipeline/dwellsy_source.py`
- Modify: `scripts/data-pipeline/test_dwellsy_source.py`

**Interfaces:**
- Consumes: `market_listings` from Task 3; `field_mapping.md` from Task 2.
- Produces: the same function, with `amenities`, `photos` and `address_type` keys populated.

- [ ] **Step 1: Write the failing test**

```python
    def test_amenities_and_photos_are_semicolon_delimited(self):
        # marketing.py splits these on ";" — the DB reader must match that
        # contract or every marketing score changes silently.
        rows = [r for r in dwellsy_source.market_listings(BOZEMAN)][:500]
        with_amen = [r for r in rows if r["amenities"]]
        self.assertTrue(with_amen, "no amenities found in 500 rows — mapping wrong")
        for r in with_amen[:20]:
            self.assertNotIn(",,", r["amenities"])
            parts = [x for x in r["amenities"].split(";") if x.strip()]
            self.assertTrue(parts)

    def test_address_type_uses_the_export_vocabulary(self):
        # pipeline.py lowercases address_type and compares to "house" /
        # "apartment" (see uru_addr_type). Any other vocabulary breaks the
        # 7-cell taxonomy.
        seen = {r["address_type"].strip().lower()
                for r in dwellsy_source.market_listings(BOZEMAN) if r["address_type"]}
        self.assertTrue(seen & {"house", "apartment"},
                        f"address_type vocabulary is {sorted(seen)[:8]}")
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd scripts/data-pipeline && python3 -m unittest test_dwellsy_source -v`
Expected: FAIL — `KeyError: 'amenities'`

- [ ] **Step 3: Extend the query using the mapping from Task 2**

Add to `BASE_SQL`, using the source expressions recorded in `field_mapping.md`. Aggregate amenities with `string_agg` so one row stays one row:

```sql
    ,(select string_agg(a.amenity_desc, ';' order by a.amenity_desc)
        from amenity_map_table am
        join amenity_table a on a.id = am.amenity_id
       where am.property_id = p.id)      as amenities
    ,at.address_type                     as address_type
```

with `left join address_type_table at on at.id = p.address_type_id`.

If `field_mapping.md` marked `photos` UNRESOLVED, emit `''` for it and record the consequence in the task's commit message: the marketing composite's photo sub-score will read 0 for every operator, which is a metric change and therefore BLOCKS cutover until resolved.

- [ ] **Step 4: Run the tests**

Run: `cd scripts/data-pipeline && python3 -m unittest test_dwellsy_source -v`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/dwellsy_source.py scripts/data-pipeline/test_dwellsy_source.py
git commit -m "feat: source amenities, photos and address_type from normalized tables"
```

---

### Task 5: Superset reconciliation harness

The acceptance gate for the whole migration. Proves the database read loses nothing relative to the export.

**Files:**
- Create: `scripts/data-pipeline/reconcile_source.py`
- Test: `scripts/data-pipeline/test_reconcile_source.py`

**Interfaces:**
- Consumes: `market_listings` from Tasks 3-4.
- Produces: `reconcile(msa_code, csv_path) -> dict` with keys `export_rows`, `db_rows`, `matched`, `export_only`, `db_only`, `export_only_samples`.

- [ ] **Step 1: Write the failing test**

```python
# scripts/data-pipeline/test_reconcile_source.py
import unittest

import reconcile_source


class ReconcileShape(unittest.TestCase):
    def test_key_is_uru_and_creation_time(self):
        row = {"uru_id": "9", "creation_time": "2026-01-02 03:04:05+00", "x": "y"}
        self.assertEqual(reconcile_source.row_key(row), ("9", "2026-01-02"))

    def test_missing_uru_never_collapses_into_one_key(self):
        a = reconcile_source.row_key({"uru_id": "", "creation_time": "2026-01-02"})
        b = reconcile_source.row_key({"uru_id": "", "creation_time": "2026-01-03"})
        self.assertIsNone(a)
        self.assertIsNone(b)

    def test_export_only_rows_are_a_failure(self):
        result = reconcile_source.compare(
            export_keys={("1", "2026-01-01"), ("2", "2026-01-01")},
            db_keys={("1", "2026-01-01")},
        )
        self.assertEqual(result["export_only"], 1)
        self.assertFalse(result["ok"])

    def test_db_only_rows_are_reported_not_failed(self):
        result = reconcile_source.compare(
            export_keys={("1", "2026-01-01")},
            db_keys={("1", "2026-01-01"), ("2", "2026-01-01")},
        )
        self.assertEqual(result["db_only"], 1)
        self.assertTrue(result["ok"])
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd scripts/data-pipeline && python3 -m unittest test_reconcile_source -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'reconcile_source'`

- [ ] **Step 3: Implement**

```python
# scripts/data-pipeline/reconcile_source.py
"""Superset reconciliation: the database must contain every export row.

Byte-identical output is impossible once we take the full history, so this is
the acceptance test instead. An export row with no database match is a
migration bug (broken join, wrong filter, timezone slip) and fails the build. A
database row with no export match is data we were not receiving; it is counted
and characterised, never silently absorbed.
"""
import csv
import sys

csv.field_size_limit(10 ** 9)


def row_key(row: dict):
    """(uru_id, creation date). None when uru_id is absent — unresolved rows
    must NEVER share a key, which would merge unrelated records."""
    uru = (row.get("uru_id") or "").strip()
    if not uru:
        return None
    created = (row.get("creation_time") or "").strip()[:10]
    return (uru, created)


def compare(export_keys: set, db_keys: set) -> dict:
    export_only = export_keys - db_keys
    db_only = db_keys - export_keys
    return {
        "export_rows": len(export_keys),
        "db_rows": len(db_keys),
        "matched": len(export_keys & db_keys),
        "export_only": len(export_only),
        "db_only": len(db_only),
        "export_only_samples": sorted(export_only)[:20],
        "ok": len(export_only) == 0,
    }


def reconcile(msa_code: str, csv_path: str) -> dict:
    import dwellsy_source
    with open(csv_path, newline="", encoding="utf-8", errors="replace") as fh:
        export_keys = {k for k in (row_key(r) for r in csv.DictReader(fh)
                                   if r.get("msa_code") == msa_code) if k}
    db_keys = {k for k in (row_key(r) for r in dwellsy_source.market_listings(msa_code)) if k}
    return compare(export_keys, db_keys)


if __name__ == "__main__":
    result = reconcile(sys.argv[1], sys.argv[2])
    for key in ("export_rows", "db_rows", "matched", "export_only", "db_only"):
        print(f"  {key:16s} {result[key]:,}")
    if not result["ok"]:
        print("  FAIL — export rows missing from the database:")
        for k in result["export_only_samples"]:
            print(f"     uru={k[0]} created={k[1]}")
        sys.exit(1)
    print("  OK — database is a superset of the export")
```

- [ ] **Step 4: Run the unit tests, then reconcile Bozeman**

Run: `cd scripts/data-pipeline && python3 -m unittest test_reconcile_source -v`
Expected: PASS, 4 tests

Run: `python3 reconcile_source.py 14580 "$IQ_DATA_DIR/merged_bozeman-mt_20260908.csv"`
Expected: `export_rows` ~12,900, `db_rows` ~21,800, `export_only 0`, and `OK`.

**If `export_only` is non-zero, STOP.** That is the bug class this plan exists to catch. Report the samples; do not proceed to Task 6.

**This gate is also the timezone test.** `row_key` compares `(uru_id, creation date)`. The export's timestamps are strings; `property_listing_table.creation_time` is `timestamp with time zone`. If the database session's timezone shifts a row across midnight, that row's date changes and it surfaces as `export_only` — a visible failure rather than a silent one-day drift in every T12 window. If `export_only` is small and every sample differs from its database twin by exactly one day, the cause is timezone, not a broken join: fix by pinning the session with `SET TIME ZONE 'UTC'` in `dwellsy_db.connect()` and re-running, and record which timezone the export producer used.

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/reconcile_source.py scripts/data-pipeline/test_reconcile_source.py
git commit -m "test: superset reconciliation gate for the database source"
```

---

### Task 6: Operator identity from the company hierarchy

Identity keeps the export's rule (decision 2026-09-26): child = `p.company_id`, parent = `company_table.parent_company_id`, names from `company_name_displayed`, types from `company_type_table.type`. `pipeline.effective_company_id` (parent when present, else child) is UNCHANGED. All four joins are to-one and already in the base FROM from `field_mapping.md` (`c`, `ct`, `pc`, `pct`). `organization_id` is attached as an inert extra key, never used for grouping.

**Files:**
- Modify: `scripts/data-pipeline/dwellsy_source.py`
- Modify: `scripts/data-pipeline/test_dwellsy_source.py`

**Interfaces:**
- Consumes: `market_listings` from Tasks 3-4 (base FROM already joins `c`, `ct`, `pc`, `pct`).
- Produces: the same function with `company_name`, `child_company_id`, `child_company_type`, `parent_company_id`, `parent_company_name`, `parent_company_type` populated per `field_mapping.md`, plus an extra key `organization_id` (text, '' when none).

- [ ] **Step 1: Write the failing tests**

```python
    def test_identity_keys_are_populated(self):
        rows = list(dwellsy_source.market_listings(BOZEMAN))
        with_company = [r for r in rows if r["child_company_id"]]
        # p.company_id was 100% on Bozeman 2026-09-26.
        self.assertEqual(len(with_company), len(rows))

    def test_company_fields_match_the_export(self):
        # The export's rule, reproduced: compare per child company against the
        # 2026-09-08 Bozeman export (skip if the file is absent on this machine).
        ...  # for each child_company_id in both: company_name, child_company_type,
             # parent_company_id, parent_company_name, parent_company_type equal

    def test_organization_does_not_multiply_rows(self):
        # organization_company_table is many-to-many (v1.13 EN-1963); the
        # organization must come from a pre-aggregated lookup, never a join.
        rows = list(dwellsy_source.market_listings(BOZEMAN))
        self.assertEqual(len(rows), len({r["listing_id"] for r in rows}))

    def test_organization_is_deterministic_per_company(self):
        by_company = {}
        for r in dwellsy_source.market_listings(BOZEMAN):
            by_company.setdefault(r["child_company_id"], set()).add(r["organization_id"])
        self.assertEqual({k: v for k, v in by_company.items() if len(v) > 1}, {})
```

- [ ] **Step 2: Run and watch them fail** — `cd scripts/data-pipeline && python3 -m unittest test_dwellsy_source -v`

- [ ] **Step 3: Implement** — add the six identity columns to the SELECT from the existing to-one joins, and `organization_id` via a correlated `min(oc.organization_id)::text` subquery over `dwellsy_prod.organization_company_table` (deterministic; multiplicity measured 0 of 600,292 companies on 2026-09-26). Do NOT add the bridge to the FROM list.

- [ ] **Step 4: Run the tests** — all pass.

- [ ] **Step 5: Report org multiplicity** — count Bozeman and Kansas City companies with more than one organization; record in the commit message. If any exist, list them.

- [ ] **Step 6: Commit**

```bash
git add scripts/data-pipeline/dwellsy_source.py scripts/data-pipeline/test_dwellsy_source.py
git commit -m "feat: operator identity from the company hierarchy"
```

---

### Task 7: Wire into pipeline.py behind a flag

**Files:**
- Modify: `scripts/data-pipeline/pipeline.py:87-96` (argparse), `:564` and `:591` (the two read sites)
- Test: `scripts/data-pipeline/test_pipeline_source_flag.py`

**Interfaces:**
- Consumes: `market_listings` from Tasks 3, 4, 6.
- Produces: `pipeline.py --source={csv,db}`, default `csv`.

- [ ] **Step 1: Write the failing test**

```python
# scripts/data-pipeline/test_pipeline_source_flag.py
import io
import re
import unittest


class SourceFlag(unittest.TestCase):
    def setUp(self):
        self.src = io.open("pipeline.py", encoding="utf-8").read()

    def test_flag_exists_and_defaults_to_csv(self):
        self.assertIn('"--source"', self.src)
        self.assertRegex(self.src, r'"--source".*default="csv"', )

    def test_both_read_sites_go_through_the_selector(self):
        # Two csv.DictReader call sites existed at lines 564 and 591. Neither
        # may remain unconditional, or the db path silently reads half the data.
        self.assertEqual(self.src.count("csv.DictReader(_amf)"), 0)
        self.assertEqual(self.src.count("csv.DictReader(f)"), 0)
        self.assertGreaterEqual(self.src.count("_source_rows("), 2)
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd scripts/data-pipeline && python3 -m unittest test_pipeline_source_flag -v`
Expected: FAIL — `'"--source"' not found`

- [ ] **Step 3: Add the flag and the selector**

In the argparse block near line 87:

```python
p.add_argument(
    "--source", default="csv", choices=["csv", "db"],
    help="Row source: 'csv' reads --data-dir's per-market export (default); "
         "'db' reads the Dwellsy database directly.",
)
```

Add one selector used by both read sites:

```python
def _source_rows():
    """Yield the market's rows from whichever source --source selects.

    Both call sites MUST use this. Leaving one on csv.DictReader means the
    auto-merge pre-pass and the main pass disagree about the data.
    """
    if _args.source == "db":
        import dwellsy_source
        return dwellsy_source.market_listings(MSA_CODE, DATA_AS_OF)
    def _csv_rows():
        with open(CSV_PATH, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                yield row
    return _csv_rows()
```

Replace both `with open(CSV_PATH ...) as ...: reader = csv.DictReader(...)` blocks with `for row in _source_rows():`.

- [ ] **Step 4: Run the tests, then both sources on Bozeman**

Run: `cd scripts/data-pipeline && python3 -m unittest test_pipeline_source_flag -v`
Expected: PASS, 3 tests

```bash
PYTHONHASHSEED=0 python3 pipeline.py --market bozeman-mt --source csv --out-dir /tmp/src-csv
PYTHONHASHSEED=0 python3 pipeline.py --market bozeman-mt --source db  --out-dir /tmp/src-db
python3 - <<'PY'
import json
a=json.load(open("/tmp/src-csv/Scorecard_Data_v0.6.4_bozeman.json"))
b=json.load(open("/tmp/src-db/Scorecard_Data_v0.6.4_bozeman.json"))
print("csv operators:", len(a["pms"]), " db operators:", len(b["pms"]))
PY
```

Expected: both runs complete with `Operator dignity validation failures: 0`. Operator counts DIFFER — the database carries ~69% more rows. That is the expected outcome, not a failure.

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/pipeline.py scripts/data-pipeline/test_pipeline_source_flag.py
git commit -m "feat: pipeline --source flag selecting csv or database rows"
```

---

### Task 8: Restatement report

Cutover changes every market's numbers. This produces the record of what moved.

**Files:**
- Create: `scripts/data-pipeline/restatement_report.py`

**Interfaces:**
- Consumes: two per-market JSON outputs from Task 7.
- Produces: `report(csv_json_path, db_json_path) -> str` — markdown for the cutover PR.

- [ ] **Step 1: Implement**

```python
# scripts/data-pipeline/restatement_report.py
"""Per-market before/after for the CSV -> database cutover."""
import json
import sys


def report(csv_path: str, db_path: str) -> str:
    a = json.load(open(csv_path))
    b = json.load(open(db_path))
    ap = {p["slug"]: p for p in a["pms"]}
    bp = {p["slug"]: p for p in b["pms"]}
    gained = sorted(set(bp) - set(ap))
    lost = sorted(set(ap) - set(bp))
    lines = [
        f"### {a.get('marketId', csv_path)}",
        "",
        "| | csv | db | delta |",
        "|---|---|---|---|",
        f"| operators | {len(ap)} | {len(bp)} | {len(bp)-len(ap):+d} |",
        "",
        f"- newly scored: {len(gained)}",
        f"- no longer scored: {len(lost)}",
    ]
    if lost:
        lines.append(f"- LOST (investigate — the db is a superset, so this should be empty): {lost[:10]}")
    return "\n".join(lines)


if __name__ == "__main__":
    print(report(sys.argv[1], sys.argv[2]))
```

- [ ] **Step 2: Run it on Bozeman**

Run: `python3 restatement_report.py /tmp/src-csv/Scorecard_Data_v0.6.4_bozeman.json /tmp/src-db/Scorecard_Data_v0.6.4_bozeman.json`
Expected: a markdown block. `no longer scored` should be 0 or near it; a large number means the database read is losing operators and must be investigated before cutover.

- [ ] **Step 3: Commit**

```bash
git add scripts/data-pipeline/restatement_report.py
git commit -m "feat: cutover restatement report"
```

---

## Cutover gate

Do NOT flip `--source` to `db` by default until all of these hold:

- [ ] `reconcile_source.py` reports `export_only 0` for `14580` and `28140`
- [ ] no field in `field_mapping.md` is still `UNRESOLVED`
- [ ] `photos` resolves, or the marketing photo sub-score change is accepted explicitly
- [ ] multi-organization companies are under 5%, or the resolution rule is curated
- [ ] the restatement report shows `no longer scored` at 0 for both markets
- [ ] the data team has answered why the export delivers ~60% of the rows
