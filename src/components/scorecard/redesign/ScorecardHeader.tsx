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
/** "2026-05-27" -> "27 May 2026". Parsed as UTC so the rendered date can't
 *  slip a day for viewers behind UTC. */
function formatLastListing(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

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
  const isDormant = header.operatorStatus === "dormant";
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
        {isDormant && <Chip>No recent listings</Chip>}
      </div>

      {/* v0.8 dormant-operator tier. A dormant operator keeps a real scorecard —
          the T12 record behind it happened — but the reader has to know the
          window ended and that this operator isn't being ranked against active
          peers. Amber, never red: going quiet on one listing source is not a
          performance failure, and it is frequently a syndication change rather
          than anything about the operator's business. The copy therefore states
          only what we observe (listings on Dwellsy) and dates it explicitly. */}
      {isDormant && (
        <div
          role="note"
          style={{
            marginTop: "14px",
            padding: "10px 14px",
            border: "1px solid #E4D3AE",
            borderLeft: "3px solid #B26B00",
            borderRadius: "6px",
            background: "#FBF4E6",
            fontSize: "13px",
            lineHeight: 1.5,
            color: "#4A3A1C",
          }}
        >
          <strong style={{ fontWeight: 650 }}>
            No listings observed on Dwellsy
            {header.lastListingDate ? ` since ${formatLastListing(header.lastListingDate)}` : ""}.
          </strong>{" "}
          The figures below reflect this operator&apos;s last 12 months of
          observed activity. They are shown for reference and are not ranked
          against operators currently listing in this market.
        </div>
      )}

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
