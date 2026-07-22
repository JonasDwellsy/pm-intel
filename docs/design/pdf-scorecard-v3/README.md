# Handoff: Operator IQ Scorecard — PDF template

## Overview
A repeatable 6-page, letter-size PDF design for Dwellsy IQ **Property Manager Scorecards** (Operator IQ). Use this spec every time you generate a scorecard PDF: keep the layout, tokens, and section anatomy fixed; swap in the operator's data.

## About the design files
The files in this bundle are **design references created in HTML** — they show intended look and behavior, not production code to ship as-is. Recreate this design in your PDF-generation environment (React-PDF, Puppeteer/HTML-to-PDF, LaTeX, whatever the codebase already uses) following its established patterns. If no PDF pipeline exists yet, an HTML → headless-Chrome print pipeline matches the reference exactly.

- `Reeder Scorecard.dc.html` — the full reference implementation (one `<section class="page">` per printed page, all styles inline).
- `doc-page.js` — the paging shell used for preview/print in the reference. In your pipeline, replace with `@page { size: letter; margin: 0 }` and one fixed 8.5×11in page box per section, overflow hidden.

## Fidelity
**High-fidelity.** Colors, type sizes, spacing, and chart treatments are final. Recreate pixel-perfectly; only the data varies per operator.

## Design tokens (Dwellsy IQ)
- Font: Inter (400/500/600/700/800). Tracking −0.02em on all display/headline text.
- Colors:
  - Night (dark hero bg): `#0a1124` (base) / `#131a3e` (gradient light end)
  - Ink: `#0c1322` · Body: `#2c3344` · Muted: `#5d6678` · Faint: `#9aa1ae`
  - Border hairline: `#e5e7eb` · Band grey: `#d9dee8` · Tile grey: `#f5f6f8` · Chip grey: `#eef0f3`
  - Violet (primary data + STRONG): `#5b3cff` · Violet soft: `#ece8ff` · Row highlight: `#f4f1ff`
  - Teal (secondary data): `#2bb3c7` · Teal chip: bg `#dff3f6`, text `#0e6b79`
  - Magenta chip (GROWING/SHRINKING): bg `#fbe7f3`, text `#99206c`
  - IQ yellow (wordmark "IQ", gold medal, sparkline end-dots): `#ffc820`, ring `#d99f00`
  - Silver medal: `#cdd3dd`, ring `#9aa1ae`
- Radii: cards 12px, chips 6px, pills 999px, bars 3–7px (half of bar height).
- No shadows except marker dots: `0 1px 3px rgba(12,19,34,0.3)` under white 2.5px ring.
- Charts are flat — no gradients on data series.

### Rating chips
`padding:3px 10px; border-radius:6px; font:700 10px Inter; letter-spacing:0.06em; uppercase text`
- STRONG → violet fill `#5b3cff`, white text
- GOOD / POSITIVE / 0 TO REVIEW → `#dff3f6` / `#0e6b79`
- NEUTRAL → `#eef0f3` / `#5d6678`
- GROWING (momentum) → `#fbe7f3` / `#99206c`
- Risk/negative watch items (when present) → use magenta chip

## Page chrome (every page)
- Page box: US letter, full bleed, white; content padding `40px 56px 36px` (96dpi CSS px).
- **Running head, pages 2–6**: left `"{Operator} · {MSA}"` 10px/600 `#5d6678`; right `PROPERTY MANAGER SCORECARD` 9px/700, letter-spacing 0.12em, `#9aa1ae`; hairline below, 26–28px gap before content.
- **Footer, every page** (pinned to bottom via flex `margin-top:auto`): hairline above; left `Methodology v{X} · Design v{Y} · Data as of {date}`; right `iq.dwellsy.com · {n} of 6`; 9.5px/500 `#9aa1ae`.
- **Section headers**: violet number (`01`…`06`, 14px/800) + sentence-case h2 24px/800 tracking −0.02em + optional rating chip inline; one intro sentence 12.5px `#2c3344` below.

## Screens / pages

