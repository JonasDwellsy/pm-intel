"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";

export async function updatePortfolioDigestPreference(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const portfolioId = String(formData.get("portfolioId") ?? "");
  if (!userId || !organizationId || !portfolioId) throw new Error("Workspace not ready.");
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({ where: { id: portfolioId }, select: { id: true, organizationId: true, isSynthetic: true } });
  if (!portfolio || (portfolio.organizationId !== organizationId && !(portfolio.isSynthetic && isAdminUser(userId)))) throw new Error("Portfolio not found.");
  const enabled = formData.get("enabled") === "on";
  await prisma.portfolioIqDigestPreference.upsert({
    where: { portfolioId_userId: { portfolioId, userId } },
    create: { portfolioId, organizationId: portfolio.organizationId, userId, enabled },
    update: { enabled, cadence: "weekly" },
  });
  revalidatePath("/portfolio-iq");
}
