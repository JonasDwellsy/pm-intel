import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug, toPmListItem } from "@/lib/slugify";
import { fmtDays, fmtInt } from "@/lib/format";
import {
  PROPERTY_TYPE_LABELS,
  type PropertyType,
} from "@/lib/lead-schema";

export const metadata: Metadata = {
  title: "Your matched property managers",
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const { leadId } = await searchParams;
  if (!leadId) notFound();

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) notFound();

  const matchedSlugs: string[] = JSON.parse(lead.matchedPms);
  const matchRows = await prisma.pM.findMany({
    where: { slug: { in: matchedSlugs } },
    select: {
      slug: true,
      name: true,
      quadrant: true,
      hybrid: true,
      rankOverall: true,
      rankQuadrant: true,
      claimed: true,
      scorecardData: true,
      market: { select: { state: true, city: true } },
    },
  });

  const matches = matchedSlugs
    .map((slug) => matchRows.find((m) => m.slug === slug))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Your matched property managers
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Thanks {lead.ownerName.split(" ")[0]} — we sent a copy to{" "}
          <span className="font-medium text-foreground">{lead.ownerEmail}</span>
          .
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Property type
            </dt>
            <dd className="font-medium">
              {PROPERTY_TYPE_LABELS[lead.propertyType as PropertyType] ??
                lead.propertyType}
            </dd>
          </div>
          {lead.unitCount !== null && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Unit count
              </dt>
              <dd className="font-medium tabular-nums">
                {fmtInt(lead.unitCount)}
              </dd>
            </div>
          )}
          {lead.preferredQuadrant && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Preferred profile
              </dt>
              <dd className="font-medium">{lead.preferredQuadrant}</dd>
            </div>
          )}
        </dl>
      </header>

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm">
            No matches in our current dataset — we'll reach out when we expand
            coverage in your market.
          </p>
        </div>
      ) : (
        <ol className="space-y-4">
          {matches.map((row, i) => {
            const pm = toPmListItem(row);
            const state = stateCodeToSlug(row.market.state);
            const city = citySlug(row.market.city);
            const href = `/property-managers/${state}/${city}/${pm.slug}`;
            return (
              <li
                key={pm.slug}
                className="rounded-lg border border-border bg-card p-5"
              >
                <div className="mb-2 flex items-baseline justify-between gap-4">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Match #{i + 1}
                    </span>
                    <h2 className="text-lg font-medium">
                      <Link href={href} className="hover:underline">
                        {pm.name}
                      </Link>
                    </h2>
                  </div>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    #{pm.rankOverall ?? "—"} / {row.market.city}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{pm.quadrant}</Badge>
                  {pm.hybrid && <Badge variant="outline">Hybrid</Badge>}
                  {pm.claimed && <Badge variant="outline">Claimed</Badge>}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {fmtInt(pm.totalObservedUnits)} units observed ·{" "}
                  {fmtDays(pm.domT12)} DOM T12 · {pm.primaryCity}
                </p>
                <div className="mt-4">
                  <Link
                    href={href}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    View full scorecard →
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Lead reference: <code>{lead.id}</code>
      </p>
    </main>
  );
}
