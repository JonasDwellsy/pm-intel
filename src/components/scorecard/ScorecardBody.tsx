// Scorecard redesign — main body compositor (v2).
// Composes the redesigned sections in order:
//   ScorecardHeader · ExecReadout · ScaleFitSection · OperatingPerformanceSection
//   · MomentumSection · WatchItemsSection · MethodologyFooter (section 05)
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
import { ScorecardNav } from "@/components/scorecard/redesign/ScorecardNav";
import { MethodologyFooter } from "@/components/scorecard/MethodologyFooter";

export function ScorecardBody({
  view,
  scorecard,
  isClaimed,
  geographicCoverage,
}: {
  /** Pre-built view model from buildScorecardView(). */
  view: ScorecardView;
  /** Raw scorecard — needed by MethodologyFooter only. */
  scorecard: ScorecardData;
  isClaimed: boolean;
  /** Geographic coverage data for the map in ScaleFitSection. */
  geographicCoverage: ScorecardData["geographicCoverage"];
}) {
  void isClaimed; // reserved for future claimed-operator badge rendering

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
      statusLabel: view.momentum.direction,
    },
    {
      id: "watch-items",
      num: "04",
      label: "Watch Items",
      statusLabel: String(view.watchItems.filter((w) => w.kind !== "positive").length),
    },
    { id: "methodology-footer", num: "05", label: "Methodology" },
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
        <ScorecardHeader header={view.header} />

        {/* 30-second exec readout */}
        <ExecReadout readout={view.readout} />

        {/* 01 Scale & Fit */}
        <ScaleFitSection
          scaleFit={view.scaleFit}
          peers={view.peers}
          geographicCoverage={geographicCoverage}
        />

        {/* 02 Operating Performance */}
        <OperatingPerformanceSection operating={view.operating} />

        {/* 03 Momentum */}
        <MomentumSection momentum={view.momentum} />

        {/* 04 Watch Items */}
        <WatchItemsSection items={view.watchItems} />

        {/* 05 Methodology */}
        <MethodologyFooter scorecard={scorecard} />
      </div>

      {/* Right-rail nav (client component, sticky) */}
      <div
        style={{
          width: "210px",
          flexShrink: 0,
          paddingTop: "28px",
          display: "none",
          // shown on md+ via a wrapper — works with inline style only on server;
          // ScorecardNav's own sticky positioning handles the rest
        }}
        className="hidden lg:block"
      >
        <ScorecardNav sections={navSections} />
      </div>
    </div>
  );
}
