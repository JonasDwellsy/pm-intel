import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { LeadForm } from "@/components/leads/LeadForm";
import { WhatHappensNextCallout } from "@/components/leads/WhatHappensNextCallout";
import { TrackEvent } from "@/components/analytics/TrackEvent";

export const metadata: Metadata = {
  title: "Get matched with a property manager",
  description:
    "Tell us about your property. We match you with three operators in your market who fit your structural profile — independent, data-driven, free.",
};

export default async function GetMatchedPage() {
  const markets = await prisma.market.findMany({
    select: { id: true, fullName: true },
    orderBy: { city: "asc" },
  });

  return (
    <main className="bg-[#FBFAF6]">
      <TrackEvent event="lead_form_view" />
      <div className="mx-auto max-w-[720px] px-6 pb-20 pt-20 sm:px-8 lg:pb-28">
        <header className="mb-10 pb-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal">
            Dwellsy IQ · Owner matching
          </p>
          <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-[-0.018em] text-navy sm:text-[44px]">
            Get matched with a property manager.
          </h1>
          <p className="mt-5 max-w-[620px] text-[16px] leading-[1.55] text-foreground/85 sm:text-[17px]">
            Tell us about your property — what type, where, and the operator
            profile that fits — and we&apos;ll surface three property managers
            in your market who match your structural needs.
          </p>
          <p className="mt-4 text-[14px] italic text-muted-foreground">
            Typical response time: 1–2 business days · Methodology v0.3.4
          </p>
        </header>

        <LeadForm markets={markets} />

        <WhatHappensNextCallout />
      </div>
    </main>
  );
}
