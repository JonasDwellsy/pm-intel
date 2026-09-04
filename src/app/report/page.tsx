// v0.30 — Consumer funnel landing. PUBLIC (not in PROTECTED_ROUTE_PATTERNS).
// "Look up your property manager" → teaser → checkout. The owner-facing entry
// point for the single-report product (the surface we take to partners like
// BiggerPockets).

import type { Metadata } from "next";
import { ReportSearch } from "@/components/report/ReportSearch";
import { ReportShell } from "@/components/report/ReportShell";
import { resolvePartner } from "@/lib/report/partners";
import { PRODUCTS } from "@/lib/billing/products";

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

        {/* Pricing summary — prices from PRODUCTS so this can never drift
            from what Stripe charges (same source SingleReportOffer.tsx uses). */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <PriceCard
            price={`$${PRODUCTS.single_report.priceUsd}`}
            title="Single report"
            body="The full scorecard for one manager — lease-up speed, retention, rent performance, and marketing quality. Yours to keep, as a PDF."
          />
          <PriceCard
            price={`$${PRODUCTS.three_pack.priceUsd}`}
            title="Three-report pack"
            body="Comparing more than one manager? Buy three credits and use them on any managers you choose, whenever you choose — each report yours to keep."
          />
        </div>

        <p className="mt-8 text-[13px] leading-relaxed text-muted-foreground">
          Independent and data-driven. Operator IQ measures property managers
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
