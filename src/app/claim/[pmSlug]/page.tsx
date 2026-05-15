import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { ClaimForm } from "@/components/claim/ClaimForm";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { TrackEvent } from "@/components/analytics/TrackEvent";

type RouteParams = { pmSlug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { pmSlug } = await params;
  const pm = await prisma.pM.findUnique({
    where: { slug: pmSlug },
    select: { name: true },
  });
  if (!pm) return { title: "Claim — not found" };
  return {
    title: `Claim ${pm.name}`,
    description: `Claim and manage the Dwellsy IQ profile for ${pm.name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { pmSlug } = await params;
  const pm = await prisma.pM.findUnique({
    where: { slug: pmSlug },
    select: {
      slug: true,
      name: true,
      quadrant: true,
      claimed: true,
      market: { select: { state: true, city: true, fullName: true } },
    },
  });
  if (!pm) notFound();

  const scorecardHref = `/property-managers/${stateCodeToSlug(pm.market.state)}/${citySlug(pm.market.city)}/${pm.slug}`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <TrackEvent
        event="claim_landing_view"
        properties={{ pmSlug: pm.slug, claimed: pm.claimed }}
      />
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Claim profile
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{pm.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{pm.market.fullName}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{pm.quadrant}</Badge>
          {pm.claimed && <Badge variant="outline">Already claimed</Badge>}
        </div>
      </header>

      <section className="mb-8 space-y-3 text-sm">
        <p>
          If you run {pm.name}, claim this profile to add a verified manager
          response, correct details, and reply to leads we route to you.
        </p>
        <p className="text-muted-foreground">
          We'll email the address you provide to confirm domain control. Full
          claim flow (response editing, branding, lead inbox) ships with
          Journey 3.
        </p>
      </section>

      {pm.claimed ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-medium">This profile is already claimed</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            If you believe that's a mistake, email{" "}
            <a className="underline" href="mailto:claims@dwellsy.com">
              claims@dwellsy.com
            </a>{" "}
            and we'll investigate.
          </p>
        </div>
      ) : (
        <ClaimForm pmSlug={pm.slug} />
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        <Link href={scorecardHref} className="hover:text-foreground">
          ← Back to scorecard
        </Link>
      </p>
    </main>
  );
}
