import "server-only";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";

export async function loadPortfolioIqHome(input: {
  organizationId: string;
  userId: string;
}) {
  const include = {
    organization: { select: { name: true } },
    assets: {
      include: {
        buildings: { orderBy: [{ isPrimary: "desc" as const }, { canonicalAddress: "asc" as const }] },
        operatorAssignments: {
          where: { isCurrent: true },
          orderBy: { createdAt: "desc" as const },
          take: 1,
        },
        activationTasks: {
          select: { id: true, taskType: true, status: true },
          orderBy: { taskType: "asc" as const },
        },
        compSet: {
          select: { id: true, status: true, reviewedAt: true },
        },
      },
      orderBy: { sortOrder: "asc" as const },
    },
  };

  const organizationPortfolio = await prisma.portfolioIqPortfolio.findFirst({
    where: { organizationId: input.organizationId, status: { not: "archived" } },
    include,
    orderBy: { updatedAt: "desc" },
  });
  if (organizationPortfolio) return organizationPortfolio;

  // Admins can review the synthetic pilot without switching their active
  // Clerk organization. Customer users never cross the organization boundary.
  if (!isAdminUser(input.userId)) return null;
  return prisma.portfolioIqPortfolio.findFirst({
    where: { isSynthetic: true, status: { not: "archived" } },
    include,
    orderBy: { updatedAt: "desc" },
  });
}
