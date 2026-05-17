import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { HomepageSectionHead } from "./SectionHead";
import { buttonVariants } from "@/components/ui/button";

export type SampleCard = {
  slug: string;
  href: string;
  rankLabel: string;
  rankValue: string;
  rankContext: string;
  name: string;
  badges: Array<{ kind: "green" | "orange" | "teal" | "ink"; label: string }>;
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

function ScorecardCard({ card }: { card: SampleCard }) {
  return (
    <TrackedLink
      event="pm_card_click"
      properties={{
        pmSlug: card.slug,
        source: "homepage_samples",
      }}
      href={card.href}
      className="group flex min-h-[360px] flex-col rounded-md border border-grid bg-white p-7 transition-all duration-[180ms] hover:-translate-y-0.5 hover:border-navy hover:shadow-[0_8px_24px_rgb(15_31_63_/_0.06)]"
    >
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {card.rankLabel}{" "}
        <span className="ml-1 text-[18px] font-bold normal-case tracking-normal text-navy">
          {card.rankValue}
        </span>{" "}
        <span className="text-muted-foreground">{card.rankContext}</span>
      </p>
      <h3 className="dq-h2 mt-2 mb-2 text-[22px] leading-[1.2] tracking-[-0.005em]">
        {card.name}
      </h3>
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

// One sample per market under v0.6.1 — selected to cover each major operator
// type the methodology recognizes (MF/BTR Independent, MF/BTR Institutional,
// Scattered Institutional). Numbers come straight from the seed dataset so
// the cards stay accurate as the data refreshes.
const SAMPLE_CARDS: SampleCard[] = [
  {
    slug: "brookside-properties-chattanooga-tn",
    href: "/property-managers/tennessee/chattanooga/brookside-properties-chattanooga-tn?unlocked=true",
    rankLabel: "Rank",
    rankValue: "2 / 3",
    rankContext: "in MF/BTR Independent · Chattanooga",
    name: "Brookside Properties",
    badges: [
      { kind: "orange", label: "Independent" },
      { kind: "ink", label: "MF / BTR" },
    ],
    quote:
      "Six-day median DOM, comprehensive community visibility at 2.54× the cohort norm — a structurally transparent multifamily operator.",
    stats: [
      { label: "Median DOM", value: "6.0 days", accent: "green" },
      { label: "CV ratio", value: "2.54×", accent: "green" },
      { label: "Units · MSA", value: "198" },
      { label: "Composite", value: "66.0" },
    ],
  },
  {
    slug: "udr-nashville-tn",
    href: "/property-managers/tennessee/nashville/udr-nashville-tn?unlocked=true",
    rankLabel: "Rank",
    rankValue: "33 / 98",
    rankContext: "overall · Nashville MSA",
    name: "UDR",
    badges: [
      { kind: "green", label: "Institutional" },
      { kind: "ink", label: "MF / BTR" },
    ],
    quote:
      "National Class A multifamily operator — the institutional baseline. Comprehensive community visibility against a single qualifying community.",
    stats: [
      { label: "Median DOM", value: "24.0 days" },
      { label: "Units · MSA", value: "1,069" },
      { label: "Quadrant rank", value: "4 / 5" },
      { label: "Scale", value: "National" },
    ],
  },
  {
    slug: "invitation-homes-jacksonville-fl",
    href: "/property-managers/florida/jacksonville/invitation-homes-jacksonville-fl?unlocked=true",
    rankLabel: "Rank",
    rankValue: "63 / 129",
    rankContext: "overall · Jacksonville MSA",
    name: "Invitation Homes",
    badges: [
      { kind: "green", label: "Institutional" },
      { kind: "ink", label: "Scattered SFR" },
    ],
    quote:
      "Largest scattered-site SFR operator in the U.S. — institutional under v0.6.1's cross-market rule (1,667 national units). Community visibility is suppressed by design for SFR.",
    stats: [
      { label: "Median DOM", value: "25.1 days" },
      { label: "Units · MSA", value: "1,128" },
      { label: "Quadrant rank", value: "3 / 5" },
      { label: "Visibility", value: "N/A (SFR)" },
    ],
  },
];

export function SampleScorecards() {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="Inside a scorecard"
          title="Institutional-grade analysis on every operator."
          context="One real operator from each of our three covered markets. Every figure shown is produced by the same methodology applied to every PM — no curation, no narrative."
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_CARDS.map((c) => (
            <ScorecardCard key={c.slug} card={c} />
          ))}
        </div>
        <div className="mt-9">
          <Link
            href={SAMPLE_CARDS[0].href}
            className={
              buttonVariants() +
              " h-11 bg-navy px-6 text-[14.5px] font-semibold text-white hover:bg-navy-700"
            }
          >
            View a sample scorecard →
          </Link>
        </div>
      </div>
    </section>
  );
}
