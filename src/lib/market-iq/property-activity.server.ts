import "server-only";

import { selectMarketIqDailyEditionArchive } from "@/lib/market-iq/daily-edition-archive";
import { buildMarketIqPropertyActivityView } from "@/lib/market-iq/property-activity";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { loadMarketIqReportSourceSnapshotCandidates } from "@/lib/market-iq/report/source-snapshot.server";

export async function loadMarketIqPropertyActivityView(input: {
  marketId: string;
  propertyId: string;
  timeZone: string;
}) {
  const candidates = await loadMarketIqReportSourceSnapshotCandidates(input.marketId) as Array<{
    id: string;
    generatedAt: string;
    report: MarketIqReportSnapshot;
  }>;
  const archive = selectMarketIqDailyEditionArchive({
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      generatedAt: candidate.generatedAt,
      availability: candidate.report.marketActivity,
      value: candidate.report,
    })),
    timeZone: input.timeZone,
    recentLimit: 30,
  });
  return buildMarketIqPropertyActivityView({
    propertyId: input.propertyId,
    editions: archive.recent,
  });
}
