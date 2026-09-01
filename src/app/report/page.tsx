// v0.30 — Consumer funnel landing. PUBLIC (not in PROTECTED_ROUTE_PATTERNS).
// "Look up your property manager" → teaser → checkout. The owner-facing entry
// point for the single-report product (the surface we take to partners like
// BiggerPockets).

import type { Metadata } from "next";
import { ReportSearch } from "@/components/report/ReportSearch";
import { ReportShell } from "@/components/report/ReportShell";
import { resolvePartner } from "@/lib/report/partners";

export const metadata: Metadata = {
  title: "Check your property manager",
  description:
    "Look up any property manager and see how they actually perform — lease-up speed, tenant retention, rent performance, and listing quality, measured independently from real listing activity.",
  alternates: { canonical: "/report" },
};

export default async function ReportLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string }>;
}) {
  const { partner } = await searchParams;
  const theme = resolvePartner(partner);

  return (
    <ReportShell partner={partner}>
    <main className="bg-[#FBFAF6]">
      <section className="mx-auto max-w-[760px] px-6 pb-16 pt-14 sm:pt-20">
        <p className="dq-eyebrow" style={{ color: "var(--report-accent)" }}>
          {theme.eyebrow}
        </p>
        <h1 className="mt-3 text-[32px] font-semibold leading-[1.1] text-navy sm:text-[40px]">
          Before you hand over your property, check the manager.
        </h1>
        <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-muted-foreground">
          Choosing or switching a property manager is a high-stakes call. Look
          up any manager and see how they actually perform against local peers —
          measured independently from real listing activity, not the reviews
          they curate.
        </p>

        <div className="mt-8">
          <ReportSearch partner={partner ?? null} />
        </div>

        {/* Pricing summary */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <PriceCard
            price="$29"
            title="Single report"
            body="The full scorecard for one manager — rank, lease-up speed, retention, rent performance, and marketing quality. Yours to keep, as a PDF."
          />
          <PriceCard
            price="$49"
            title="30-day market pass"
            body="Shopping around? Unlock every ranked manager in your market and compare your shortlist side by side for 30 days."
          />
        </div>

        <p className="mt-8 text-[13px] leading-relaxed text-muted-foreground">
          Independent and data-driven. Dwellsy IQ Markets measures property managers
          from observed rental-listing activity across U.S. markets — we are not
          paid by the managers we rate.
        </p>
      </section>
    </main>
    </ReportShell>
  );
}

function PriceCard({
  price,
  title,
  body,
}: {
  price: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-grid bg-white p-5">
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-semibold text-navy">{price}</span>
        <span className="text-[14px] font-medium text-foreground/80">{title}</span>
      </div>
      <p className="mt-2 text-[13.5px] leading-snug text-muted-foreground">{body}</p>
    </div>
  );
}
