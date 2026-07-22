# Scorecard Header Redesign — Design Spec

**Date:** 2026-07-21
**Status:** Approved for planning (Option B)
**Goal:** Reorganize the property-manager scorecard header so the cluster of badges/buttons under the operator name reads as one coherent, well-systematized block — each item earning its spot and grouped by role — instead of eight hand-styled items in three unrelated categories.

---

## 1. Problem & context

The scorecard header (`src/components/scorecard/redesign/ScorecardHeader.tsx`) has grown organically into **eight items in one flat space**, spanning three unrelated roles, each styled with bespoke inline CSS:

- **Identity** (who the operator is): 7-cell type (`● SFR Independent`), management model (`Third-party manager · high confidence`), market (`Stockton, CA MSA`), scope (`Single-market`).
- **Result** (how it scored): the gold/silver star pill, floating top-right, disconnected from the readout it summarizes.
- **Actions** (what you can do): Copy link, Download PDF, Watch list (internal actions) + View listings on Dwellsy, Operator website (external links) — all styled as equal peers.

Because there is **no shared chip/button primitive**, each item drifted its own treatment: three border-radii (20px pills, a 6px rounded-rect for the management-model chip, 7px buttons), ~4 color palettes, three font sizes, an inline shouty confidence sub-label, and emoji icons. That is the "different designs" symptom. The "no cohesive explanation" symptom is that the identity chips carry no framing — nothing tells a reader that these are facts *about the operator*, and low-signal chips (`Single-market`) compete for attention with high-signal ones (the management-model hire-gate chip).

## 2. Approved design (Option B — "grouped")

Reorganize into three role-grouped zones, each built from a single primitive:

```
Property manager scorecard                          [ ★ Watch list ]   ← primary action, top-right
Reliance Real Estate                                                    ← h1

[ ● SFR independent ] [ Third-party manager ⓘ ] [ Stockton, CA MSA · single-market ]   ← identity line

────────────────────────────────────────────────────────────────
  Listings on Dwellsy ↗   ·   Website ↗                    [copy] [pdf]   ← links (left) + quiet utilities (right)

30-second readout        ★★ 2 gold · 2 silver              ← stars RELOCATED to head the readout
[ ...existing 4-row readout table... ]
```

Three moves:

1. **Group by role.** Identity chips on one line; the primary action (Watch list) promoted to the top-right slot the star pill used to occupy; secondary utilities + external links on a thin divider row; the star result relocated into the readout section it explains.
2. **One primitive per role.** A single identity `Chip` component (one shape, one type scale, a small tone set) replaces the four bespoke identity spans. One button treatment for actions; external navigations render as links, not buttons.
3. **Each item earns its spot** (the audit):

| Item | Decision | Treatment |
|---|---|---|
| Type (`SFR Independent`) | Keep | Identity `Chip`, subtle cohort dot |
| Management model | Keep (highest-value — the hire gate) | Identity `Chip`; confidence → info-tooltip (`ⓘ`), not inline text |
| Market (`Stockton, CA MSA`) | Keep, fold | Identity `Chip`, merged with scope: `Stockton, CA MSA · single-market` |
| `Single-market` | Cut as standalone | Folded into the market chip (above) |
| Stars (`2 gold · 2 silver`) | Relocate | Moves into the `ExecReadout` header, beside the "30-second readout" eyebrow |
| Watch list | Promote to primary | Top-right, filled/accent pill (the primary verb on a monitoring product) |
| Copy link / Download PDF | Keep, demote | Quiet labelled icon-buttons in the utility row |
| Dwellsy / website links | Keep, restyle | Text links (with `↗`), left side of the utility row — visually distinct from actions |

**Net:** 8 look-alike items → one identity line (3 chips) + one primary action + a quiet utility/links row, with the star result moved to where it's explained.

## 3. Component architecture

### 3.1 New: `Chip` primitive
`src/components/scorecard/redesign/Chip.tsx` — pure server component, the shared identity chip.

```tsx
interface ChipProps {
  children: React.ReactNode;
  /** Optional leading Tabler-free marker: a small dot (for the cohort/type chip). */
  dot?: boolean;
  /** Optional trailing info affordance — renders an ⓘ with a native title tooltip. */
  infoTitle?: string;
  /** Native tooltip on the whole chip (e.g. management-model basis). */
  title?: string;
}
```

One fixed visual: `fontSize: 12px`, `fontWeight: 500`, `padding: 3px 10px`, `borderRadius: 6px`, `border: 0.5px solid #e2e8f0`, `background: #f1f4f8`, `color: #4a5568`, `display: inline-flex; align-items:center; gap:6px`. The cohort dot is a 6px circle in the type accent (`#155772`). The `ⓘ` is a muted glyph (`#8a94a6`) carrying `infoTitle` via `title=`. This is the ONLY identity-chip style; all four facts use it (no per-chip palettes). `LabelChip` (the score-value status pill) is unchanged and unrelated.