### Page 1 — Cover + 30-second readout
- **Dark hero band** (top ~46% of page, full bleed, padding `44px 56px 40px`), background: night base + three prismatic radial gradients — violet `rgba(91,60,255,0.55)` top-right, teal `rgba(43,179,199,0.32)` right-mid, magenta `rgba(179,38,127,0.28)` bottom-left — over `linear-gradient(160deg, #131a3e, #0a1124 55%)`.
- Hero contents, top to bottom:
  1. Wordmark row: `Dwellsy` white + `IQ` yellow, 21px/800, no space; right-aligned link `View listings on Dwellsy »` 11px/600 white@75%.
  2. Eyebrow `Property Manager Scorecard` — **title case, not uppercase**, teal `#2bb3c7`, 13px/600, 52px below wordmark.
  3. Operator name h1: 52px/800 white, tracking −0.02em.
  4. Pill chips row (gap 8px): classification (e.g. `SFR Independent`), manager type; confidence chip in yellow-tinted pill (`rgba(255,200,32,0.14)` bg, `rgba(255,200,32,0.45)` border, yellow text).
  5. Italic one-line classification rationale, 13px white@72%.
  6. Bottom row above hairline (white@12%): MSA + `· single-market` (faded); right side medal dots (12px circles, gold/silver fills per medal count) + `"{n} gold · {n} silver"` 11.5px/600.
- **30-SECOND READOUT** (white area): 10px/700 letterspaced label; 4 hairline-separated rows, grid `180px 1fr auto`: dimension name (12px/700) / one-line finding (12.5px) / rating chip. Rows: Scale & fit (no chip), Operating performance, Momentum, Watch items.
- **AT A GLANCE**: 5 equal grey tiles (`#f5f6f8`, r12, padding 14px): 9px letterspaced label + value (numbers 22px/800; text values 14px/800).

### Page 2 — 01 Scale & fit
- **Portfolio size card** (bordered, r12): three inline stats — observed (violet, 26px/800), estimate (ink), plausible range (muted) with 10.5px labels. Below: horizontal scale bar (14px tall, track `#f5f6f8`): solid violet segment `0 → observed`, violet-soft band `range-low → range-high`, near-black point dot (12px, white ring) at estimate. Axis ticks (0…round-up max) 9px. One-line legend caption 10.5px muted.
- **Two-up row**: Geographic concentration | Coverage map.
  - Concentration: stacked 12px bar — top city violet, second teal, remainder `#d9dee8`; legend rows (swatch + name + %); caption comparing top-3 share vs cohort median.
  - Coverage: real-geography SVG dot map on `#f5f6f8`, water fill `#ddeaf3`, dashed state line if relevant, violet dots `rgba(91,60,255,0.22)` fill + 1.5px violet stroke, **dot area ∝ managed homes**, label top 2–3 cities (9px/700). Caption 9.5px faint. If a produced basemap render exists, use it instead at same size.
- **Two-up row**: Rent tier | House vs apartment split.
  - Rent tier: `~${median}/mo median` 20px/800 + source line; scale bar with grey band = market P25–P75, violet marker dot = operator median; endpoint labels + `Market P25 $X — P75 $Y` centered, 9px.
  - Split: single stacked bar violet/teal; under it, left-aligned houses % (violet 20px/800) and right-aligned apartments % (teal), each with `· {n} units` sublabel.

### Page 3 — Similar local players + 02 Operating performance
- **SIMILAR LOCAL PLAYERS table**: 4 rows (peers ±1 rank around operator). Columns: Operator / Est. size (right) / Type / Operating perf. chip (right). Header row 9px/700 letterspaced faint; hairline row borders; **operator's own row highlighted `#f4f1ff`**, bold, with `(this operator)` in violet.
- **02 Operating performance** + overall chip; intro lists strongest dimensions.
- **4 metric cards** stacked (bordered, r12, padding 15px 18px):
  - Header row: metric name 13px/700 (+ small gold medal dot if gold-tier) + rating chip right.
  - One-line finding 11.5px muted (value vs cohort median; sub-splits like `Houses 13d · Apartments 14d` appended).
  - **Quartile bar**: 8px track `#f5f6f8`; grey band `#d9dee8` from 25%→75% (cohort P25–P75); 2×14px median tick `#5d6678` at 50%; operator marker = 14px dot (violet if strong, teal if good, grey if neutral) with white ring, positioned by actual percentile when known, otherwise qualitatively; bold value label (12px/800, marker color) floated above marker.
  - Tick labels `P25 / med {value} / P75` at 25/50/75%, 8.5px faint.
