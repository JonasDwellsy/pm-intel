export const DWELLSY_IQ_PRODUCT_ACCESS_METADATA_KEY = "dwellsyIqProductAccess";

export type DwellsyIqProductAccessEnvelope = Readonly<{
  version: 1;
  default: boolean;
  products: Readonly<Record<string, boolean>>;
}>;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseDwellsyIqProductAccess(
  publicMetadata: unknown,
): DwellsyIqProductAccessEnvelope | "legacy" | "invalid" {
  const metadata = objectValue(publicMetadata);
  if (!metadata || !(DWELLSY_IQ_PRODUCT_ACCESS_METADATA_KEY in metadata)) return "legacy";
  const envelope = objectValue(metadata[DWELLSY_IQ_PRODUCT_ACCESS_METADATA_KEY]);
  const products = objectValue(envelope?.products);
  if (!envelope || envelope.version !== 1 || typeof envelope.default !== "boolean" || !products) return "invalid";

  const parsedProducts: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(products)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || typeof value !== "boolean") return "invalid";
    parsedProducts[key] = value;
  }
  return { version: 1, default: envelope.default, products: parsedProducts };
}

export function dwellsyIqMemberHasProductAccess(publicMetadata: unknown, productKey: string): boolean {
  const access = parseDwellsyIqProductAccess(publicMetadata);
  if (access === "legacy") return true;
  if (access === "invalid") return false;
  return access.products[productKey] ?? access.default;
}

export function dwellsyIqProductInvitationMetadata(productKey: string) {
  return {
    [DWELLSY_IQ_PRODUCT_ACCESS_METADATA_KEY]: {
      version: 1,
      default: false,
      products: { [productKey]: true },
    },
  };
}

export function dwellsyIqProductAccessMetadataUpdate(
  publicMetadata: unknown,
  productKey: string,
  enabled: boolean,
) {
  const existing = parseDwellsyIqProductAccess(publicMetadata);
  if (existing === "invalid") throw new Error("The shared Dwellsy IQ product assignment is invalid.");
  return {
    [DWELLSY_IQ_PRODUCT_ACCESS_METADATA_KEY]: {
      version: 1,
      default: existing === "legacy" ? true : existing.default,
      products: { [productKey]: enabled },
    },
  };
}
