# PDF scorecard v3 — build notes

Rebuild of `src/components/scorecard/OperatorProfilePDF.tsx` to the Claude-Design
handoff in this folder (`README.md` = authoritative spec). PDF-only; the web
scorecard keeps the navy/teal system (web + PDF intentionally diverge).

## Locked decisions (from Jonas)
- **PDF-only** — do not touch the web scorecard components.
- **Bundle Inter** — `public/fonts/inter-{400,500,600,700,800}.woff` (from
  `@fontsource/inter`), registered via `join(process.cwd(),"public","fonts",…)`,
  the same proven path the wordmark PNG loads by (no `outputFileTracingIncludes`
  needed — `public/` is bundled reliably; confirmed the wordmark already loads
  this way in prod). Smoke-tested locally: all five weights render.
- **Keep the Mapbox basemap** — reuse `fetchCoverageMapImage`; only recolor the
  overlaid coverage dots teal → violet (applies to both basemap + SVG fallback).

## Architecture (unchanged — this is what gives "components stretch" flexibility)
Single `<Page wrap>` that auto-paginates. `wrap={false}` atomic cards + section
`<View break>` (NO top margin — a top margin on a break spawns a blank page) target
the intended page starts, but content flows if a section runs long. NOT a rigid
6-fixed-page layout. All data comes from the pre-built `ScorecardView` + raw
`ScorecardData` — no new data, no pipeline change, web+PDF single-source intact.

## Page map (target starts; may flow)
1. Cover: dark prismatic hero + 30-second readout + at-a-glance tiles
2. `01` Scale & fit
3. Similar local players + `02` Operating performance
4. `03` Momentum + `04` Watch items
5. `05` Properties
6. `06` Methodology & limits

## Phases (verify each via `scripts/tmp-render-pdf.tsx` on Reeder/Lindcrest/CA-SFR)
1. Foundation — theme tokens (Inter + violet palette), font registration, page
   chrome (running head + footer), `SectionHeader`, `RatingChip`.
2. Page 1 cover — hero (wordmark, teal title-case eyebrow, 52px name, pill chips,
   rationale, MSA + medal dots), readout rows, at-a-glance 5 tiles.
3. `01` Scale & fit — portfolio scale bar, concentration + coverage two-up, rent
   tier + house/apt split two-up.
4. Peers table + `02` Operating — 4 quartile metric cards.
5. `03` Momentum 2×2 sparkline tiles + `04` Watch items 2-up cards.
6. `05` Properties table (quality = score + violet progress bar).
7. `06` Methodology (two-up lists, sample-size 3-col, grey disclaimer, mono citation).
8. Whole-doc pagination pass on all three operators; tune breaks.

## Test operators
- Reeder — `reeder-companies-chicago-joliet-naperville-il-in-wi` (SFR, 9 properties, Chicago)
- Lindcrest — `lindcrest-property-management-st-louis-mo-il` (Small MF/BTR)
- Tahoe PM — `tahoe-property-management-sacramento-arden-arcade-roseville-ca` (CA SFR)

## Notes
- Local render shows the SVG-fallback map (local `.env` has only the URL-restricted
  public Mapbox token → 403 server-side). Basemap path is unchanged; verify basemap
  visually only via a prod/preview deploy.
- Design version stamp: bump `scorecard.designVersion` copy when shipping (footer +
  citation already read it).
