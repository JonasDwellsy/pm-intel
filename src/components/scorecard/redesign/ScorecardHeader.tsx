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
