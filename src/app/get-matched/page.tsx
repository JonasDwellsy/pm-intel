import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { LeadForm } from "@/components/leads/LeadForm";
import { TrackEvent } from "@/components/analytics/TrackEvent";

export const metadata: Metadata = {
  title: "Get matched to a property manager",
  description:
    "Tell us what you own and we'll match you with three operators in your market who fit. Independent, data-driven, free.",
};

export default async function GetMatchedPage() {
  const markets = await prisma.market.findMany({
    select: { id: true, fullName: true },
    orderBy: { city: "asc" },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <TrackEvent event="lead_form_view" />
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Get matched to a property manager
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Tell us what you own. We'll surface three operators in your market
          who fit, based on actual performance data — not who pays for
          placement. Free, takes about a minute.
        </p>
      </header>

      <LeadForm markets={markets} />
    </main>
  );
}
