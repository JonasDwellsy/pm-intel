import "server-only";
import { prisma } from "@/lib/prisma";
import { parseScorecard } from "@/lib/scorecard/parse";
import {
  buildOperatorResponseContext,
  type OperatorResponseCandidate,
  type OperatorResponseContext,
} from "@/lib/dwellsy-iq/operator-response";

export interface OperatorResponseAsset {
  id: string;
  observedOperatorName: string | null;
  operatorAssignments: Array<{
    observedOperatorName: string;
    verificationStatus: string;
  }>;
}

export async function loadOperatorResponseContexts(input: {
  marketId: string;
  assets: OperatorResponseAsset[];
}): Promise<Map<string, OperatorResponseContext>> {
  const observedNames = [...new Set(input.assets.flatMap((asset) => {
    const assignment = asset.operatorAssignments[0];
    const name = assignment?.observedOperatorName ?? asset.observedOperatorName;
    return name ? [name] : [];
  }))];
  if (observedNames.length === 0) return new Map();

  // Operator IQ is read only here. Portfolio assignments never alter its
  // scorecards, ranks, snapshots, or customer-facing access paths.
  const rows = await prisma.pM.findMany({
    where: { marketId: input.marketId },
    select: {
      slug: true,
      name: true,
      canonicalOperatorId: true,
      canonicalOperatorName: true,
      marketId: true,
      scorecardData: true,
      market: { select: { city: true, state: true } },
    },
  });
  const candidates: OperatorResponseCandidate[] = rows.flatMap((row) => {
    try {
      return [{ ...row, scorecard: parseScorecard(row) }];
    } catch {
      return [];
    }
  });

  return new Map(input.assets.flatMap((asset) => {
    const assignment = asset.operatorAssignments[0];
    const observedOperatorName = assignment?.observedOperatorName ?? asset.observedOperatorName;
    if (!observedOperatorName) return [];
    return [[asset.id, buildOperatorResponseContext({
      observedOperatorName,
      verificationStatus: assignment?.verificationStatus ?? "observed",
      candidates,
    })] as const];
  }));
}
