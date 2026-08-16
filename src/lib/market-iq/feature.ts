export function marketIqPreviewEnabled(
  value = process.env.MARKET_IQ_PREVIEW_ENABLED
): boolean {
  return value === "1";
}

/**
 * Temporary Clerk development access is permitted only on a Vercel Preview
 * deployment that also has the Market IQ feature flag. Requiring a pk_test
 * key keeps this path inert when the shared production Clerk instance is in
 * use, even if somebody accidentally carries the feature flag forward.
 */
export function marketIqDevelopmentPreviewEnabled(): boolean {
  return (
    marketIqPreviewEnabled() &&
    process.env.VERCEL_ENV === "preview" &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ===
      true
  );
}
