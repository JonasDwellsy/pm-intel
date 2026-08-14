import { renderToBuffer } from "@react-pdf/renderer";
import { MarketIqReportPDF } from "@/components/market-iq/report/MarketIqReportPDF";
import { loadPublicMarketIqReport } from "@/lib/market-iq/report/build.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filenamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "market";
}

export async function GET(_request: Request, { params }: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await params;
  const report = await loadPublicMarketIqReport(publicToken);
  if (!report) return new Response("Report not found", { status: 404 });

  try {
    const buffer = await renderToBuffer(<MarketIqReportPDF report={report} />);
    const filename = `${filenamePart(report.brand.displayName)}-${filenamePart(report.scope.marketName)}-market-report.pdf`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("[market-iq-report-pdf] render failed", error, { publicToken });
    return new Response("Failed to render market report PDF", { status: 500 });
  }
}
