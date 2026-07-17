// Pure watch-list authorization predicates. No IO. See the design doc for
// the model: view = own OR shared-to-your-org; edit = own OR (legacy-owned
// AND same org) — the legacy clause grandfathers pre-owner rows as
// org-editable so no one is locked out.
import { LEGACY_OWNER_ID } from "./store";

export interface ListAuthShape {
  ownerId: string;
  organizationId: string | null;
  isShared: boolean;
}
interface AuthCtx {
  userId: string;
  organizationId: string;
}

export function canViewList(list: ListAuthShape, ctx: AuthCtx): boolean {
  if (list.ownerId === ctx.userId) return true;
  return list.isShared === true && list.organizationId === ctx.organizationId;
}

export function canEditList(list: ListAuthShape, ctx: AuthCtx): boolean {
  if (list.ownerId === ctx.userId) return true;
  return (
    list.ownerId === LEGACY_OWNER_ID && list.organizationId === ctx.organizationId
  );
}
