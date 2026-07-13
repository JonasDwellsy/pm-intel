// Shown when a signed-in user reaches a market-dependent surface (the
// watch-list builder) while their active organization has NO market
// access at all — an empty entitlement set. Distinct from
// MarketLockedUpsell, which is about a single market that isn't in an
// otherwise-provisioned plan. This is the "your account has zero
// markets yet" state: a client member invited before their markets
// were granted, or a stray personal workspace with no grants. Server
// component; no client JS.

import Link from "next/link";

export function NoMarketsNotice({
  /** Where the secondary "back" link points. */
  backHref = "/",
}: {
  backHref?: string;
} = {}) {
  const mailto =
    "mailto:sales@dwellsy.com?subject=" +
    encodeURIComponent("Dwellsy IQ — market access for our account");

  return (
    <main className="mx-auto max-w-[640px] px-6 py-24 text-center">
      <p className="dq-eyebrow text-teal">No market access yet</p>
      <h1 className="mt-3 text-[28px] font-semibold leading-tight text-navy">
        Your account doesn&rsquo;t have access to any markets yet.
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        Watch lists filter the operator universe within the markets in your
        plan. Once your administrator provisions markets for your
        organization, the builder and your saved lists will populate here.
      </p>
      <div className="mt-7 flex items-center justify-center gap-3">
        <a
          href={mailto}
          className="inline-flex h-11 items-center rounded-md bg-navy px-6 text-[14px] font-semibold text-white transition-colors hover:bg-navy-700"
        >
          Contact sales about access →
        </a>
        <Link
          href={backHref}
          className="inline-flex h-11 items-center rounded-md border border-navy bg-white px-6 text-[14px] font-semibold text-navy transition-colors hover:bg-navy-soft"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
