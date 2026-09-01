import type { Metadata } from "next";
import { siteRobotsMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { buildNationalBriefData } from "@/lib/national-brief";
import {
  generateNationalBriefProse,
  readCachedNationalHeadline,
  type NationalBriefProse,
} from "@/lib/national-brief-prose";
import { fmtDate, fmtInt } from "@/lib/format";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// /briefs/national — cross-market "state of the union". Server-rendered:
// reads the cache (keyed by methodologyVersion + dataAsOf + input digest) or
// generates fresh prose on a cold cache, then renders. Dynamic — the cache
// lives in Postgres and the miss path may call Anthropic.

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const headline = await readCachedNationalHeadline();
  const title = "National Market Brief";
  const description =
    headline ??
    "A cross-market read of U.S. rental operator dynamics — what moved, standout markets, and the national operator landscape.";
  return {
    title,
    description,
    alternates: { canonical: "/briefs/national" },
    openGraph: { title, description, type: "article" },
    // Follows the site-wide switch (see src/lib/seo.ts). Hardcoded
    // `{ index: true }` here would override the blanket noindex header.
    robots: siteRobotsMetadata(),
  };
}

export default async function NationalBriefPage() {
  const data = await buildNationalBriefData();
  if (!data) notFound();

  // Public sample: this national brief stays open to anonymous readers; the
  // per-market briefs are gated. Show a conversion CTA to signed-out visitors.
  const { userId } = await auth();
  const isSignedIn = !!userId;

  let prose: NationalBriefProse | null = null;
  let generationError: string | null = null;
  try {
    prose = await generateNationalBriefProse(data);
  } catch (err) {
    generationError = err instanceof Error ? err.message : "Unable to generate brief.";
    console.error("[national-brief] generation failed", err);
  }

  const rentPct =
    data.nationalRentGrowthT12 != null
      ? `${data.nationalRentGrowthT12 >= 0 ? "+" : ""}${(data.nationalRentGrowthT12 * 100).toFixed(2)}%`
      : "—";

  return (
    <div className="bg-background">
      <article className="mx-auto max-w-[720px] px-6 py-14 sm:py-20">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex items-center gap-2 text-xs font-medium text-muted-foreground"
        >
          <Link href="/briefs" className="hover:text-navy hover:underline">
            Briefs
          </Link>
          <span>/</span>
          <span>National</span>
        </nav>

        <p className="dq-eyebrow tracking-[0.16em] text-[11px]">
          DWELLSY IQ RESEARCH · NATIONAL
        </p>

        {prose ? (
          <>
            <h1 className="mt-4 text-[34px] font-semibold leading-[1.15] tracking-[-0.014em] text-navy sm:text-[40px]">
              {prose.headlineRead}
            </h1>
            <p className="mt-4 text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
              As of {fmtDate(data.dataAsOf)} · {data.marketCount} markets ·
              Methodology {data.methodologyVersion}
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-[34px] font-semibold leading-[1.15] tracking-[-0.014em] text-navy sm:text-[40px]">
              National market brief
            </h1>
            <div className="mt-8 rounded-md border border-destructive/25 bg-destructive/5 p-4 text-[14px] text-destructive">
              Brief temporarily unavailable. {generationError ?? ""} In the
              meantime, browse the{" "}
              <Link href="/briefs" className="font-semibold text-destructive underline">
                per-market briefs
              </Link>
              .
            </div>
          </>
        )}

        {/* Quick stats */}
        <div className="mt-10 grid grid-cols-2 gap-4 border-y border-grid py-5 sm:grid-cols-3">
          <StatTile label="Covered markets" value={fmtInt(data.marketCount)} />
          <StatTile label="National rent growth T12" value={rentPct} />
          <StatTile
            label="Largest multi-market operator"
            value={data.largestOperators[0]?.name ?? "—"}
          />
        </div>

        {prose && (
          <div className="mt-10 space-y-10">
            {prose.sinceLastPeriod ? (
              <BriefSection title="What moved" body={prose.sinceLastPeriod} />
            ) : null}
            <BriefSection title="Standout markets" body={prose.shareMovement} />
            <BriefSection title="National operator landscape" body={prose.operatorLandscape} />
            <BriefSection title="Standout operators" body={prose.notableSignals} />
          </div>
        )}

        {!isSignedIn && (
          <div className="mt-12 rounded-lg border border-navy/30 bg-navy/[0.03] p-6">
            <p className="text-[15px] font-semibold text-navy">
              This is the free national brief.
            </p>
            <p className="mt-1.5 text-[14px] leading-[1.55] text-foreground/80">
              Sign in to open the per-market briefs — operator landscape, share
              movement, and notable signals for each covered market.
            </p>
            <Link
              href="/sign-in?redirect_url=/briefs"
              className="mt-4 inline-block text-[13px] font-semibold text-teal transition-transform hover:translate-x-0.5"
            >
              Sign in to read market briefs →
            </Link>
          </div>
        )}

        {prose && (
          <p className="mt-12 border-t border-grid pt-5 text-[12px] text-muted-foreground">
            Generated {fmtDate(prose.generatedAt.toISOString())} · Powered by
            Dwellsy IQ Markets methodology {data.methodologyVersion}
          </p>
        )}
      </article>
    </div>
  );
}

function BriefSection({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-navy">
        {title}
      </h2>
      <div className="dq-prose text-[15px] leading-[1.65] text-foreground/85">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[18px] font-semibold text-navy">{value}</p>
    </div>
  );
}
