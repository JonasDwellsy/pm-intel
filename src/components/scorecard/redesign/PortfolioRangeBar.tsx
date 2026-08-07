// Scorecard redesign — Portfolio size range bar.
// Pure server component; no client hooks.
// Matches the mockup .rangewrap/.track/.band layout.

import { sizeBandLabel, SIZE_COVERAGE_CAVEAT } from "@/lib/operator-size-bands";
import type { ScaleFitView } from "@/lib/scorecard/view-model";

interface PortfolioRangeBarProps {
  estimate: ScaleFitView["estimate"];
  observedUnits: ScaleFitView["observedUnits"];
}

/**
 * Full-width range bar showing observed units tick, estimate band (P25–P75),
 * and best-estimate point. Degrades gracefully:
 *  - No band when low/high are null.
 *  - Shows estimate.status message when point is null.
 */
export function PortfolioRangeBar({ estimate, observedUnits }: PortfolioRangeBarProps) {
  const { point, low, high, status, message } = estimate;
  const hasBand = low != null && high != null;

  // We need a reference scale to convert unit counts to track positions.
  // The track spans from 0 to max where max is 125% of the largest value
  // in view so markers never sit at the edge.
  const upperBound = Math.max(
    point ?? 0,
    high ?? 0,
    observedUnits ?? 0,
    1,
  ) * 1.25;

  const toPct = (val: number) => Math.min(100, Math.max(0, (val / upperBound) * 100));

  if (point == null && !hasBand) {
    // Cannot render — show status message only.
    const friendly =
      message ??
      (status === "insufficient_data"
        ? "Not enough observed data to estimate portfolio size yet."
        : status);
    return (
      <div
        style={{
          border: "1px solid #eaeef4",
          borderRadius: "8px",
          padding: "12px 16px",
          marginBottom: "14px",
          fontSize: "12px",
          color: "#8894ac",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "#8894ac",
            fontWeight: 600,
          }}
        >
          Portfolio size
        </span>
        <p style={{ margin: "6px 0 0" }}>{friendly}</p>
      </div>
    );
  }

  const bandLeft = hasBand ? toPct(low!) : null;
  const bandRight = hasBand ? 100 - toPct(high!) : null;
  const pointLeft = point != null ? toPct(point) : null;
  const obsLeft = observedUnits != null ? toPct(observedUnits) : null;

  // Stagger the observed label down when it overlaps the est point label.
  const near = obsLeft != null && pointLeft != null && Math.abs(obsLeft - pointLeft) < 8;

  return (
    <div
      style={{
        border: "1px solid #eaeef4",
        borderRadius: "8px",
        padding: "12px 16px 6px",
        marginBottom: "14px",
      }}
    >
      {/* Header row: label */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "#8894ac",
            fontWeight: 600,
          }}
        >
          Portfolio size
        </span>
        {/* v0.8 — band label alongside the range bar. The bar still shows the
            point and its turnover band, but the band label is what we lead with
            in copy and comparison tables: calibration against operator-reported
            counts showed the point running 2-4x low for apartment-heavy
            operators, so a banded claim is the one we can actually defend. */}
        {sizeBandLabel(point) != null && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#155772",
              background: "#eef5f8",
              border: "1px solid #d6e5ec",
              borderRadius: "999px",
              padding: "1px 8px",
            }}
          >
            {sizeBandLabel(point)} units
          </span>
        )}
      </div>

      {/* The track */}
      <div
        style={{
          position: "relative",
          height: "12px",
          background: "#eef1f6",
          borderRadius: "7px",
          margin: "26px 0 10px",
        }}
      >
        {/* Band (P25–P75 estimate range) */}
        {hasBand && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${bandLeft}%`,
              right: `${bandRight}%`,
              background: "#cfe3ec",
              borderRadius: "7px",
            }}
          />
        )}

        {/* Band edge labels */}
        {hasBand && (
          <>
            <span
              style={{
                position: "absolute",
                top: "-22px",
                left: `${bandLeft}%`,
                fontSize: "10px",
                color: "#5b6577",
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
              }}
            >
              {low!.toLocaleString()}
            </span>
            <div
              style={{
                position: "absolute",
                top: "-3px",
                left: `${bandLeft}%`,
                width: "2px",
                height: "18px",
                background: "#8894ac",
              }}
            />
            <span
              style={{
                position: "absolute",
                top: "-22px",
                left: `${100 - (bandRight ?? 0)}%`,
                fontSize: "10px",
                color: "#5b6577",
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
              }}
            >
              {high!.toLocaleString()}
            </span>
            <div
              style={{
                position: "absolute",
                top: "-3px",
                left: `${100 - (bandRight ?? 0)}%`,
                width: "2px",
                height: "18px",
                background: "#8894ac",
              }}
            />
          </>
        )}

        {/* Observed units tick (green) */}
        {obsLeft != null && (
          <>
            <div
              style={{
                position: "absolute",
                top: "-3px",
                left: `${obsLeft}%`,
                width: "2px",
                height: "18px",
                background: "#1a7f5a",
              }}
            />
            <span
              style={{
                position: "absolute",
                top: near ? "-36px" : "-22px",
                left: `${obsLeft}%`,
                fontSize: "10px",
                color: "#1a7f5a",
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
              }}
            >
              {observedUnits!.toLocaleString()} observed
            </span>
          </>
        )}

        {/* Best-estimate point marker */}
        {pointLeft != null && (
          <>
            <div
              style={{
                position: "absolute",
                top: "-4px",
                left: `${pointLeft}%`,
                width: "3px",
                height: "20px",
                background: "#0f1f3f",
                borderRadius: "2px",
                transform: "translateX(-50%)",
              }}
            />
            <span
              style={{
                position: "absolute",
                top: "-22px",
                left: `${pointLeft}%`,
                fontSize: "10px",
                color: "#0f1f3f",
                fontWeight: 700,
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
              }}
            >
              {point!.toLocaleString()} est
            </span>
          </>
        )}
      </div>

      {/* Caption */}
      <p
        style={{
          fontSize: "10.5px",
          color: "#8894ac",
          margin: "0 0 6px",
        }}
      >
        {hasBand
          ? "Green = directly observed units (T12). Shaded band = plausible range from unit-turnover uncertainty. Point = best estimate (turnover-adjusted)."
          : "Green = directly observed units (T12). Point = estimated managed units (turnover-adjusted for SFR; declared units for multifamily)."}
      </p>
      {/* The coverage limit, stated rather than implied. We only see what an
          operator lists with Dwellsy, and calibration against operator-reported
          counts shows that gap is the dominant source of error — larger than
          anything the multipliers control. Saying so is what keeps the number
          credible when an operator knows their own count. */}
      <p
        style={{
          fontSize: "10.5px",
          color: "#8894ac",
          margin: "0",
          fontStyle: "italic",
        }}
      >
        {SIZE_COVERAGE_CAVEAT}
      </p>
    </div>
  );
}
