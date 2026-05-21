import Link from "next/link";
import { HomepageSectionHead } from "./SectionHead";

// PR #46 — pillars rewritten for the acquirer audience. Old pillars
// (Classification / Lease Velocity / Pricing Posture / Tenancy
// Position) framed the methodology in operational-analyst language.
// The acquirer reads through a different lens:
//   01 SCALE              — how big is the operator?
//   02 TYPE               — what kind of business?
//   03 OPERATING SIGNALS  — stressed or growing?
//   04 FOOTPRINT          — concentrated or spread?
// Methodology anchors point at the same /methodology sections so
// "Read methodology →" stays meaningful.

type Pillar = {
  num: string;
  eyebrow: string;
  title: string;
  description: string;
  anchor: string;
};

const PILLARS: Pillar[] = [
  {
    num: "01",
    eyebrow: "Scale",
    title: "How big is this operator really?",
    description:
      "Portfolio size estimates derived from listing volume, calibrated against verified operator data. Size-banded confidence model reduces uncertainty for the operators most relevant to acquisition diligence.",
    anchor: "/methodology/portfolio-estimator",
  },
  {
    num: "02",
    eyebrow: "Type",
    title: "What kind of business is this?",
    description:
      "Every PM mapped to one of seven cells based on observed unit composition and operating signals — not corporate self-description. SFR Independent, SFR Institutional, Hybrid, Small/Large MF/BTR Independent/Institutional.",
    anchor: "/methodology#classification",
  },
  {
    num: "03",
    eyebrow: "Operating signals",
    title: "Are they stressed or growing?",
    description:
      "Days on market, concession use, and listing trajectory — leading indicators that signal whether an operator is positioned for growth, holding steady, or under stress. All metrics cohort-relative and reproducible from the underlying Dwellsy listing record.",
    anchor: "/methodology#dom",
  },
  {
    num: "04",
    eyebrow: "Footprint",
    title: "Where do they operate, and how concentrated?",
    description:
      "Multi-market presence detection, top-city concentration, and canonical operator identity across markets. Critical for assessing geographic risk and platform fit.",
    anchor: "/methodology#footprint",
  },
];

export function MethodologyPillars() {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="What we measure"
          title="Four lenses on every operator, mapped to the acquirer's questions."
          context="Scale, type, operating signals, and footprint — applied identically across every market we cover. Each metric is observed, cohort-relative, and reproducible from the underlying Dwellsy listing record. No operator self-reporting."
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <div
              key={p.num}
              className="group flex min-h-[320px] flex-col rounded-md border border-grid bg-white p-7 transition-all duration-[180ms] hover:-translate-y-0.5 hover:border-navy hover:shadow-[0_8px_24px_rgb(15_31_63_/_0.06)]"
            >
              <p className="mb-4 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted-2">
                {p.num}
              </p>
              <p className="mb-3.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-teal">
                {p.eyebrow}
              </p>
              <h3 className="dq-h2 mb-3.5 text-[22px] leading-[1.2] tracking-[-0.005em]">
                {p.title}
              </h3>
              <p className="flex-1 text-[15.5px] leading-[1.55] text-foreground/85">
                {p.description}
              </p>
              <Link
                href={p.anchor}
                className="mt-6 inline-block text-[13.5px] font-semibold text-teal transition-colors group-hover:text-teal-700"
              >
                Read methodology →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
