import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { HomepageSectionHead } from "./SectionHead";
import { buttonVariants } from "@/components/ui/button";
import type { StarLevel } from "@/lib/types";

export type SampleCard = {
  slug: string;
  href: string;
  /** Market / location subtitle that sits under the operator name —
   *  replaces the old "RANK" header copy from PR #46. */
  marketLabel: string;
  name: string;
  badges: Array<{ kind: "green" | "orange" | "teal" | "ink"; label: string }>;
  /** Composite star drives the small icon next to the operator name. */
  compositeStar?: StarLevel;
  /** True when the canonical entity is marked as claimed in the
   *  upstream data — surfaces a small "Claimed" pill on the card. */
  claimed?: boolean;
  quote: string;
  stats: Array<{
    label: string;
    value: string;
    accent?: "green" | "orange" | null;
  }>;
};

function Pill({
  kind,
  children,
}: {
  kind: "green" | "orange" | "teal" | "ink";
  children: React.ReactNode;
}) {
  const styles: Record<typeof kind, string> = {
    green: "bg-good-soft text-good border-[#C7DABA]",
    orange: "bg-orange-soft text-orange-700 border-[#F3D7B3]",
    teal: "bg-teal-soft text-teal border-[#C2DDE6]",
    ink: "bg-navy text-white border-navy",
  };
  return (
    <span
      className={
        "inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11.5px] font-semibold tracking-[0.04em] " +
        styles[kind]
      }
    >
      {children}
    </span>
  );
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "orange" | null;
}) {
  const accentClass =
    accent === "green"
      ? "text-good"
      : accent === "orange"
        ? "text-orange"
        : "text-navy";
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={
          "text-[18px] font-semibold leading-[1.2] tracking-[-0.005em] " +
          accentClass
        }
      >
        {value}
      </p>
    </div>
  );
}

// Composite star inline next to the operator name — same color encoding as
// the IdentityHero / market-list star. No-star operators render nothing
// (the row stays clean for non-starred operators per the v1.0 dignity gate).
function CompositeStar({ level }: { level?: StarLevel }) {
  if (level !== "gold" && level !== "silver") return null;
  const fill = level === "gold" ? "#E5A800" : "#9CA3AF";
  const stroke = level === "gold" ? "#B98700" : "#6B7280";
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-label={level === "gold" ? "Gold composite star" : "Silver composite star"}
      className="shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}

// Exported so the homepage Hero can render a single sample card on
// the right side without duplicating styling. The Hero passes
// `analyticsSource="homepage_hero"` so click events bucket separately
// from the inline-section cards below.
export function ScorecardCard({
  card,
  analyticsSource = "homepage_samples",
}: {
  card: SampleCard;
  analyticsSource?: string;
}) {
  return (
    <TrackedLink
      event="pm_card_click"
      properties={{
        pmSlug: card.slug,
        source: analyticsSource,
      }}
      href={card.href}
      className="group flex min-h-[360px] flex-col rounded-md border border-grid bg-white p-7 transition-all duration-[180ms] hover:-translate-y-0.5 hover:border-navy hover:shadow-[0_8px_24px_rgb(15_31_63_/_0.06)]"
    >
      {/* PR #46 — Rank field dropped from the sample card header.
          Current methodology surfaces composite + portfolio scale as
          the primary signals, not within-cohort rank. */}
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {card.marketLabel}
      </p>
      <div className="mt-2 mb-2 flex items-center gap-2">
        <CompositeStar level={card.compositeStar} />
        <h3 className="dq-h2 text-[22px] leading-[1.2] tracking-[-0.005em]">
          {card.name}
        </h3>
        {card.claimed && (
          <span className="dq-pill dq-pill-green text-[10.5px]">Claimed</span>
        )}
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {card.badges.map((b) => (
          <Pill key={b.label} kind={b.kind}>
            {b.label}
          </Pill>
        ))}
      </div>
      <p className="flex-1 text-[15.5px] leading-[1.55] text-foreground/80">
        &ldquo;{card.quote}&rdquo;
      </p>
      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3.5 border-t border-grid-soft pt-4">
        {card.stats.map((s) => (
          <StatRow key={s.label} {...s} />
        ))}
      </div>
    </TrackedLink>
  );
}

export function SampleScorecards({ cards }: { cards: SampleCard[] }) {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="Inside a scorecard"
          title="Institutional-grade analysis on every operator."
          context="Three real operators from our coverage, spanning the operator-type taxonomy. Every figure shown is produced by the same methodology applied to every PM — no curation, no narrative. Portfolio estimates and composite stars are pulled directly from the live scorecard layer."
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <ScorecardCard key={c.slug} card={c} />
          ))}
        </div>
        {cards[0] && (
          <div className="mt-9">
            <Link
              href={cards[0].href}
              className={
                buttonVariants() +
                " h-11 bg-navy px-6 text-[14.5px] font-semibold text-white hover:bg-navy-700"
              }
            >
              View a sample scorecard →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
