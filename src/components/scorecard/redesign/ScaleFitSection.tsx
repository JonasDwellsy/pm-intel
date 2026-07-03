// Scorecard redesign — Scale & Fit section (01).
// Server component that composes sub-primitives:
//   PortfolioRangeBar · ConcentrationBar · RentTierMarker · CoverageMapClient · peers table.

import type { ScaleFitView } from "@/lib/scorecard/view-model";
import type { SelectedPeer } from "@/lib/scorecard/peers";
import type { ScorecardData } from "@/lib/types";
import { LabelChip } from "./LabelChip";
import { PortfolioRangeBar } from "./PortfolioRangeBar";
import { ConcentrationBar } from "./ConcentrationBar";
import { RentTierMarker } from "./RentTierMarker";
import { CoverageMapClient } from "@/components/scorecard/CoverageMapClient";

interface ScaleFitSectionProps {
  scaleFit: ScaleFitView;
  peers: SelectedPeer[];
  geographicCoverage: ScorecardData["geographicCoverage"];
}

/**
 * "01 Scale & Fit" section:
 *  - Numbered header + takeaway
 *  - Full-width PortfolioRangeBar
 *  - 2-col grid: left = ConcentrationBar + RentTierMarker + at-a-glance facts;
 *                right = CoverageMapClient
 *  - Similar local players peer table
 */