### 3.2 Refactor: `ScorecardHeader.tsx`
- **Top row:** eyebrow + `h1` (name) on the left; the **primary action** on the right. On the real scorecard the primary action is `AddToWatchList` styled as a filled/accent pill (reuse its existing header-pill variant; give it the primary/filled treatment). On `publicSample`, the right slot is empty (no watch on the logged-out marketing page) — the star pill no longer lives here.
- **Identity line:** `Chip` × 3 — type (`dot`), management model (`infoTitle` = confidence + basis), market+scope (folded string). Order: type → management model → market. Render each only when its data is present (management model, quadrant may be null).
- **Utility/links row** (thin divider above it): external links on the left (`Listings on Dwellsy ↗`, `Website ↗` — only when present), quiet labelled **icon-buttons** on the right for Copy link + Download PDF. Two utilities do not warrant a dropdown menu; the icon-buttons are the compact form. On `publicSample`, the copy/PDF icon-buttons are suppressed (as today) and only the external links (public) render; if neither links nor actions would render, the whole row is skipped (preserve current behavior).
- **Remove** the top-right star pill block entirely.

### 3.3 Modify: `ExecReadout.tsx`
- Accept `goldCount: number` and `silverCount: number` props.
- Render the star summary in the readout header, beside the "30-second readout" eyebrow (the result now sits with the rows it summarizes). Keep the existing gold/silver pill visual (gold `#d4a017` / silver `#9aa4b2`, `#fdf7e7` background) — this is a relocation, not a restyle.
- The scorecard page (`src/app/property-managers/[state]/[city]/[slug]/page.tsx`) already holds the `HeaderView` (which carries `goldCount`/`silverCount`); pass them into `ExecReadout` alongside `readout`. No view-model change.

### 3.4 Watch-list primary styling
`AddToWatchList` exposes a header-pill variant already. Promote it to the primary slot with a filled/accent treatment (`#155772`-family fill or the existing accent) so it reads as the one primary action. If a new variant prop is needed, add `variant="primary"`; keep the default variant unchanged for other mount points.

## 4. Data

No pipeline / seed / DB change. Everything needed is already on `HeaderView` (`quadrant7Cell`, `managementModel {model, confidence, basis}`, `marketFullName`, `singleMarket`, `goldCount`, `silverCount`, `dwellsyCompanyUrl`, `website`, `canonicalOperatorId`, `name`). The only new wiring is passing `goldCount`/`silverCount` from the page into `ExecReadout`.

## 5. Copy

- Confidence: moves off the chip face into the `ⓘ` tooltip — e.g. `High confidence · inferred from listing structure` (compose from `managementModel.confidence` + `.basis`). Sentence case.
- Market+scope fold: `${marketFullName} · single-market` when `singleMarket`, else just `${marketFullName}`.
- Links: `Listings on Dwellsy ↗`, `Website ↗` (drop the emoji; keep the external arrow).
- Icon-buttons: `aria-label="Copy link"`, `aria-label="Download PDF"`, each with a `title` tooltip.

## 6. Accessibility

- Identity chips: decorative dot is `aria-hidden`; the `ⓘ` info affordance exposes its text via `title` (and is not a focus trap — it's advisory, matching the existing management-model `title` pattern).
- Utility icon-buttons: real `<button>`/island controls with `aria-label` + visible `title`.
- External links: real `<a target="_blank" rel="noopener noreferrer">` with descriptive text (destination named), arrow decorative.
- Primary action keeps `AddToWatchList`'s existing semantics.
- Contrast: chip text `#4a5568` on `#f1f4f8` and the relocated star pill are unchanged, already-shipped values.

## 7. Testing strategy

- **`Chip` (new test):** renders children; dot present only when `dot`; `ⓘ` + `title` present only when `infoTitle`; single consistent style (snapshot or style-assert).
- **`ScorecardHeader` (new test):** identity line renders 3 chips with the folded `market · single-market` string; management-model confidence is NOT in the visible text (moved to tooltip); no star pill in the header; `publicSample=true` hides copy/PDF + watch and renders only public links (or nothing); primary Watch action present when not `publicSample`.
- **`ExecReadout` (new test):** given `goldCount`/`silverCount`, renders the star summary in its header; renders none/zero gracefully.
- **Regression:** `npm run test:components` (currently 49/49) stays green.

## 8. PDF header (out of scope, noted)

`OperatorProfilePDF.tsx` renders a parallel, non-interactive header (react-pdf) with the management-model chip + stars but none of the web action buttons. This spec does **not** change it — the "eight items / competing designs" problem is specific to the interactive web header. A light parallel pass to keep the PDF identity line consistent (same order, folded market+scope) is a reasonable **follow-up** to prevent drift, but it's not required here and is called out so it isn't forgotten.

## 9. Rollout

Pure presentational change — no data, seed, migration, or reseed. Ships on the next deploy. Verify on the Vercel preview: an operator with all facts (e.g. a Third-party SFR operator), an owner-operator/unknown operator (management chip variant), a multi-market operator (no `single-market` fold), and `/sample` (actions suppressed, links only, no star pill in header, stars in readout).

## 10. Deferred / out of scope

- PDF header parallel cleanup (§8).
- A generic dropdown/overflow-menu primitive (not needed for two utilities).
- Any change to the readout rows, metric sections, or the star *computation* — the stars only move location.
- Broader tokenization of the redesign's inline-hex styling into CSS variables (a larger refactor; this spec introduces one shared primitive, not a system-wide token migration).

## 11. Risks

- **Star relocation wiring:** `ExecReadout` gains two props; the page must pass them. Low risk, one call site — a test guards it.
- **Watch-list primary variant:** promoting `AddToWatchList` must not regress its other mount points (results table, etc.). Scope the style change to a new/opt-in variant.
- **`publicSample` paths:** three conditional branches (links-only, no actions, no star pill) must stay correct; covered by the header test.
