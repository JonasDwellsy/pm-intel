export function canAccessMarketIqReportComposer(input: {
  previewEnabled: boolean;
  userId: string | null;
  organizationId: string | null;
  hasProduct: boolean;
  marketEntitled: boolean;
}) {
  return input.previewEnabled && Boolean(input.userId) && Boolean(input.organizationId) && input.hasProduct && input.marketEntitled;
}
