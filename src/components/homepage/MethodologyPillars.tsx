import Link from "next/link";
import { HomepageSectionHead } from "./SectionHead";

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
    eyebrow: "Classification",
    title: "Operator-type quadrant",
    description:
      "Every PM mapped to one of four quadrants: MF / BTR × Institutional / Independent. Built from observed unit composition and operating signals, not corporate self-description.",
    anchor: "/methodology#classification",
  },
  {
    num: "02",
    eyebrow: "Lease velocity",
    title: "Days on market, ranked within-quadrant",
    description:
      "Trailing 12-month DOM ranked inside each operator's own structural cohort and against the MSA median. Selection-bias adjusted for listing churn.",
    anchor: "/methodology#dom",
  },
  {
    num: "03",
    eyebrow: "Pricing posture",
    title: "Rent & concession behaviour",
    description:
      "Per-listing rent comparison to identical comps, mix-adjusted across years. Concession use measured as a multiple of the prevailing market rate, not a binary flag.",
    anchor: "/methodology#pricing",
  },
  {
    num: "04",
    eyebrow: "Tenancy position",
    title: "Episode-clustered tenure",
    description:
      "Unit-level tenancy episodes benchmarked against MSA cohort percentiles. Comparative, not absolute — every operator is scored against peers who face the same market.",
    anchor: "/methodology#tenancy",
  },
];

export function MethodologyPillars() {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="What we measure"
          title="Outside-in signals every diligence buyer needs."
          context="Four methodology pillars, applied identically across every market we cover. Every score is observed, cohort-relative, and reproducible from the underlying Dwellsy listing record — no operator self-reporting."
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
