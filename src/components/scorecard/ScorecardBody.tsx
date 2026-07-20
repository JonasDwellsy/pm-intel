// Scorecard redesign — main body compositor (v2).
// Composes the redesigned sections in order:
//   ScorecardHeader · ExecReadout · ScaleFitSection · OperatingPerformanceSection
//   · MomentumSection · WatchItemsSection · PropertyDetailSection (section 05,
//   only when scorecard.propertyDetail has properties — see hasProperties below)
//   · MethodologyFooter (section 05 when Properties is absent, else 06)
// Right rail: ScorecardNav (client component, sticky).
//
// Takes a pre-built ScorecardView from buildScorecardView() so this component
// is purely presentational — no raw ScorecardData plumbing except what
// MethodologyFooter needs (scorecard) and geographicCoverage for the map.

import type { ScorecardData } from "@/lib/types";
import type { ScorecardView } from "@/lib/scorecard/view-model";

import { ScorecardHeader } from "@/components/scorecard/redesign/ScorecardHeader";
import { ExecReadout } from "@/components/scorecard/redesign/ExecReadout";
import { ScaleFitSection } from "@/components/scorecard/redesign/ScaleFitSection";
import { OperatingPerformanceSection } from "@/components/scorecard/redesign/OperatingPerformanceSection";
import { MomentumSection } from "@/components/scorecard/redesign/MomentumSection";
import { WatchItemsSection } from "@/components/scorecard/redesign/WatchItemsSection";
import { PropertyDetailSection } from "@/components/scorecard/redesign/PropertyDetailSection";
import { ScorecardNav } from "@/components/scorecard/redesign/ScorecardNav";
import { MethodologyFooter } from "@/components/scorecard/MethodologyFooter";

export function ScorecardBody({
  view,
  scorecard,
  isClaimed,
  geographicCoverage,
  publicSample = false,
}: {
  /** Pre-built view model from buildScorecardView(). */
  view: ScorecardView;
  /** Raw scorecard — needed by MethodologyFooter only. */
  scorecard: ScorecardData;
  isClaimed: boolean;
  /** Geographic coverage data for the map in ScaleFitSection. */
  geographicCoverage: ScorecardData["geographicCoverage"];
  /** Public marketing sample (the /sample route). When true, the header hides
   *  its Copy-link + Download-PDF buttons and the methodology footer cites the
   *  public /sample URL — both otherwise dead-end a logged-out visitor at the
   *  auth gate. Defaults to false, so the real scorecard page is unchanged. */
  publicSample?: boolean;
}) {
  void isClaimed; // reserved for future claimed-operator badge rendering

  const nonPositiveWatchCount = view.watchItems.filter(
    (w) => w.kind !== "positive"
  ).length;

  // The Properties section (and its nav entry) only exist once the pipeline
  // has populated propertyDetail for this operator — PropertyDetailSection
  // itself already returns null when absent, but the nav entry doesn't know
  // that on its own, so gate it here too (otherwise every scorecard without
  // property data shows a dangling "05 Properties" link that scrolls nowhere,
  // and Methodology's number skips from 04 to 06). Shown on /sample too, so
  // this matches MethodologyFooter's own propertyDetail-based numbering.
  const hasProperties = !!scorecard.propertyDetail?.properties?.length;

  // Build the nav sections array for the right rail.
  const navSections = [
    { id: "scale-fit", num: "01", label: "Scale & Fit" },
    {
      id: "operating-performance",
      num: "02",
      label: "Operating Performance",
      statusLabel: view.operating.sectionLabel,
    },
    {
      id: "momentum",
      num: "03",
      label: "Momentum",
      // Omit the chip for the "insufficient" direction — a bare "INSUFFICIENT"
      // chip reads as an error, not a signal.
      statusLabel:
        view.momentum.direction === "insufficient" ? undefined : view.momentum.direction,
    },
    {
      id: "watch-items",
      num: "04",
      label: "Watch Items",
      // Count of non-positive (risk/data) items; omit the chip when there are
      // none rather than rendering a bare "0".
      statusLabel:
        nonPositiveWatchCount > 0 ? String(nonPositiveWatchCount) : undefined,
    },
    ...(hasProperties ? [{ id: "properties", num: "05", label: "Properties" }] : []),
    {
      id: "methodology-footer",
      num: hasProperties ? "06" : "05",
      label: "Methodology",
    },
  ];

  return (
    <div
      style={{
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "0 24px",
        display: "flex",
        gap: "32px",
        alignItems: "flex-start",
      }}
    >
      {/* Main content column */}
      <div style={{ flex: 1, minWidth: 0, paddingTop: "28px", paddingBottom: "48px" }}>
        {/* Header */}
        <ScorecardHeader
          header={view.header}
          slug={scorecard.pm.slug}
          publicSample={publicSample}
        />

        {/* 30-second exec readout */}
        <ExecReadout readout={view.readout} maturityNote={view.maturityNote} />

        {/* 01 Scale & Fit */}
        <ScaleFitSection
          scaleFit={view.scaleFit}
          peers={view.peers}
          geographicCoverage={geographicCoverage}
          marketFullName={view.header.marketFullName}
          marketStateCode={scorecard.market.state}
          marketCity={scorecard.market.name}
        />

        {/* 02 Operating Performance */}
        <OperatingPerformanceSection operating={view.operating} />

        {/* 03 Momentum */}
        <MomentumSection momentum={view.momentum} />

        {/* 04 Watch Items */}
        <WatchItemsSection items={view.watchItems} />

        {/* 05 Properties (Phase 1 property-level detail) */}
        <PropertyDetailSection scorecard={scorecard} publicSample={publicSample} />

        {/* 06 Methodology */}
        <MethodologyFooter scorecard={scorecard} publicSample={publicSample} />
      </div>

      {/* Right-rail nav (client component). Visibility is controlled by the
          `hidden lg:block` class — hidden below lg, shown at lg+. Do NOT add an
          inline `display` here: an inline style beats the class's media query
          and would hide the rail at every width.
          Stickiness lives on THIS wrapper (the flex child), not on the nav:
          the wrapper's containing block is the tall flex row, so it has room to
          stick; the nav's own box is only as tall as itself and can't. */}
      <div
        style={{
          width: "210px",
          flexShrink: 0,
          paddingTop: "28px",
          position: "sticky",
          top: "20px",
          alignSelf: "flex-start",
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
        }}
        className="hidden lg:block"
      >
        <ScorecardNav sections={navSections} />
      </div>
    </div>
  );
}
