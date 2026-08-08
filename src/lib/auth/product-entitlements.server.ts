import "server-only";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import {
  hasProductAccess,
  type ProductKey,
} from "@/lib/auth/product-entitlements";

export async function viewerHasProductAccess(
  productKey: ProductKey
): Promise<boolean> {
  const { userId, organizationId } = await getActiveOrgContext();
  if (isAdminUser(userId)) return true;
  if (!userId || !organizationId) return false;

  const grants = await prisma.organizationProductAccess.findMany({
    where: { organizationId },
    select: { productKey: true },
  });
  return hasProductAccess(
    { isAdmin: false, grantedProductKeys: grants.map((row) => row.productKey) },
    productKey
  );
}
