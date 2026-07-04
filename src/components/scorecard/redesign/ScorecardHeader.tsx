// Scorecard redesign — header block.
// Pure server component; no client hooks.

import type { HeaderView } from "@/lib/scorecard/view-model";

interface ScorecardHeaderProps {
  header: HeaderView;
}

/** Top header: eyebrow, operator name, badge row, star chip, and link buttons. */
export function ScorecardHeader({ header }: ScorecardHeaderProps) {
  const goldStars = "★".repeat(Math.max(0, header.goldCount));
  const silverStars = "★".repeat(Math.max(0, header.silverCount));

  const hasDwellsyLink = header.dwellsyCompanyUrl != null;
  const hasWebsiteLink = header.website != null;
  const hasAnyLink = hasDwellsyLink || hasWebsiteLink;

  return (
    <div>
      {/* htop: left info block + right star chip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
        }}
      >
        {/* Left block: eyebrow, h1, badges */}
        <div>
          {/* Eyebrow */}
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

          {/* Operator name */}
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

          {/* Badge row */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              marginTop: "12px",
            }}
          >
            {/* 7-cell quadrant badge */}
            {header.quadrant7Cell != null && (
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 9px",
                  borderRadius: "20px",
                  border: "1px solid #bcdae4",
                  background: "#e1eef3",
                  color: "#155772",
                }}
              >
                ● {header.quadrant7Cell}
              </span>
            )}

            {/* Market badge */}
            <span
              style={{
                fontSize: "11px",
                padding: "2px 9px",
                borderRadius: "20px",
                border: "1px solid #d7dce5",
                color: "#3a4a6b",
              }}
            >
              {header.marketFullName}
            </span>

            {/* Single-market badge */}
            {header.singleMarket && (
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 9px",
                  borderRadius: "20px",
                  border: "1px solid #d7dce5",
                  color: "#3a4a6b",
                }}
              >
                Single-market
              </span>
            )}
          </div>
        </div>

        {/* Star chip — top right */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            border: "1px solid #ead9a8",
            background: "#fdf7e7",
            borderRadius: "20px",
            padding: "5px 12px",
            fontSize: "12px",
            color: "#7a5c12",
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {goldStars.length > 0 && (
            <span style={{ color: "#d4a017", letterSpacing: "1px" }}>
              {goldStars}
            </span>
          )}
          {header.goldCount} gold
          <span style={{ color: "#c9cfd8" }}>·</span>
          {silverStars.length > 0 && (
            <span style={{ color: "#9aa4b2", letterSpacing: "1px" }}>
              {silverStars}
            </span>
          )}
          {header.silverCount} silver
        </div>
      </div>

      {/* Link-button row — only rendered when at least one link is non-null */}
      {hasAnyLink && (
        <div
          style={{
            display: "flex",
            gap: "10px",
            margin: "14px 0 20px",
          }}
        >
          {hasDwellsyLink && (
            <a
              href={header.dwellsyCompanyUrl!}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                border: "1px solid #bcdae4",
                background: "#f2f8fb",
                color: "#155772",
                fontWeight: 600,
                fontSize: "12px",
                padding: "7px 13px",
                borderRadius: "7px",
                textDecoration: "none",
              }}
            >
              <span>🏠</span> View listings on Dwellsy <span>↗</span>
            </a>
          )}

          {hasWebsiteLink && (
            <a
              href={header.website!}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                border: "1px solid #d7dce5",
                background: "#fff",
                color: "#3a4a6b",
                fontWeight: 600,
                fontSize: "12px",
                padding: "7px 13px",
                borderRadius: "7px",
                textDecoration: "none",
              }}
            >
              <span>🌐</span> Operator website <span>↗</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
