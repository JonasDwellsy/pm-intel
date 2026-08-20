import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketIqDataUnavailable } from "@/components/market-iq/MarketIqDataUnavailable";
import { MarketIqPublicReport } from "@/components/market-iq/report/MarketIqPublicReport";
import { loadPublicMarketIqReportState } from "@/lib/market-iq/report/build.server";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ publicToken: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicToken } = await params;
  const result = await loadPublicMarketIqReportState(publicToken);
  if (result.state !== "available") return { title: "Local market read" };
  const report = result.report;
  return {
    title: { absolute: `${report.brand.displayName} | ${report.scope.marketName} market read` },
    description: `An interactive local market read prepared by ${report.brand.displayName}.`,
    icons: { icon: report.brand.logoUrl ?? "/market-report-icon.svg" },
    robots: { index: false, follow: false },
  };
}

export default async function PublicMarketReportPage({ params }: PageProps) {
  const { publicToken } = await params;
  const result = await loadPublicMarketIqReportState(publicToken);
  if (result.state === "not_found") notFound();
  if (result.state === "unavailable") {
    return <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6 lg:py-16">
      <MarketIqDataUnavailable detail="This market read does not contain verified saved evidence, so Market IQ cannot display it. No estimated or example values have been substituted." />
    </main>;
  }
  return <MarketIqPublicReport report={result.report} publicToken={publicToken} />;
}
