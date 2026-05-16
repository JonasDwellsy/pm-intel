import { TrackedLink } from "@/components/analytics/TrackedLink";
import { fmtDays, fmtInt } from "@/lib/format";
import { quadrantColor } from "@/lib/quadrant-colors";
import { citySlug, stateCodeToSlug, toPmListItem } from "@/lib/slugify";

type PmRow = {
  slug: string;
  name: string;
  quadrant: string;
  hybrid: boolean;
  rankOverall: number | null;
  rankQuadrant: number | null;
  claimed: boolean;
  scorecardData: string;
  market: { state: string; city: string };
};

function emailFirstWord(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

function operatorEmail(slug: string): string {
  // Stub address until the claim flow surfaces real operator contacts.
  return `${slug}@example.invalid`;
}

function MatchCard({
  row,
  index,
  leadId,
}: {
  row: PmRow;
  index: number;
  leadId: string;
}) {
  const pm = toPmListItem(row);
  const color = quadrantColor(pm.quadrant);
  const state = stateCodeToSlug(row.market.state);
  const city = citySlug(row.market.city);
  const href = `/property-managers/${state}/${city}/${pm.slug}`;
  const matchNum = String(index + 1).padStart(2, "0");
  const rankCohortLabel = pm.rankQuadrant
    ? `Rank ${pm.rankQuadrant} of ${pm.rankQuadrantTotal ?? "—"} in ${pm.quadrant}`
    : `Rank #${pm.rankOverall ?? "—"} overall`;

  return (
    <li className="relative list-none rounded-lg border border-grid bg-white p-7 sm:px-8">
      {/* Absolute-positioned overall rank · city, top-right */}
      <p className="dq-mono absolute right-7 top-6 text-[12px] text-muted-foreground sm:right-8">
        #{pm.rankOverall ?? "—"} / {row.market.city}
      </p>

      <p className="dq-mono text-[11.5px] uppercase leading-none tracking-[0.04em] text-muted-foreground">
        Match {matchNum} <span className="text-muted-2">·</span> {rankCohortLabel}
      </p>

      <h3 className="mt-3 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy sm:text-[24px]">
        {pm.name}
      </h3>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]"
          style={{ color: color.fg, backgroundColor: color.soft }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color.fg }}
          />
          {pm.quadrant}
        </span>
        {pm.hybrid && (
          <span className="inline-flex items-center rounded-full bg-navy-soft px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] text-navy">
            Hybrid
          </span>
        )}
      </div>

      <p className="mt-3.5 text-[14px] leading-[1.5] text-muted-foreground">
        <span className="dq-mono font-medium text-navy/90">
          {fmtInt(pm.totalObservedUnits)}
        </span>{" "}
        units observed
        <span className="mx-1.5 text-muted-2">·</span>
        <span className="dq-mono font-medium text-navy/90">
          {fmtDays(pm.domT12)}
        </span>{" "}
        median DOM
        <span className="mx-1.5 text-muted-2">·</span>
        {pm.primaryCity}
      </p>

      <p className="mt-3.5 inline-flex items-center gap-2 text-[12px] text-muted-foreground">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: pm.claimed ? "#2c9d6e" : "#8C93A1" }}
          aria-hidden
        />
        {pm.claimed ? (
          <>Verified profile</>
        ) : (
          <>Unclaimed profile · public contact details provided</>
        )}
      </p>

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <TrackedLink
          event="match_card_click"
          properties={{
            pmSlug: pm.slug,
            rank: index + 1,
            leadId,
            cta: "view_scorecard",
          }}
          href={href}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 text-[14px] font-semibold text-white transition-colors hover:bg-navy-700"
        >
          View full scorecard →
        </TrackedLink>
        <TrackedLink
          event="match_card_click"
          properties={{
            pmSlug: pm.slug,
            rank: index + 1,
            leadId,
            cta: "email_operator",
          }}
          href={`mailto:${operatorEmail(pm.slug)}?subject=${encodeURIComponent(
            "Property manager inquiry via Dwellsy IQ"
          )}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-teal bg-white px-5 text-[14px] font-semibold text-teal transition-colors hover:bg-teal/5"
        >
          <svg
            aria-hidden
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 6-10 7L2 6" />
          </svg>
          Email {emailFirstWord(pm.name)} →
        </TrackedLink>
      </div>
    </li>
  );
}

export function MatchResults({
  matches,
  leadId,
}: {
  matches: PmRow[];
  leadId: string;
}) {
  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-grid bg-[#FBFAF6] p-10 text-center">
        <p className="text-[14px] font-medium text-navy">
          No matches in our current dataset.
        </p>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          We&apos;ll email you when we expand coverage in your market.
        </p>
      </div>
    );
  }
  return (
    <ol className="flex list-none flex-col gap-4 p-0">
      {matches.map((m, i) => (
        <MatchCard key={m.slug} row={m} index={i} leadId={leadId} />
      ))}
    </ol>
  );
}
