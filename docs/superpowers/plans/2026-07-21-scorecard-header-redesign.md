# Scorecard Header Redesign (Option B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the scorecard header from eight hand-styled items in three unrelated roles into role-grouped zones built from one shared identity `Chip` primitive — identity line, primary Watch action, quiet utility/links row — and relocate the gold/silver star result to head the 30-second readout.

**Architecture:** Introduce one `Chip` presentational primitive; refactor `ScorecardHeader` to consume it plus a primary-variant `AddToWatchList` and compact-variant copy/PDF islands; move the star pill into `ExecReadout` (fed two new optional props wired from `ScorecardBody`). Pure presentational change — no data, view-model, seed, migration, or reseed.

**Tech Stack:** Next.js server components (inline-style + hex palette, matching the existing redesign) + a few Tailwind-class client islands + Vitest/React Testing Library (`npm run test:components`).

## Global Constraints

- **Pure presentational.** No change to the seed, Prisma, migrations, the pipeline, or `view-model.ts`. The only data movement is passing existing `HeaderView.goldCount`/`silverCount` into `ExecReadout`.
- **`ExecReadout` star props are OPTIONAL** (`goldCount?`, `silverCount?`). The PDF (`OperatorProfilePDF.tsx`) also renders `<ExecReadout>` and must stay untouched (PDF is out of scope) — optional props keep its call compiling unchanged.
- **`publicSample` behavior preserved:** on the public `/sample` page render NO Watch/Copy/PDF affordances, external links only, and NO star pill in the header. When neither actions nor links would render, skip the utility row (and its margin) entirely.
- **One identity chip style.** All identity facts use the new `Chip`. `LabelChip` (the score-VALUE status pill) is unrelated and untouched.
- **Match existing conventions:** `Chip`/`ScorecardHeader`/`ExecReadout` use inline styles + hex (like the rest of `redesign/`), NOT CSS-var tokens. Reuse existing hex: chip `#f1f4f8` bg / `#4a5568` text / `#e2e8f0` border; type dot `#155772`; relocated star pill `#fdf7e7` bg / `#ead9a8` border / `#d4a017` gold / `#9aa4b2` silver / `#7a5c12` text. Client islands stay Tailwind-class (their convention).
- **Tests:** Vitest `.test.tsx`, run via `npm run test:components`. Use `render`/`screen` + `container` queries and `.toBeTruthy()`/`.toBe()` (do not assume `jest-dom` matchers). In the header test, `vi.mock` the three client islands.
- **Git:** commit ONLY each task's own files by explicit path (never `git add -A`). Do not touch unrelated pre-existing modified/untracked files (`app/*.tsx`, `lib/api.ts`, `worker/*`, `__pycache__`, `.claude/*`).
- **Per-task verify:** `npx tsc --noEmit` clean + `npm run test:components` green.

---

### Task 1: `Chip` identity primitive

**Files:**
- Create: `src/components/scorecard/redesign/Chip.tsx`
- Test: `src/components/scorecard/redesign/Chip.test.tsx`

