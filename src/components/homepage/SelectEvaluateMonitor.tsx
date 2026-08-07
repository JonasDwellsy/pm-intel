import Link from "next/link";
import { HomepageSectionHead } from "./SectionHead";
import { PerformanceAlert } from "./PerformanceAlert";

// The three jobs, ordered the way an owner actually works: choose an operator,
// judge whether its numbers are any good, then keep watching. This replaces the
// older Select/Screen/Monitor framing — Monitor now carries the recurring value
// (and the alert example sits directly beneath it), while Select stays a
// first-class job rather than the thing that defines the product.

type Job = {
  eyebrow: string;
  title: string;
  description: string;
  linkLabel: string;
  href: string;
  /** Monitor is the recurring hook, so it gets the accent border. */
  lead?: boolean;
};

const JOBS: Job[] = [
  {
    eyebrow: "Select",
    title: "Choose the operator that will earn the best yield.",
    description:
      "Shortlist operators with the right geography, scale, and demonstrated performance for the assignment, before you sign.",
    linkLabel: "Browse markets →",
    href: "/property-managers",
  },
  {
    eyebrow: "Evaluate",
    title: "Know whether performance is actually good.",
    description:
      "Benchmark an operator against peers facing the same market conditions, so every number arrives with the context to judge it.",
    linkLabel: "See a sample scorecard →",
    href: "/sample",
  },
  {
    eyebrow: "Monitor",
    title: "Know the moment performance moves.",
    description:
      "Track lease-up, retention, rent, and marketing over time. A monthly signal tells you when something shifts, while there is still time to act on it.",
    linkLabel: "Build a watch list →",
    href: "/watch-lists/new",
    lead: true,
  },
];

export function SelectEvaluateMonitor() {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="Three jobs, one independent standard"
          title="Select the right operator. Evaluate it honestly. Monitor it continuously."
          context="The same observed record answers all three, so the operator you shortlist is measured the same way as the one already running your assets."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {JOBS.map((job) => (
            <div
              key={job.eyebrow}
              className={
                "group flex min-h-[300px] flex-col rounded-md border bg-white p-7 transition-all duration-[180ms] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(15_31_63_/_0.06)] " +
                (job.lead
                  ? "border-teal shadow-[0_0_0_1px_rgb(14_124_134_/_0.35)_inset] hover:border-teal-700"
                  : "border-grid hover:border-navy")
              }
            >
              <p className="mb-3.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-teal">
                {job.eyebrow}
              </p>
              <h3 className="dq-h2 mb-3.5 text-[21px] leading-[1.22] tracking-[-0.005em]">
                {job.title}
              </h3>
              <p className="flex-1 text-[15.5px] leading-[1.55] text-foreground/85">
                {job.description}
              </p>
              <Link
                href={job.href}
                className="mt-6 inline-block text-[13.5px] font-semibold text-teal transition-colors group-hover:text-teal-700"
              >
                {job.linkLabel}
              </Link>
            </div>
          ))}
        </div>

        <PerformanceAlert />
      </div>
    </section>
  );
}
