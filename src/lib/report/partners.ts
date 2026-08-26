// v0.31 — White-label partner registry for the consumer /report funnel.
//
// The funnel can wear a partner co-brand (e.g. BiggerPockets) driven by a
// `?partner=<slug>` param that already threads through search → report →
// checkout. This registry maps a slug to its theme; adding a partner is a
// config edit here, nothing else. Pure + type-only imports so it's safe to
// import from client and server.
//
// NOTE: partner brand names/colors below are PLACEHOLDERS for a real
// co-marketing conversation — swap `accent`, `brandName`, and (later) a real
// logo asset for the partner's official brand kit before anything ships
// externally.

export interface PartnerTheme {
  slug: string;
  /** Wordmark shown in the funnel header. */
  brandName: string;
  /** Sub-label under the wordmark, e.g. the product name. */
  productLabel: string;
  /** Whether to show the "Powered by Dwellsy Operator IQ" attribution. */
  showPoweredBy: boolean;
  /** Primary accent (CTA / header). Any CSS color. */
  accent: string;
  /** Foreground on the accent. */
  accentFg: string;
  /** Small eyebrow label on the landing hero. */
  eyebrow: string;
}

export const DEFAULT_PARTNER: PartnerTheme = {
  slug: "default",
  brandName: "Operator IQ",
  productLabel: "for owners",
  showPoweredBy: false,
  accent: "#0f2140", // navy — matches the Dwellsy Operator IQ palette
  accentFg: "#ffffff",
  eyebrow: "Operator IQ · for owners",
};

const PARTNERS: Record<string, PartnerTheme> = {
  biggerpockets: {
    slug: "biggerpockets",
    brandName: "BiggerPockets",
    productLabel: "Property Manager Check",
    showPoweredBy: true,
    // Placeholder brand green — replace with the official BiggerPockets token.
    accent: "#116E63",
    accentFg: "#ffffff",
    eyebrow: "Property Manager Check",
  },
};

/** Resolve a partner slug to its theme, falling back to the Dwellsy default. */
export function resolvePartner(slug?: string | null): PartnerTheme {
  if (!slug) return DEFAULT_PARTNER;
  return PARTNERS[slug.trim().toLowerCase()] ?? DEFAULT_PARTNER;
}