**Interfaces:**
- Produces: `Chip({ children, dot?: boolean, infoTitle?: string, title?: string })` — a server component. `dot` renders a leading cohort dot; `infoTitle` renders a trailing `ⓘ` whose text is exposed via `title` + `aria-label`; `title` sets a native tooltip on the whole chip.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("renders its children", () => {
    render(<Chip>SFR independent</Chip>);
    expect(screen.getByText("SFR independent")).toBeTruthy();
  });

  it("renders the cohort dot only when dot is set", () => {
    const { container, rerender } = render(<Chip>Type</Chip>);
    expect(container.querySelectorAll("span[aria-hidden]").length).toBe(0);
    rerender(<Chip dot>Type</Chip>);
    expect(container.querySelectorAll("span[aria-hidden]").length).toBe(1);
  });

  it("exposes infoTitle via an accessible label when set", () => {
    render(<Chip infoTitle="High confidence · inferred from listing structure">Third-party manager</Chip>);
    expect(screen.getByLabelText("High confidence · inferred from listing structure")).toBeTruthy();
  });

  it("renders no info affordance without infoTitle", () => {
    render(<Chip>Stockton, CA MSA</Chip>);
    expect(screen.queryByText("ⓘ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:components -- Chip`
Expected: FAIL — `Cannot find module './Chip'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// Shared identity chip for the scorecard header — one consistent style for
// every "fact about the operator" (type, management model, market + scope).
// Pure server component. Distinct from LabelChip (the score-VALUE status
// pill): this carries neutral descriptive facts, not a good/bad tone.

import type { ReactNode } from "react";

interface ChipProps {
  children: ReactNode;
  /** Leading cohort dot — used by the operator-type chip. */
  dot?: boolean;
  /** Trailing ⓘ affordance; its text is exposed via title + aria-label. */
  infoTitle?: string;
  /** Native tooltip on the whole chip. */
  title?: string;
}

export function Chip({ children, dot = false, infoTitle, title }: ChipProps) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        fontWeight: 600,
        color: "#4a5568",
        background: "#f1f4f8",
        border: "1px solid #e2e8f0",
        borderRadius: "6px",
        padding: "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          aria-hidden
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "#155772",
            flexShrink: 0,
          }}
        />
      )}
      {children}
      {infoTitle && (
        <span
          title={infoTitle}
          aria-label={infoTitle}
          style={{ color: "#8a94a6", cursor: "help", fontSize: "11px" }}
        >
          ⓘ
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:components -- Chip`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/components/scorecard/redesign/Chip.tsx src/components/scorecard/redesign/Chip.test.tsx
git commit -m "feat(scorecard): add shared identity Chip primitive"
```

---

### Task 2: `AddToWatchList` primary variant

**Files:**
- Modify: `src/components/watch-list/AddToWatchList.tsx:41-49` (props) and `:230-249` (trigger render)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AddToWatchList` gains `primary?: boolean`. When `primary` (and not `compact`), the labeled pill renders filled navy (`bg-navy text-white`) as the header's one primary action. Default (`primary` false) is unchanged; `compact` is unchanged and takes precedence.

- [ ] **Step 1: Extend the props interface**

In `src/components/watch-list/AddToWatchList.tsx`, change the interface (currently ending at `compact?: boolean;`) to add:

```tsx
interface AddToWatchListProps {
  memberKey: string;
  operatorName: string;
  /** Icon-only trigger (market/search rows). */
  compact?: boolean;
  /** Filled/accent labeled pill — the scorecard header's primary action.
   *  Ignored when `compact` is set. */
  primary?: boolean;
}
```

Update the destructure to include `primary = false`:

```tsx
export function AddToWatchList({
  memberKey,
  operatorName,
  compact = false,
  primary = false,
}: AddToWatchListProps) {
```

- [ ] **Step 2: Apply the primary style to the trigger button**

Replace the trigger `<button>`'s `className` ternary (currently `compact ? "…icon…" : "…outline pill…"`) with a three-way selection:

```tsx
        className={
          compact
            ? "inline-flex h-7 w-7 items-center justify-center rounded-full border border-grid bg-white text-muted-foreground transition-colors hover:border-navy hover:text-navy focus-visible:border-navy focus-visible:outline-none"
            : primary
            ? "inline-flex items-center gap-1.5 rounded-full bg-navy px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
            : "inline-flex items-center gap-1.5 rounded-full border border-grid bg-white px-3 py-1 text-[11.5px] font-semibold text-navy transition-colors hover:border-navy hover:bg-surface-soft focus-visible:border-navy focus-visible:bg-surface-soft focus-visible:outline-none"
        }
```

Leave the `BookmarkIcon` + `{!compact && "Watch list"}` label and the popover unchanged.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → exit 0. `npm run test:components` → still green (49/49; no test targets this island directly — its behavior is unchanged, only a style variant added; the header test in Task 4 and the preview verify exercise the primary path).

- [ ] **Step 4: Commit**

```bash
git add src/components/watch-list/AddToWatchList.tsx
git commit -m "feat(watch-list): primary (filled) variant for the scorecard header action"
```

---

### Task 3: Compact copy/PDF utility islands

**Files:**
- Modify: `src/components/scorecard/CopyLinkButton.tsx` (add `compact?: boolean` + icon-only render)
- Modify: `src/components/scorecard/PrintScorecardButton.tsx` (add `compact?: boolean` + icon-only render)

**Interfaces:**
- Produces: `CopyLinkButton({ operatorSlug, compact? })` and `PrintScorecardButton({ pmSlug, className?, compact? })`. When `compact`, each renders an icon-only control (existing icon) with an `aria-label` + `title`, sized as a 28px square to match the header's quiet utility cluster. Non-compact renders are unchanged (other call sites, if any, keep their look).

- [ ] **Step 1: `CopyLinkButton` compact variant**

Change the signature to `export function CopyLinkButton({ operatorSlug, compact = false }: { operatorSlug: string; compact?: boolean })`. Replace the trigger `<button>`'s `className` + children so that when `compact` it is icon-only:

```tsx
      <button
        type="button"
        onClick={handleCopy}
        title="Copy link"
        aria-label="Copy scorecard link to clipboard"
        className={
          compact
            ? "inline-flex h-7 w-7 items-center justify-center rounded-full border border-grid bg-white text-muted-foreground transition-colors hover:border-navy hover:text-navy focus-visible:border-navy focus-visible:outline-none"
            : "inline-flex items-center gap-1.5 rounded-full border border-grid bg-white px-3 py-1 text-[11.5px] font-semibold text-navy transition-colors hover:border-navy hover:bg-surface-soft focus-visible:border-navy focus-visible:bg-surface-soft focus-visible:outline-none"
        }
      >
        <LinkIcon />
        {!compact && "Copy link"}
      </button>
```

Leave the toast + fallback modal + `LinkIcon`/`CheckIcon` unchanged.

- [ ] **Step 2: `PrintScorecardButton` compact variant**

Change the signature to include `compact`:

```tsx
export function PrintScorecardButton({
  pmSlug,
  className,
  compact = false,
}: {
  pmSlug: string;
  className?: string;
  compact?: boolean;
}) {
```

Replace the returned `<a>` so that when `compact` it is icon-only with a download glyph:

```tsx
  return (
    <a
      href={`/api/scorecard/${pmSlug}/pdf`}
      download
      onClick={handleClick}
      title="Download PDF"
      aria-label="Download scorecard PDF"
      className={
        (compact
          ? "dq-no-print inline-flex h-7 w-7 items-center justify-center rounded-full border border-grid bg-white text-muted-foreground transition-colors hover:border-navy hover:text-navy"
          : "dq-no-print inline-flex h-9 items-center justify-center rounded-md border border-grid bg-white px-4 text-[13px] font-semibold text-navy transition-colors hover:bg-navy-soft") +
        (className ? ` ${className}` : "")
      }
    >
      {compact ? <DownloadIcon /> : "Download PDF"}
    </a>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="M7 12l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → exit 0. `npm run test:components` → green.

- [ ] **Step 4: Commit**

```bash
git add src/components/scorecard/CopyLinkButton.tsx src/components/scorecard/PrintScorecardButton.tsx
git commit -m "feat(scorecard): compact icon-only variants for copy-link + PDF buttons"
```

---

### Task 4: `ScorecardHeader` refactor

**Files:**
- Modify (full rewrite): `src/components/scorecard/redesign/ScorecardHeader.tsx`
- Test: `src/components/scorecard/redesign/ScorecardHeader.test.tsx`

**Interfaces:**
- Consumes: `Chip` (Task 1), `AddToWatchList` `primary` (Task 2), `CopyLinkButton`/`PrintScorecardButton` `compact` (Task 3). `HeaderView` (unchanged).
- Produces: the reorganized header. Props unchanged (`header`, `slug`, `publicSample?`).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HeaderView } from "@/lib/scorecard/view-model";

vi.mock("@/components/watch-list/AddToWatchList", () => ({
  AddToWatchList: (p: { primary?: boolean }) => (
    <button data-testid="watch">{p.primary ? "primary" : "default"}</button>
  ),
}));
vi.mock("@/components/scorecard/CopyLinkButton", () => ({
  CopyLinkButton: () => <button data-testid="copy">copy</button>,
}));
vi.mock("@/components/scorecard/PrintScorecardButton", () => ({
  PrintScorecardButton: () => <a data-testid="pdf">pdf</a>,
}));

import { ScorecardHeader } from "./ScorecardHeader";

const base: HeaderView = {
  name: "Reliance Real Estate",
  quadrant7Cell: "SFR Independent",
  managementModel: { model: "third_party", confidence: "high", basis: "Inferred from listing structure" },
  marketFullName: "Stockton, CA MSA",
  singleMarket: true,
  goldCount: 2,
  silverCount: 2,
  dwellsyCompanyUrl: "https://dwellsy.com/company/x",
  website: null,
  canonicalOperatorId: null,
} as unknown as HeaderView;

describe("ScorecardHeader", () => {
  it("folds scope into the market chip and shows the identity facts", () => {
    render(<ScorecardHeader header={base} slug="reliance-real-estate-stockton-ca" />);
    expect(screen.getByText("SFR Independent")).toBeTruthy();
    expect(screen.getByText("Third-party manager")).toBeTruthy();
    expect(screen.getByText("Stockton, CA MSA · single-market")).toBeTruthy();
  });

  it("does not render a standalone 'Single-market' chip", () => {
    render(<ScorecardHeader header={base} slug="x" />);
    expect(screen.queryByText("Single-market")).toBeNull();
  });

  it("keeps the management-model confidence out of the visible text (tooltip only)", () => {
    render(<ScorecardHeader header={base} slug="x" />);
    expect(screen.queryByText(/high confidence/i)).toBeNull();
  });

  it("no longer renders the star pill in the header", () => {
    render(<ScorecardHeader header={base} slug="x" />);
    expect(screen.queryByText(/gold/i)).toBeNull();
    expect(screen.queryByText(/silver/i)).toBeNull();
  });

  it("renders the primary Watch action + compact utilities when not publicSample", () => {
    render(<ScorecardHeader header={base} slug="x" />);
    expect(screen.getByTestId("watch").textContent).toBe("primary");
    expect(screen.getByTestId("copy")).toBeTruthy();
    expect(screen.getByTestId("pdf")).toBeTruthy();
  });

  it("on publicSample: no Watch/copy/PDF, external link still renders", () => {
    render(<ScorecardHeader header={base} slug="x" publicSample />);
    expect(screen.queryByTestId("watch")).toBeNull();
    expect(screen.queryByTestId("copy")).toBeNull();
    expect(screen.queryByTestId("pdf")).toBeNull();
    expect(screen.getByText("Listings on Dwellsy")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:components -- ScorecardHeader`
Expected: FAIL (assertions fail against the current header — e.g. no folded market string; star text still present).

- [ ] **Step 3: Rewrite `ScorecardHeader.tsx`**

```tsx
// Scorecard redesign — header block (Option B, grouped).
// Server component. The primary Watch action + the copy/PDF utilities are
// client islands dropped in. One identity Chip carries every fact about the
// operator; the gold/silver star RESULT now lives in the 30-second readout
// header (ExecReadout), not here.

import type { HeaderView } from "@/lib/scorecard/view-model";
import { CopyLinkButton } from "@/components/scorecard/CopyLinkButton";
import { PrintScorecardButton } from "@/components/scorecard/PrintScorecardButton";
import { AddToWatchList } from "@/components/watch-list/AddToWatchList";
import { managementModelLabel } from "@/lib/management-model/resolve";
import { Chip } from "@/components/scorecard/redesign/Chip";

interface ScorecardHeaderProps {
  header: HeaderView;
  /** Operator slug — used for the copy-link + PDF-download islands. */
  slug: string;
  /** Public /sample page: suppress Watch/Copy/PDF (all dead-end logged out);
   *  external links (public) still render. */
  publicSample?: boolean;
}

/** Top header: eyebrow, name, primary action, identity line, utility/links. */
export function ScorecardHeader({
  header,
  slug,
  publicSample = false,
}: ScorecardHeaderProps) {
  const hasDwellsyLink = header.dwellsyCompanyUrl != null;
  const hasWebsiteLink = header.website != null;
  const hasAnyLink = hasDwellsyLink || hasWebsiteLink;

  const marketLabel = header.singleMarket
    ? `${header.marketFullName} · single-market`
    : header.marketFullName;

  const mm = header.managementModel;
  const mmTooltip = mm
    ? mm.confidence
      ? `${cap(mm.confidence)} confidence · ${mm.basis}`
      : mm.basis
    : undefined;

  return (
    <div>
      {/* Top row: eyebrow + name (left) · primary action (right) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#8894ac",
              fontWeight: 600,
            }}
          >
            Property manager scorecard
          </div>
          <h1
            style={{
              fontSize: "26px",
              fontWeight: 700,
              margin: "2px 0 0",
              color: "#0f1f3f",
            }}
          >
            {header.name}
          </h1>
        </div>

        {!publicSample && (
          <div style={{ flexShrink: 0 }}>
            <AddToWatchList
              memberKey={header.canonicalOperatorId ?? slug}
              operatorName={header.name}
              primary
            />
          </div>
        )}
      </div>

      {/* Identity line — one Chip style for every fact */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: "12px",
        }}
      >
        {header.quadrant7Cell != null && <Chip dot>{header.quadrant7Cell}</Chip>}
        {mm != null && (
          <Chip title={mm.basis} infoTitle={mmTooltip}>
            {managementModelLabel(mm.model)}
          </Chip>
        )}
        <Chip>{marketLabel}</Chip>
      </div>

      {/* Utility / links row: external links (left) + quiet copy/PDF (right).
          Skip the whole row (and its margin) when nothing would render. */}
      {(!publicSample || hasAnyLink) && (
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            margin: "14px 0 20px",
            flexWrap: "wrap",
          }}
        >
          {hasDwellsyLink && (
            <a
              href={header.dwellsyCompanyUrl!}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#155772",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Listings on Dwellsy <span aria-hidden>↗</span>
            </a>
          )}
          {hasWebsiteLink && (
            <a
              href={header.website!}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#3a4a6b",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Website <span aria-hidden>↗</span>
            </a>
          )}
          {!publicSample && (
            <div
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <CopyLinkButton operatorSlug={slug} compact />
              <PrintScorecardButton pmSlug={slug} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:components -- ScorecardHeader`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/components/scorecard/redesign/ScorecardHeader.tsx src/components/scorecard/redesign/ScorecardHeader.test.tsx
git commit -m "feat(scorecard): regroup header into identity line + primary action + utility row"
```

---

### Task 5: Relocate stars to the readout + wire from `ScorecardBody`

**Files:**
- Modify: `src/components/scorecard/redesign/ExecReadout.tsx` (add optional `goldCount`/`silverCount` props + star pill in the eyebrow row)
- Modify: `src/components/scorecard/ScorecardBody.tsx:117` (pass the counts)
- Test: `src/components/scorecard/redesign/ExecReadout.test.tsx`

**Interfaces:**
- Consumes: `HeaderView.goldCount`/`silverCount` (already on `view.header` in `ScorecardBody`).
- Produces: `ExecReadout({ readout, maturityNote?, goldCount?, silverCount? })` renders the star pill in its header when both counts are provided. Optional, so the PDF's existing `<ExecReadout>` call compiles unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExecReadout } from "./ExecReadout";

describe("ExecReadout stars", () => {
  it("renders the gold/silver summary in the header when counts are provided", () => {
    render(<ExecReadout readout={[]} goldCount={2} silverCount={2} />);
    expect(screen.getByText(/2 gold/i)).toBeTruthy();
    expect(screen.getByText(/2 silver/i)).toBeTruthy();
  });

  it("renders no star summary when counts are omitted", () => {
    render(<ExecReadout readout={[]} />);
    expect(screen.queryByText(/gold/i)).toBeNull();
    expect(screen.queryByText(/silver/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:components -- ExecReadout`
Expected: FAIL — `goldCount`/`silverCount` not a prop; no star text rendered.

- [ ] **Step 3: Add the props + star pill to `ExecReadout.tsx`**

Extend the props interface (currently `{ readout, maturityNote }`):

```tsx
interface ExecReadoutProps {
  readout: ReadoutRow[];
  maturityNote?: string;
  /** Gold/silver star summary — relocated here from the header. Optional so
   *  the PDF's ExecReadout call (no stars) stays unchanged. */
  goldCount?: number;
  silverCount?: number;
}
```

Update the signature to `export function ExecReadout({ readout, maturityNote, goldCount, silverCount }: ExecReadoutProps)`. (Keep `maturityNote`'s existing type if it is more specific than `string` — match the current declaration.)

Replace the standalone eyebrow `<div>…30-second readout…</div>` with an eyebrow-plus-stars row:

```tsx
      {/* Eyebrow + relocated gold/silver star summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6px",
          gap: "12px",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#8894ac",
            fontWeight: 600,
          }}
        >
          30-second readout
        </div>
        {goldCount != null && silverCount != null && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid #ead9a8",
              background: "#fdf7e7",
              borderRadius: "20px",
              padding: "4px 11px",
              fontSize: "12px",
              color: "#7a5c12",
              fontWeight: 600,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {goldCount > 0 && (
              <span style={{ color: "#d4a017", letterSpacing: "1px" }}>
                {"★".repeat(goldCount)}
              </span>
            )}
            {goldCount} gold
            <span style={{ color: "#c9cfd8" }}>·</span>
            {silverCount > 0 && (
              <span style={{ color: "#9aa4b2", letterSpacing: "1px" }}>
                {"★".repeat(silverCount)}
              </span>
            )}
            {silverCount} silver
          </span>
        )}
      </div>
```

- [ ] **Step 4: Wire the counts from `ScorecardBody`**

In `src/components/scorecard/ScorecardBody.tsx`, change line 117 from:

```tsx
        <ExecReadout readout={view.readout} maturityNote={view.maturityNote} />
```
to:
```tsx
        <ExecReadout
          readout={view.readout}
          maturityNote={view.maturityNote}
          goldCount={view.header.goldCount}
          silverCount={view.header.silverCount}
        />
```

Leave the PDF's `<ExecReadout>` call (`OperatorProfilePDF.tsx`) UNCHANGED — it keeps its own header star rendering and passes no counts.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:components -- ExecReadout` → PASS (2/2). Then `npm run test:components` → full suite green (incl. `ScorecardBody.test.tsx`, which mocks `ExecReadout` and is unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/components/scorecard/redesign/ExecReadout.tsx src/components/scorecard/ScorecardBody.tsx src/components/scorecard/redesign/ExecReadout.test.tsx
git commit -m "feat(scorecard): relocate gold/silver stars into the 30-second readout header"
```

---

### FINAL: whole-branch review + verify + PR

- [ ] `npx tsc --noEmit` clean and `npm run test:components` green across the whole suite.
- [ ] Whole-branch code review (superpowers:requesting-code-review).
- [ ] Push branch; open PR (base `main`). Body: Option B header redesign — identity `Chip`, primary Watch action, quiet utility/links row, stars → readout; pure presentational, no reseed; PDF header intentionally out of scope.
- [ ] Verify on the Vercel preview across four operators: a third-party SFR (all chips), an owner-operator/unknown (management-chip variant), a multi-market operator (no `single-market` fold — plain market chip), and `/sample` (no Watch/copy/PDF, external link only, no header star pill, stars present in the readout). Confirm the management-model confidence shows only on hover (tooltip), and the star summary sits in the readout header.

---

## Self-Review

**Spec coverage:** Identity `Chip` primitive (T1 → spec §3.1); market+scope fold + confidence→tooltip + one chip style (T4 → §2, §5); Watch primary (T2 → §3.4); copy/PDF quiet utilities + external links as links (T3, T4 → §2, §3.2); star relocation + wiring (T5 → §3.3); publicSample preserved (T4 test → §3.2, §6); PDF untouched via optional props (T5 → §8); tests (all tasks → §7); preview verify (FINAL → §9). Covered.

**Placeholder scan:** none — every step has complete code or an exact edit.

**Type consistency:** `Chip` props (`dot`/`infoTitle`/`title`) used consistently in T1 and T4. `AddToWatchList` gains `primary` (T2), consumed in T4. `CopyLinkButton`/`PrintScorecardButton` gain `compact` (T3), consumed in T4. `ExecReadout` gains optional `goldCount`/`silverCount` (T5), passed from `ScorecardBody` (T5); PDF call left unchanged (compiles because optional). `HeaderView` fields referenced (`quadrant7Cell`, `managementModel.{model,confidence,basis}`, `marketFullName`, `singleMarket`, `goldCount`, `silverCount`, `dwellsyCompanyUrl`, `website`, `canonicalOperatorId`, `name`) all exist on the current type.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-21-scorecard-header-redesign.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
