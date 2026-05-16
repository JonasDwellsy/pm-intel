import Link from "next/link";

// Transparency note about Pro pricing — visually softer than the orange
// `dq-callout-important` (it's information, not a warning) so it lives on
// cream-muted with a hairline border. Teal eyebrow + link, same as the rest
// of the claim portal voice.

export function PricingCallout() {
  return (
    <section
      className="mt-14 rounded-[14px] border bg-cream-muted px-7 py-6 max-md:px-5 max-md:py-5"
      style={{ borderColor: "var(--color-warm-grid)" }}
    >
      <span className="dq-eyebrow">Pricing</span>
      <p className="mt-3 text-[14.5px] leading-[1.6] text-muted-foreground">
        Claiming your profile is free. Dwellsy IQ Pro subscriptions for active
        operators include competitive intelligence, lead routing, advanced
        analytics, and white-label scorecard exports — pricing on request.
      </p>
      <Link
        href="/methodology"
        className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-teal transition-colors hover:text-teal-700"
      >
        Learn about Pro features
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </Link>
    </section>
  );
}
