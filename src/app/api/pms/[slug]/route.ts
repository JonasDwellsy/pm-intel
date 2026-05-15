import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const pm = await prisma.pM.findUnique({ where: { slug } });

  if (!pm) {
    return Response.json({ error: "PM not found" }, { status: 404 });
  }

  const scorecard: ScorecardData = JSON.parse(pm.scorecardData);
  return Response.json(scorecard);
}
