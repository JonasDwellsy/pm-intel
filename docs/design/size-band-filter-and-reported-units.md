# Size: band-based filtering + operator-reported unit counts

**Status:** Draft for Jonas's sign-off.
**Follows:** [operator-size-presentation.md](operator-size-presentation.md) (shipped, PR #305). Answers its two open questions.

Jonas's calls:
1. Size stays a watch-list filter, but filters **by the bucket, not the precise number**.
2. Create a place in the dataset for a **self-disclosed unit count**.

These interact, so they're specced together — but they ship as two independent PRs.

---

## Part A — Filter by band

### A.1 What's there now

Four numeric fields in `src/lib/watch-list/fields.ts`, all free-text number entry:

| field | label | operators |
|---|---|---|
| `estimatedPortfolioPoint` | Estimated portfolio (median) | gte / lte / between |
| `estimatedPortfolioLow` | Portfolio estimate (low end) | gte / lte / between |
| `estimatedPortfolioHigh` | Portfolio estimate (high end) | gte / lte / between |
| `urusT12` | Unique units listed (last 12 months) | gte / lte / between |

The user types `1437` into a box.

**There is a live correctness bug.** The evaluator compares the **raw** `portfolioEstimate.point`, while every display surface now bands the **rounded** value. A watch list set to "at least 1600" today *excludes* Foundation Property Management at 1,599.4 — whose scorecard, PDF, and peer table all read "1,600+". The filter and the page disagree about the same operator.

### A.2 Design: an ordinal band field

Add one registry entry, `portfolioSizeBand`:

- **Stored value is the band's index** (0 = `<50` … 6 = `1,600+`), not its label.
- **Operators stay `gte` / `lte` / `between`** — so ordering survives. "At least 400–800" is a real thing a user wants; a label set (`in` / `notIn`) can't express it without ticking four boxes.
- **The user only ever sees labels.** The builder renders a `<select>` of the seven band names; the index is an implementation detail.
- `getValueFromPM` returns `SIZE_BANDS.indexOf(sizeBandFor(point))`. Because `sizeBandFor` rounds first, **the filter and the displayed band can no longer disagree** — the bug in A.1 is fixed by construction, not by a patch.

Why not an enum multi-select of labels: it loses ordinality, and it makes "mid-size and up" a four-click operation that silently breaks when a band is added.

### A.3 What happens to the four existing fields

| field | disposition | why |
|---|---|---|
| `estimatedPortfolioPoint` | **hidden from the builder, still evaluated** | Saved client watch lists carry arbitrary thresholds. Retiring the field would silently change what those lists return. Hiding it stops new precise-number lists without breaking existing ones. |
| `estimatedPortfolioLow` / `High` | **retired from the builder, still evaluated** | A band *is* the uncertainty statement. Offering both is offering two contradictory precision claims. |
| `urusT12` | **stays exactly as is, numeric** | This is an observed count, not an estimate. It's the one hard number we have, and precise filtering on it is legitimate. |

Hidden-but-evaluated needs one new flag on the registry entry (`hiddenFromBuilder: true`) and one filter in the field picker. Roughly 6 lines.

### A.4 Template migration

Two templates filter on the point estimate:

| template | today | proposed |
|---|---|---|
| Integrated Services Platform | `estimatedPortfolioPoint gte 300` (preferred, w 0.40) | `portfolioSizeBand gte 200–400` |
| Institutional Platform | `estimatedPortfolioPoint gte 1000` (**required**) | `portfolioSizeBand gte 800–1,600` |

**Rule: snap to the band that contains the threshold**, which loosens slightly rather than tightening. 300 sits inside 200–400, so the template now also admits 200–299. Loosening is the honest direction — the estimate is a floor, so an operator we place at 250 may well be over 300 in reality. Tightening would drop operators on the strength of a number we've just declared we don't trust.

This is a curator decision, not a mechanical one. **Flagging it for Jonas explicitly** because the Institutional Platform change is on a *required* criterion, so it changes that template's result set.

The three `urusT12` template criteria are untouched.

### A.5 Change alerts

`change-detection.ts` fires a `portfolio_band` event off `OperatorSnapshot.estimatedPortfolioBand`. That column is currently incoherent: the schema comment says it's a confidence tier (`Low`/`Medium`/`High`), `snapshot.ts` actually writes a range string (`"460–770"`), and `scripts/seed-change-scenario.ts` still seeds the retired tier vocabulary. Three vocabularies in one column.

**Repoint it to the real size band.** The alert then reads "moved from 400–800 to 800–1,600" — a statement a client can act on — instead of "460–770 → 470–780", which is noise from turnover jitter. This also collapses the `portfolio_band` and `portfolio_size` (≥20% movement) events into one meaningful signal; recommend keeping both but letting the band event be the headline.

Old rows keep their old strings. Guard the comparison so a vocabulary change can't fire a spurious wave of alerts on the first run after deploy — same pattern as the existing methodology-version guard.

### A.6 Export

The Operators sheet keeps `URUs T12` and gains **`Est. Size Band`**. The three raw portfolio columns (`Est. Portfolio`, `Low`, `High`) come out — an XLSX that a client can sort and pivot is the worst place to leave a precise number we've retired everywhere else.

---

## Part B — Operator-reported unit counts

### B.1 What this is for

We now hold three: Fischer 1,400 · Riparian 950 (four markets) · Income Property Specialists 3,000. They exist only in a chat transcript. At roughly fifteen, recalibrating the estimator becomes arithmetic instead of archaeology — but only if they were captured in a structured, dated, attributable form.

### B.2 Model

Mirrors `OperatorNameCorrection`, which is the proven pattern here (admin-curated, DB-resident, applied at read time, exported so the offline pipeline can consume it).

```prisma
model OperatorReportedSize {
  id              String   @id @default(cuid())
  targetKind      String   // "pm" | "canonical"
  targetKey       String   // PM slug, or canonicalSlug
  reportedUnits   Int
  reportedAsOf    DateTime // when the operator said it, not when we typed it
  sourceKind      String   // "ceo_call" | "operator_email" | "public_filing" | "website" | "other"
  sourceNote      String?  // "CEO, Aug 7 2026 intro call"
  decidedByUserId String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([targetKind, targetKey])
}
```

`targetKind: "canonical"` matters: Riparian's 950 is across four markets, so it attaches to the group, not to any one PM. IPS's 3,000 is company-wide.

`reportedAsOf` is separate from `createdAt` on purpose — a count from a call six months ago is weaker evidence than one from today, and the calibration needs to know which.

### B.3 Admin surface

`/admin/sizes`, mirroring `/admin/names`: operator search → current observed/estimated figures shown for context → enter reported count, as-of date, source → save. Existing entries listed with edit/remove.

Showing our own numbers next to the input is deliberate — the person entering "3,000" should see that we estimate 803, because that gap is the finding.

### B.4 The decision that matters: does it change anything?

**Recommendation: no. Capture and display, do not feed.**

The reported count does **not** override the estimate, does not move the band, does not enter cohorts, rankings, or peer selection.

Three reasons:
- It's unverified self-report. Operators have every reason to round up, and we'd be publishing their number under our brand.
- It would create a two-tier dataset: operators we've spoken to would be sized on a different basis from the other ~3,600, which quietly breaks every cohort comparison and star the product is built on.
- Its actual job is to be *ground truth to check the estimator against*. A number that has been fed into the estimator can no longer validate it.

**Where it does appear:** a calibration export (`scripts/data-pipeline/export_reported_sizes.ts`, mirroring `export_name_corrections.ts`) so the recalibration study can run offline against the pipeline data, plus an admin-only view showing observed / estimated / reported side by side with the ratio.

### B.5 Client-facing display — held for a separate decision

The strongest version of this is a scorecard line reading "Operator reports 3,000 units (Aug 2026)" beneath our observed count: it's transparent, dated, attributed, and turns a weakness into a credibility signal.

But it also publishes an unverified claim on our surface, and creates an obvious incentive for operators to supply inflated numbers once they learn the field exists. **Not building it in this pass.** Capture first; decide on display once there are enough entries to see how they behave.

---

## Sequencing

| PR | Scope | Depends on |
|---|---|---|
| 1 | Part A — band field, builder select, hidden legacy fields, template snap, export column, alert repoint | — |
| 2 | Part B — model, migration, `/admin/sizes`, calibration export | — |

Independent; either can go first.

## Open questions for Jonas

1. **Institutional Platform template** — snapping `gte 1000` down to the 800–1,600 floor admits operators we estimate at 800–999 into a *required* criterion. Accept the loosening, or snap up to 1,600+ and tighten instead?
2. **Part B display** — agree that client-facing display of reported counts is held, or do you want it in scope now?
3. **Source vocabulary** — is `ceo_call / operator_email / public_filing / website / other` the right set, or is a free-text note enough?
