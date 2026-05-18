import Link from "next/link";
import { fmtDate } from "@/lib/format";

export function MethodologyFooter({
  version,
  designVersion,
  dataAsOf,
}: {
  version: string;
  designVersion?: string;
  dataAsOf: string;
}) {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-6 pb-24 pt-14 sm:px-16 lg:grid-cols-[220px_1fr] lg:gap-14 lg:pb-32">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Methodology
          </p>
          <p className="mt-1 text-[11.5px] font-semibold text-navy">
            v{version.replace(/^v/, "")}
            {designVersion && (
              <span className="ml-1.5 text-muted-2">
                · Design {designVersion}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[14px] italic text-muted-foreground">
            Data as of {fmtDate(dataAsOf)}
          </p>
        </div>
        <p className="max-w-[70ch] text-[16px] leading-[1.65] text-foreground/85 sm:text-[17px]">
          Every score, rank, and chart on Dwellsy IQ is produced by a single,
          versioned methodology — not bespoke per-operator analysis. Selection
          bias, eligibility thresholds, cohort assignment, and quadrant
          placement are documented in full and revised in numbered releases.
          When the methodology changes, prior versions remain accessible and
          every scorecard carries the version it was computed under.{" "}
          <Link
            href="/methodology"
            className="border-b border-teal pb-px font-semibold text-teal transition-colors hover:border-teal-700 hover:text-teal-700"
          >
            Read the full methodology →
          </Link>
        </p>
      </div>
    </section>
  );
}