- Legend footnote: `Marker = this operator · grey band = cohort P25–P75 · tick = cohort median. Gold dot = top of cohort.`

### Page 4 — 03 Momentum + 04 Watch items
- **03 Momentum** + chip; intro paragraph.
- 2×2 grid of trend tiles (bordered, r12): letterspaced label (PORTFOLIO / LISTING SHARE / GEOGRAPHIC REACH / OPERATING QUALITY), sparkline SVG (260×52 viewBox, 2.5px round-capped polyline — violet for growth series, teal for quality; yellow 4px end-dot with `#d99f00` ring), one-line caption 11px muted. Plot the real monthly series when available; footnote `Trend shapes are directional summaries…` only when they aren't.
- **04 Watch items** + count chip (`0 TO REVIEW` teal when clean, magenta when risks exist); standard explainer sentence.
- Watch-item cards 2-up (bordered, r12): chip (POSITIVE/NEUTRAL/RISK) + title 13px/700 + one-line detail 11.5px muted.

### Page 5 — 05 Properties
- Intro: per-property observations vs MSA median, rollup note for scattered SFR.
- Full-width table, one row per property/rollup:
  - Columns: Submarket rollup (name 12px/700 + `SFR rollup` 9.5px faint sub) / Size / Listings / Median DOM (`{n}d` bold + `mkt {n}d` faint) / Rent + YoY (rent bold, YoY colored — positive `#0e6b79`, negative `#99206c`, `—` faint; `mkt $X · Y%` faint sub-line) / Concession (same pattern) / Quality (score 11.5px/700 + 52×5px violet progress bar, width = score%).
  - Header 9px/700 letterspaced faint, `1.5px solid #d9dee8` bottom; body rows hairline-separated, `padding: 11px 8px`. Repeat `<thead>` if the table ever spans pages.
- Footnotes: quality-score definition; `"—" = insufficient listing history for a YoY read.`

### Page 6 — 06 Methodology & limits
- Intro paragraph with version stamp and data-as-of date.
- CLASSIFICATION RATIONALE: label + short paragraph.
- Two-up label/value lists (hairline-separated rows, label muted left / bold value right): COVERAGE PARAMETERS | PORTFOLIO COMPOSITION.
- SAMPLE SIZES PER METRIC: 3-column table (Metric / N right-aligned bold / Backing muted).
- DISCLAIMER: grey `#f5f6f8` panel, r12, 11px body — standard first-party-data disclaimer text.
- SUGGESTED CITATION: bordered panel, monospace 10px (`ui-monospace, SF Mono, Menlo, Consolas`).
- `Full methodology » iq.dwellsy.com/methodology` link line (violet link).

## Interactions & behavior
Static print document — no interactions. Links (Dwellsy listing page, methodology) should be live hyperlinks in the PDF. No animations.

## Content & voice rules (Dwellsy IQ)
- Sentence case everywhere except letterspaced micro-labels (`30-SECOND READOUT`, table headers) and rating chips.
- Numbers: `K`/`M`/`+` shorthand, real `•` bullets, em-dashes for parenthetical credibility. No emoji, no exclamation points, no hedge words.
- The hero eyebrow is title case teal, never uppercase.
- Yellow appears **only** as: wordmark "IQ", gold medal dots, confidence pill tint, sparkline end-dots.

## Data slots (vary per operator)
Operator name, MSA, classification, manager type, confidence level + rationale line, medal counts, readout rows + ratings, at-a-glance stats, portfolio observed/estimate/range, city concentration shares + cohort comparison, map coordinates + unit counts, rent median + market P25/P75, house/apartment split, peer table, four metric values + cohort medians/percentiles + ratings, momentum series + captions, watch items, property rows, all methodology tables, version stamp + date.

## Assets
- Inter via Google Fonts (weights 400–800). Original brand face unknown; Inter is the approved substitute.
- No raster assets required; map and sparklines are inline SVG. Official Dwellsy IQ wordmark SVGs exist in the brand design system if vector marks are preferred over styled text.

## Files
- `Reeder Scorecard.dc.html` — complete reference (view in a browser; each `<section class="page">` = one PDF page)
- `doc-page.js` — preview/print shell used by the reference
