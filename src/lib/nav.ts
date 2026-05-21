// Centralized navigation config — single source of truth for the
// top-nav menu, the mobile menu (when one exists), and the footer
// link list. Three surfaces consume this so a label / href tweak
// lands in one place and ripples consistently.
//
// Item order on the desktop nav matches the array order: Buy Boxes
// first (acquirer-positioning primary entry point), then the
// existing Markets / Briefs / Methodology / Ask sequence.

export interface NavItem {
  /** Route or full URL. Internal links use Next's <Link>; the
   *  consumers check whether the href starts with "/" to decide. */
  href: string;
  /** Visible text. */
  label: string;
  /** Optional small inline badge (e.g. "AI" on the Ask link) —
   *  rendered as a chip after the label by the desktop header. */
  badge?: string;
}

/** Top-nav text links in display order. The header hides these
 *  below the sm breakpoint via Tailwind classes; the primary CTA
 *  button (PRIMARY_CTA below) is the only nav affordance visible
 *  on the narrowest viewports. */
export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/buy-boxes", label: "Buy Boxes" },
  { href: "/property-managers", label: "Markets" },
  { href: "/briefs", label: "Briefs" },
  { href: "/methodology", label: "Methodology" },
  { href: "/ask", label: "Ask", badge: "AI" },
];

/** Primary action button. Acquirer-positioning: clicking takes the
 *  visitor straight into the template picker so they can clone a
 *  named acquisition thesis without any auth gate. The actual save
 *  action on the editor still requires auth. */
export const PRIMARY_CTA = {
  href: "/buy-boxes/new",
  label: "Build a buy box →",
} as const;

/** Footer link order — slightly different shape from NAV_ITEMS to
 *  accommodate external + mailto links the desktop nav doesn't
 *  carry (errata, terms). The footer renderer in SiteFooter walks
 *  this directly. */
export interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
}

export const FOOTER_LINKS: ReadonlyArray<FooterLink> = [
  { href: "/buy-boxes", label: "Buy Boxes" },
  { href: "/methodology", label: "Methodology" },
  { href: "/methodology#glossary", label: "Glossary" },
  { href: "/property-managers", label: "Markets" },
  {
    href: "mailto:pmintel@dwellsy.com?subject=Data%20correction%20request",
    label: "Request errata",
    external: true,
  },
  {
    href: "https://dwellsy.com/pages/terms-of-use",
    label: "Terms",
    external: true,
  },
];
