import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketIqPublicReport } from "@/components/market-iq/report/MarketIqPublicReport";
import { loadPublicMarketIqReport } from "@/lib/market-iq/report/build.server";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ publicToken: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicToken } = await params;
  const report = await loadPublicMarketIqReport(publicToken);
  if (!report) return { title: "Local market read" };
  return {
    title: { absolute: `${report.brand.displayName} | ${report.scope.marketName} market read` },
    description: `An interactive local market read prepared by ${report.brand.displayName}.`,
    icons: { icon: report.brand.logoUrl ?? "/market-report-icon.svg" },
    robots: { index: false, follow: false },
  };
}

export default async function PublicMarketReportPage({ params }: PageProps) {
  const { publicToken } = await params;
  const report = await loadPublicMarketIqReport(publicToken);
  if (!report) notFound();
  return <MarketIqPublicReport report={report} publicToken={publicToken} />;
}
