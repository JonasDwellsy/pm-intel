// Scorecard redesign — header block.
// Mostly a server component; the copy-link + PDF-download buttons below
// are client islands (CopyLinkButton, PrintScorecardButton) dropped in.

import type { HeaderView } from "@/lib/scorecard/view-model";
import { CopyLinkButton } from "@/components/scorecard/CopyLinkButton";
import { PrintScorecardButton } from "@/components/scorecard/PrintScorecardButton";
import { AddToWatchList } from "@/components/watch-list/AddToWatchList";
import { managementModelLabel } from "@/lib/management-model/resolve";

interface ScorecardHeaderProps {
  header: HeaderView;
  /** Operator slug — used for the copy-link + PDF-download buttons. */
  slug: string;
  /** When true (the public /sample marketing page), hide the Copy-link and
   *  Download-PDF affordances. Both dead-end for a logged-out visitor — the
   *  PDF route (/api/scorecard/[slug]/pdf) is auth-gated, and Copy-link would
   *  copy the gated per-operator scorecard URL. External Dwellsy / operator
   *  website links are unaffected (they're public). Defaults to false, so the
   *  real scorecard page is unchanged. */
  publicSample?: boolean;
}

/** Top header: eyebrow, operator name, badge row, star chip, and link buttons. */
export function ScorecardHeader({
  header,
  slug,
  publicSample = false,
}: ScorecardHeaderProps) {
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

            {/* Management-model chip — neutral (hireable, not "good") */}
            {header.managementModel != null && (
              <span
                title={header.managementModel.basis}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  fontSize: "12px", fontWeight: 600, color: "#4a5568",
                  background: "#f1f4f8", border: "1px solid #e2e8f0",
                  borderRadius: "6px", padding: "3px 9px",
                }}
              >
                {managementModelLabel(header.managementModel.model)}
                {header.managementModel.confidence && (
                  <span style={{ fontSize: "10.5px", color: "#8a94a6", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    {header.managementModel.confidence} confidence
                  </span>
                )}
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

      {/* Link-button row — dwellsy/website links only render when present.
          The copy-link + PDF-download buttons render on the real scorecard
          but are suppressed on the public /sample page (publicSample), where
          both would dead-end a logged-out visitor. When neither the action
          buttons nor any external link would render, skip the row (and its
          margin) entirely. */}
      {(!publicSample || hasAnyLink) && (
      <div
        style={{
          display: "flex",
          gap: "10px",
          margin: "14px 0 20px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {!publicSample && <CopyLinkButton operatorSlug={slug} />}
        {!publicSample && <PrintScorecardButton pmSlug={slug} />}
        {!publicSample && (
          <AddToWatchList
            memberKey={header.canonicalOperatorId ?? slug}
            operatorName={header.name}
          />
        )}

        {hasAnyLink && (
          <>
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
          </>
        )}
      </div>
      )}
    </div>
  );
}
