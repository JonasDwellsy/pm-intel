import Link from "next/link";
import { HomepageSectionHead } from "./SectionHead";

// The "what it's for" section — the three jobs Operator IQ does, mapped to
// the product surfaces that do them. Sits directly under the hero and above
// MethodologyPillars (which now reads as the proof beneath "Screen").

type UseCase = {
  eyebrow: string;
  title: string;
  description: string;
  linkLabel: string;
  href: string;
};

const USE_CASES: UseCase[] = [
  {
    eyebrow: "Select",
    title: "Find the right operator.",
    description:
      "Search 20,000+ managers by market, size, and type, compare them head-to-head, and build a shortlist watch list — so you start from the operators that actually fit.",
    linkLabel: "Browse markets →",
    href: "/property-managers",
  },
  {
    eyebrow: "Screen",
    title: "Vet before you sign.",
    description:
      "Pull a full scorecard on any operator — scale, type, operating signals, and footprint — every figure observed from the listing record, so due diligence takes minutes, not weeks.",
    linkLabel: "See a sample scorecard →",
    href: "/sample",
  },
  {
    eyebrow: "Monitor",
    title: "Watch what changes.",
    description:
      "Track the operators you care about. Monthly change alerts flag rent, retention, and lease-up moves as they happen — so a slipping manager or a shifting target never surprises you.",
    linkLabel: "Build a watch list →",
    href: "/watch-lists/new",
  },
];

export function SelectScreenMonitor() {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="What it's for"
          title="Three jobs. One operator record."
          context="From first shortlist to ongoing oversight — every operator on one observed, always-current record."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {USE_CASES.map((u) => (
            <div
              key={u.eyebrow}
              className="group flex min-h-[300px] flex-col rounded-md border border-grid bg-white p-7 transition-all duration-[180ms] hover:-translate-y-0.5 hover:border-navy hover:shadow-[0_8px_24px_rgb(15_31_63_/_0.06)]"
            >
              <p className="mb-3.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-teal">
                {u.eyebrow}
              </p>
              <h3 className="dq-h2 mb-3.5 text-[22px] leading-[1.2] tracking-[-0.005em]">
                {u.title}
              </h3>
              <p className="flex-1 text-[15.5px] leading-[1.55] text-foreground/85">
                {u.description}
              </p>
              <Link
                href={u.href}
                className="mt-6 inline-block text-[13.5px] font-semibold text-teal transition-colors group-hover:text-teal-700"
              >
                {u.linkLabel}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
