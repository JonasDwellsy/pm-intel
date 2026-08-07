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
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { sizeBandLabel } from "@/lib/operator-size-bands";

const MAX_MEMBER_MARKETS_SHOWN = 4;

/**
 * House / apartment stacked bar — ported from PortfolioLayer.tsx's
 * composition bar into the redesign's inline-style convention.
 * Teal = houses, orange = apartments.
 */
function UnitMixBar({ unitMix }: { unitMix: NonNullable<ScaleFitView["unitMix"]> }) {
  const { houseUrus, aptUrus } = unitMix;
  const total = houseUrus + aptUrus;
  if (total <= 0) return null;

  const housePct = Math.round((houseUrus / total) * 100);
  const aptPct = Math.round((aptUrus / total) * 100);

  return (
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
          marginBottom: "6px",
        }}
      >
        House vs apartment split
      </div>
      <div
        style={{
          display: "flex",
          height: "18px",
          width: "100%",
          overflow: "hidden",
          borderRadius: "6px",
        }}
      >
        {houseUrus > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              width: `${housePct}%`,
              minWidth: "30px",
              background: "#1b6e8c",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            {housePct}%
          </div>
        )}
        {aptUrus > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              width: `${aptPct}%`,
              minWidth: "30px",
              background: "#d97834",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            {aptPct}%
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "8px",
          fontSize: "11.5px",
          color: "#5b6577",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "2px",
              background: "#1b6e8c",
              marginRight: "6px",
              verticalAlign: "middle",
            }}
          />
          Houses ·{" "}
          <span style={{ fontWeight: 600, color: "#0f1f3f" }}>
            {houseUrus.toLocaleString()}
          </span>{" "}
          units
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "2px",
              background: "#d97834",
              marginRight: "6px",
              verticalAlign: "middle",
            }}
          />
          Apartments ·{" "}
          <span style={{ fontWeight: 600, color: "#0f1f3f" }}>
            {aptUrus.toLocaleString()}
          </span>{" "}
          units
        </span>
      </div>
    </div>
  );
}

/**
 * Member-markets chip list for cross-market operators — links to the
 * canonical cross-market operator page.
 */
function CrossMarketChips({
  crossMarket,
}: {
  crossMarket: NonNullable<ScaleFitView["crossMarket"]>;
}) {
  const { canonicalSlug, marketNames } = crossMarket;
  if (marketNames.length === 0) return null;

  const shown = marketNames.slice(0, MAX_MEMBER_MARKETS_SHOWN);
  const remaining = marketNames.length - shown.length;
  const label = shown.join(" · ") + (remaining > 0 ? ` +${remaining} more` : "");

  return (
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
          marginBottom: "6px",
        }}
      >
        Also operates in
      </div>
      <a
        href={`/operators/${canonicalSlug}`}
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#1b6e8c",
          textDecoration: "none",
        }}
      >
        {label}
      </a>
    </div>
  );
}

interface ScaleFitSectionProps {
  scaleFit: ScaleFitView;
  peers: SelectedPeer[];
  geographicCoverage: ScorecardData["geographicCoverage"];
  /** Short MSA label (e.g. "Charlotte-Gastonia-Rock Hill, NC-SC MSA") for the
   *  coverage-map fallback caption. NOT the long citiesText concentration
   *  sentence — that overflows the fallback's right-anchored label. */
  marketFullName: string;
  /** Focal operator's market state code + city — peers are same-MSA, so their
   *  scorecard URLs share these path segments. Used to link peer rows. */
  marketStateCode: string;
  marketCity: string;
}

/**
 * "01 Scale & Fit" section:
 *  - Numbered header + takeaway
 *  - Full-width PortfolioRangeBar
 *  - 2-col grid: left = ConcentrationBar + RentTierMarker + at-a-glance facts;
 *                right = CoverageMapClient
 *  - Similar local players peer table
 */
export function ScaleFitSection({ scaleFit, peers, geographicCoverage, marketFullName, marketStateCode, marketCity }: ScaleFitSectionProps) {
  // Peers are same-MSA, so each peer's scorecard lives under the focal
  // operator's state/city path segments.
  const peerHref = (slug: string) =>
    `/property-managers/${stateCodeToSlug(marketStateCode)}/${citySlug(marketCity)}/${slug}`;
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

          {/* At a glance facts */}
          <div
            style={{
              border: "1px solid #eaeef4",
              borderRadius: "8px",
              padding: "12px 14px",
              marginBottom: "14px",
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
                gap: "18px 32px",
                flexWrap: "wrap",
                justifyContent: "space-between",
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

              {/* Communities observed — MF/BTR only; meaningless for SFR */}
              {scaleFit.communitiesObserved != null && (
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
                    {scaleFit.communitiesObserved}
                  </div>
                </div>
              )}

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

              {/* Tenure — years visible + markets observed in */}
              {scaleFit.tenure != null && (
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
                    Tenure
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#0f1f3f",
                    }}
                  >
                    {`${scaleFit.tenure.yearsVisible.toFixed(1)}y visible · ${scaleFit.tenure.marketCount} market${scaleFit.tenure.marketCount === 1 ? "" : "s"}`}
                  </div>
                </div>
              )}
            </div>
          </div>

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

          {/* House / apartment split — SFR/hybrid operators only */}
          {scaleFit.unitMix != null && <UnitMixBar unitMix={scaleFit.unitMix} />}

          {/* Cross-market member markets — multi-market operators only */}
          {scaleFit.crossMarket != null && (
            <CrossMarketChips crossMarket={scaleFit.crossMarket} />
          )}
        </div>

        {/* RIGHT COLUMN — map. Flex column so the map fills the full height of
            the grid row (matched to the taller left column) instead of leaving
            empty space below a fixed-aspect box. */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
          {/* Grow to fill; minHeight keeps the map readable when the left
              column is short (few facts). */}
          <div style={{ flex: 1, minHeight: "280px" }}>
          <CoverageMapClient
            fill
            coveragePoints={geographicCoverage.coverageMapPoints}
            backdropPoints={geographicCoverage.msaBackdropPoints ?? []}
            mapBounds={geographicCoverage.mapBounds}
            accentColor="#1b6e8c"
            fallbackCity={
              geographicCoverage.topCities?.[0]?.name ??
              marketFullName.split(/[–—-]/)[0].split(",")[0].trim()
            }
            fallbackMsa={marketFullName}
          />
          </div>
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
                  {/* Operator name — links to that operator's scorecard
                      (same MSA). The focal row stays plain text. */}
                  <td
                    style={{
                      padding: "7px 8px",
                      borderBottom: "1px solid #f0f2f6",
                      color: peer.isFocal ? "#0f1f3f" : "#374356",
                      fontWeight: peer.isFocal ? 600 : 400,
                      background: peer.isFocal ? "#eef4f7" : "transparent",
                    }}
                  >
                    {peer.isFocal ? (
                      <>
                        {peer.name}
                        <span
                          style={{
                            fontSize: "10px",
                            color: "#8894ac",
                            marginLeft: "6px",
                          }}
                        >
                          (this operator)
                        </span>
                      </>
                    ) : (
                      <a
                        href={peerHref(peer.slug)}
                        style={{ color: "#155772", textDecoration: "none", fontWeight: 500 }}
                      >
                        {peer.name}
                      </a>
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
                    {/* Band, not a point. Peer sizes are the least defensible
                        numbers in this table and a column of exact figures
                        invites comparisons the estimator can't support. */}
                    {sizeBandLabel(peer.estimatedUnits) ?? "—"}
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
