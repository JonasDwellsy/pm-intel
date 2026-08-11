"use server";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { loadOwnerWatchlist } from "@/lib/portfolio-iq/owner-watchlist.server";
import { ownerWatchIdentity } from "@/lib/portfolio-iq/owner-watchlist";
import { prisma } from "@/lib/prisma";

export async function toggleOwnerWatchItem(formData: FormData): Promise<void> {
  const { userId, organizationId } = await getActiveOrgContext();
  const objectType = String(formData.get("objectType") ?? "");
  const objectKey = String(formData.get("objectKey") ?? "");
  const mode = String(formData.get("mode") ?? "pin");
  if (!userId || !organizationId || !objectType || !objectKey) throw new Error("Choose an item to watch.");
  const data = await loadOwnerWatchlist({ userId, organizationId });
  if (!data) throw new Error("Owner workspace not found.");
  const candidate = data.candidates.find((item) => ownerWatchIdentity(item) === `${objectType}:${objectKey}`);
  if (!candidate) throw new Error("That item is not part of this portfolio workspace.");
  const key = { portfolioId_objectType_objectKey: { portfolioId: data.portfolio.id, objectType, objectKey } };
  if (mode === "unpin") {
    await prisma.portfolioIqOwnerWatchItem.deleteMany({ where: key.portfolioId_objectType_objectKey });
  } else {
    await prisma.portfolioIqOwnerWatchItem.upsert({
      where: key,
      create: { portfolioId: data.portfolio.id, organizationId: data.portfolio.organizationId, objectType, objectKey, label: candidate.label, href: candidate.href, pinnedBy: userId },
      update: { label: candidate.label, href: candidate.href, pinnedBy: userId },
    });
  }
  revalidatePath("/portfolio-iq/watchlists");
}