export function ScaleFitSection({ scaleFit, peers, geographicCoverage }: ScaleFitSectionProps) {
  return (
    <div
      id="scale-fit"
      className="dq-section"
      style={{ borderTop: "2px solid #eef1f6", padding: "20px 0 6px" }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "6px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            color: "#aab3c6",
            fontWeight: 700,
          }}
        >
          01
        </span>
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#0f1f3f",
          }}
        >
          Scale &amp; Fit
        </span>
      </div>

      {/* Takeaway */}
      <div
        style={{
          background: "#f7f9fc",
          borderLeft: "3px solid #1b6e8c",
          padding: "9px 12px",
          borderRadius: "0 6px 6px 0",
          color: "#2a3547",
          margin: "6px 0 14px",
          fontSize: "12.5px",
        }}
      >
        {scaleFit.takeaway}
      </div>

      {/* Full-width range bar */}
      <PortfolioRangeBar
        estimate={scaleFit.estimate}
        observedUnits={scaleFit.observedUnits}
      />

      {/* 2-col grid: data left / map right */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "0.9fr 1.1fr",
          gap: "16px",
          alignItems: "stretch",
        }}
      >
        {/* LEFT COLUMN */}
        <div>
          {/* Geographic concentration */}
          <div
            style={{
              border: "1px solid #eaeef4",
              borderRadius: "8px",
              padding: "10px 12px",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#8894ac",
                fontWeight: 600,
                marginBottom: "4px",
              }}
            >
              Geographic concentration
            </div>
            <ConcentrationBar
              topCities={scaleFit.topCities}
              top3Share={scaleFit.top3Share}
              cohortTop3={scaleFit.cohortTop3}
            />
          </div>

          {/* Rent tier */}
          <div
            style={{
              border: "1px solid #eaeef4",
              borderRadius: "8px",
              padding: "10px 12px",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#8894ac",
                fontWeight: 600,
              }}
            >
              Rent tier
            </div>
            <RentTierMarker detail={scaleFit.rentTier} />
          </div>

          {/* At a glance facts */}
          <div
            style={{
              border: "1px solid #eaeef4",
              borderRadius: "8px",
              padding: "10px 12px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#8894ac",
                fontWeight: 600,
                marginBottom: "6px",
              }}
            >
              At a glance
            </div>
            <div
              style={{
                display: "flex",
                gap: "18px",
                flexWrap: "wrap",
              }}
            >
              {/* Property type */}
              {scaleFit.propertyType != null && (
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#8894ac",
                      fontWeight: 600,
                    }}
                  >
                    Type
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#0f1f3f",
                    }}
                  >
                    {scaleFit.propertyType}
                  </div>
                </div>
              )}

              {/* Cities observed */}
              {scaleFit.citiesObserved != null && (
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#8894ac",
                      fontWeight: 600,
                    }}
                  >
                    Cities
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#0f1f3f",
                    }}
                  >
                    {scaleFit.citiesObserved}
                  </div>
                </div>
              )}

              {/* Communities observed */}
              <div>
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#8894ac",
                    fontWeight: 600,
                  }}
                >
                  Communities
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#0f1f3f",
                  }}
                >
                  {scaleFit.communitiesObserved ?? "—"}
                </div>
              </div>

              {/* Footprint */}
              <div>
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#8894ac",
                    fontWeight: 600,
                  }}
                >
                  Footprint
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#0f1f3f",
                  }}
                >
                  {scaleFit.singleMarket ? "1 market" : "Multi-market"}
                </div>
              </div>

              {/* Observed active units */}
              {scaleFit.observedUnits != null && (
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#8894ac",
                      fontWeight: 600,
                    }}
                  >
                    Observed
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#0f1f3f",
                    }}
                  >
                    {scaleFit.observedUnits.toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — map */}
        <div>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#8894ac",
              fontWeight: 600,
              marginBottom: "5px",
            }}
          >
            Where they operate
          </div>
          <CoverageMapClient
            coveragePoints={geographicCoverage.coverageMapPoints}
            backdropPoints={geographicCoverage.msaBackdropPoints ?? []}
            mapBounds={geographicCoverage.mapBounds}
            accentColor="#1b6e8c"
            fallbackCity={
              geographicCoverage.topCities?.[0]?.name ??
              geographicCoverage.citiesText.split(",")[0].trim()
            }
            fallbackMsa={geographicCoverage.citiesText}
          />
        </div>
      </div>

      {/* Similar local players */}
      {peers.length > 0 && (
        <div style={{ marginTop: "18px" }}>
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#8894ac",
              fontWeight: 600,
              marginBottom: "6px",
            }}
          >
            Similar local players
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
            }}
          >
            <thead>
              <tr>
                {(["Operator", "Est. size", "Type", "Relative size", "Operating perf."] as const).map(
                  (heading) => (
                    <th
                      key={heading}
                      style={{
                        textAlign: "left",
                        fontSize: "9.5px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "#8894ac",
                        padding: "5px 8px",
                        borderBottom: "1px solid #e6eaf1",
                        fontWeight: 600,
                      }}
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {peers.map((peer) => (
                <tr key={peer.slug}>
                  {/* Operator name — plain text (no route available this phase) */}
                  <td
                    style={{
                      padding: "7px 8px",
                      borderBottom: "1px solid #f0f2f6",
                      color: peer.isFocal ? "#0f1f3f" : "#374356",
                      fontWeight: peer.isFocal ? 600 : 400,
                      background: peer.isFocal ? "#eef4f7" : "transparent",
                    }}
                  >
                    {peer.name}
                    {peer.isFocal && (
                      <span
                        style={{
                          fontSize: "10px",
                          color: "#8894ac",
                          marginLeft: "6px",
                        }}
                      >
                        (this operator)
                      </span>
                    )}
                  </td>

                  {/* Estimated size */}
                  <td
                    style={{
                      padding: "7px 8px",
                      borderBottom: "1px solid #f0f2f6",
                      color: peer.isFocal ? "#0f1f3f" : "#374356",
                      fontWeight: peer.isFocal ? 600 : 400,
                      background: peer.isFocal ? "#eef4f7" : "transparent",
                    }}
                  >
                    {peer.estimatedUnits != null
                      ? peer.estimatedUnits.toLocaleString()
                      : "—"}
                  </td>

                  {/* Property type */}
                  <td
                    style={{
                      padding: "7px 8px",
                      borderBottom: "1px solid #f0f2f6",
                      color: peer.isFocal ? "#0f1f3f" : "#374356",
                      fontWeight: peer.isFocal ? 600 : 400,
                      background: peer.isFocal ? "#eef4f7" : "transparent",
                    }}
                  >
                    {peer.quadrant7Cell ?? "—"}
                  </td>

                  {/* Relative size bar */}
                  <td
                    style={{
                      padding: "7px 8px",
                      borderBottom: "1px solid #f0f2f6",
                      background: peer.isFocal ? "#eef4f7" : "transparent",
                    }}
                  >
                    {/* .simbar */}
                    <span
                      style={{
                        display: "inline-block",
                        width: "64px",
                        height: "6px",
                        background: "#e6eef2",
                        borderRadius: "4px",
                        position: "relative",
                        verticalAlign: "middle",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${Math.round(peer.relativeSize * 100)}%`,
                          background: "#1b6e8c",
                          borderRadius: "4px",
                        }}
                      />
                    </span>
                  </td>

                  {/* Operating performance chip */}
                  <td
                    style={{
                      padding: "7px 8px",
                      borderBottom: "1px solid #f0f2f6",
                      background: peer.isFocal ? "#eef4f7" : "transparent",
                    }}
                  >
                    <LabelChip label={peer.operatingLabel} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
