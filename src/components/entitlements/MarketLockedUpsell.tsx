// v0.22 — shown when a signed-in user hits premium content for a market
// their org hasn't purchased. Hybrid model (design option C): the market
// is real, just not in their plan — so this is an upsell ("contact sales
// to add it"), not a 404. Server component; no client JS.

import Link from "next/link";

export function MarketLockedUpsell({
  marketName,
  backHref = "/property-managers",
}: {
  /** Display name of the locked market, e.g. "Richmond, VA MSA". When
   *  null we fall back to generic copy (direct hit on an unknown slug). */
  marketName: string | null;
  /** Where the "back to your markets" link points. */
  backHref?: string;
}) {
  const subject = marketName
    ? `Dwellsy IQ — add ${marketName} to our plan`
    : "Dwellsy IQ — add a market to our plan";
  const mailto = `mailto:sales@dwellsy.com?subject=${encodeURIComponent(subject)}`;

  return (
    <main className="mx-auto max-w-[640px] px-6 py-24 text-center">
      <p className="dq-eyebrow text-teal">Not in your plan</p>
      <h1 className="mt-3 text-[28px] font-semibold leading-tight text-navy">
        {marketName ? (
          <>
            {marketName} isn&rsquo;t part of your Dwellsy IQ subscription yet.
          </>
        ) : (
          <>This market isn&rsquo;t part of your Dwellsy IQ subscription yet.</>
        )}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        Your team has access to the markets in your current plan. To add{" "}
        {marketName ? "this market" : "more markets"}, reach out and we&rsquo;ll
        get it provisioned.
      </p>
      <div className="mt-7 flex items-center justify-center gap-3">
        <a
          href={mailto}
          className="inline-flex h-11 items-center rounded-md bg-navy px-6 text-[14px] font-semibold text-white transition-colors hover:bg-navy-700"
        >
          Contact sales to add it →
        </a>
        <Link
          href={backHref}
          className="inline-flex h-11 items-center rounded-md border border-navy bg-white px-6 text-[14px] font-semibold text-navy transition-colors hover:bg-navy-soft"
        >
          Back to your markets
        </Link>
      </div>
    </main>
  );
}
