export const PRODUCT_KEYS = ["operator_iq", "market_iq"] as const;
export type ProductKey = (typeof PRODUCT_KEYS)[number];

export function hasProductAccess(input: {
  isAdmin: boolean;
  grantedProductKeys: readonly string[];
}, productKey: ProductKey): boolean {
  return input.isAdmin || input.grantedProductKeys.includes(productKey);
}
