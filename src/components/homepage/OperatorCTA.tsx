import Link from "next/link";

export function OperatorCTA({ samplePmSlug }: { samplePmSlug: string }) {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-16 lg:py-24">
        <div className="grid gap-10 rounded-lg bg-[#F4F2EC] p-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16 lg:p-14">
          <div>
            <p className="dq-eyebrow tracking-[0.16em]">For operators</p>
            {/* PR #52 — eyebrow → H2 gap owned by `.dq-eyebrow`'s
                `margin-bottom: 0.875rem` rule in globals.css. The
                `mt-3.5` utility PR #51 added here was a no-op
                (overridden by `.dq-h2`'s `margin: 0`); removing it
                so the markup is honest. */}
            <h2 className="dq-h2 max-w-[18ch] text-balance text-[26px] leading-[1.1] tracking-[-0.014em] sm:text-[32px] lg:text-[38px]">
              Claim your profile.
            </h2>
            <p className="mt-5 max-w-[60ch] text-[16px] leading-[1.6] text-foreground/85 sm:text-[17px]">
              Your operating data is already in Dwellsy IQ. Claim your profile
              to review your scorecard before it&apos;s published more widely,
              respond directly to the data, and start receiving owner-matched
              leads from the Dwellsy network.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 lg:items-end">
            <Link
              href={`/claim/${samplePmSlug}`}
              className="inline-flex h-11 items-center justify-center rounded-md border border-navy bg-white px-6 text-[14.5px] font-semibold text-navy transition-colors hover:bg-navy hover:text-white"
            >
              Claim your profile →
            </Link>
            <p className="max-w-[42ch] text-[12px] text-muted-foreground lg:text-right">
              No charge for operator review · Verification within 5 business days
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
