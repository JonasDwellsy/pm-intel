"use server";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { loadOwnerWatchActivity } from "@/lib/portfolio-iq/owner-watch-activity.server";
import { prisma } from "@/lib/prisma";

export async function markOwnerWatchActivityReviewed(formData: FormData): Promise<void> {
  const { userId, organizationId } = await getActiveOrgContext();
  const eventId = String(formData.get("eventId") ?? "all");
  if (!userId || !organizationId) throw new Error("Owner workspace not found.");
  const data = await loadOwnerWatchActivity({ userId, organizationId });
  if (!data) throw new Error("Owner workspace not found.");
  const selected = eventId === "all" ? data.activity.newEvents : data.activity.events.filter((event) => event.id === eventId);
  if (eventId !== "all" && selected.length !== 1) throw new Error("Activity event not found.");
  const objects = new Map(selected.flatMap((event) => event.objects).map((object) => [`${object.objectType}:${object.objectKey}`, object]));
  objects.set("watchlist:all", { objectType: "watchlist", objectKey: "all", label: "Owner Watchlist" });
  const now = new Date();
  await prisma.$transaction([...objects.values()].map((object) => prisma.portfolioIqOwnerWatchReview.upsert({
    where: { portfolioId_userId_objectType_objectKey: { portfolioId: data.portfolio.id, userId, objectType: object.objectType, objectKey: object.objectKey } },
    create: { portfolioId: data.portfolio.id, organizationId: data.portfolio.organizationId, userId, objectType: object.objectType, objectKey: object.objectKey, reviewedThrough: now },
    update: { reviewedThrough: now },
  })));
  revalidatePath("/portfolio-iq/watchlists/activity");
  revalidatePath("/portfolio-iq/watchlists");
}
