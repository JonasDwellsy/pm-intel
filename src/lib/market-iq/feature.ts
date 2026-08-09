export function marketIqPreviewEnabled(
  value = process.env.MARKET_IQ_PREVIEW_ENABLED
): boolean {
  return value === "1";
}

export function marketIqPublicReviewEnabled(
  previewValue = process.env.MARKET_IQ_PREVIEW_ENABLED,
  vercelEnvironment = process.env.VERCEL_ENV
): boolean {
  return marketIqPreviewEnabled(previewValue) && vercelEnvironment === "preview";
}
