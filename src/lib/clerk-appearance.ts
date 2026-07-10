// Single source of truth for Clerk's look, applied on <ClerkProvider> so the
// sign-in modal, the /sign-in page, and the UserButton all match the site
// (Inter type, navy primary, flat cards) instead of Clerk's out-of-the-box
// blue/shadowed defaults. Component-level `appearance` props merge on top of
// this — e.g. the /sign-in page hides Clerk's own logo/title because it
// renders its own heading.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#0f1f3f", // --color-navy
    colorText: "#0f1f3f",
    fontFamily: "var(--font-inter)",
    borderRadius: "0.5rem",
  },
  elements: {
    card: "shadow-none border border-grid",
    formButtonPrimary:
      "bg-navy hover:bg-navy-700 text-white text-[13px] font-semibold",
  },
} as const;
