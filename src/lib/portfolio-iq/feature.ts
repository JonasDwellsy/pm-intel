export function portfolioIqPreviewEnabled(
  value = process.env.PORTFOLIO_IQ_PREVIEW_ENABLED
): boolean {
  return value === "1";
}

export function portfolioIqSchedulerEnabled(
  value = process.env.PORTFOLIO_IQ_SCHEDULER_ENABLED
): boolean {
  return value === "1";
}
