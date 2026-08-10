export function marketIqPreviewEnabled(
  value = process.env.MARKET_IQ_PREVIEW_ENABLED
): boolean {
  return value === "1";
}
