import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";
import { ScorecardPDF } from "@/components/pdf/ScorecardPDF";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const user = url.searchParams.get("user")?.trim() || "guest";
  const date =
    url.searchParams.get("date")?.trim() ||
    new Date().toISOString().slice(0, 10);

  const pm = await prisma.pM.findUnique({ where: { slug } });
  if (!pm) {
    return new Response("PM not found", { status: 404 });
  }

  const scorecard = JSON.parse(pm.scorecardData) as ScorecardData;
  const watermark = `${user} · ${date} · methodology ${scorecard.methodologyVersion}`;

  const buffer = await renderToBuffer(
    ScorecardPDF({ scorecard, watermark })
  );

  const filename = `${slug}-${date}.pdf`;
  const inline = url.searchParams.get("inline") === "1";
  const disposition = inline
    ? `inline; filename="${filename}"`
    : `attachment; filename="${filename}"`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}
