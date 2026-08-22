import "server-only";

import { selectMarketIqDailyEditionArchive } from "@/lib/market-iq/daily-edition-archive";
import { loadMarketIqReportSourceSnapshotCandidates } from "@/lib/market-iq/report/source-snapshot.server";

export async function loadMarketIqDailyEditionArchive(input: {
  marketId: string;
  requestedEditionId?: string;
  timeZone: string;
}) {
  const candidates = await loadMarketIqReportSourceSnapshotCandidates(input.marketId);
  return selectMarketIqDailyEditionArchive({
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      generatedAt: candidate.generatedAt,
      availability: candidate.report.marketActivity,
      value: candidate.report,
    })),
    requestedEditionId: input.requestedEditionId,
    timeZone: input.timeZone,
  });
}
