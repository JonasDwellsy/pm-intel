import { PrismaClient } from "@prisma/client";
import seedData from "../src/data/scorecard_data.json";
import type { ScorecardData } from "../src/lib/types";

const prisma = new PrismaClient();

// ---- input shape (loose; mirrors scorecard_data.json) ----
type InputMarket = {
  id: string;
  msaCode: string;
  city: string;
  state: string;
  fullName: string;
  operatorCountTotal: number;
  operatorCountEligible: number;
  medianDomT12: number;
  medianDomLifetime: number;
  quadrantSummary: Record<
    string,
    { count: number; medianDomT12: number | null; medianDomLifetime: number | null }
  >;
  marketDomByAsset?: {
    house?: { t12: number; lifetime: number };
    apartment?: { t12: number; lifetime: number };
  };
  marketConcessionT12?: number;
  cohortTenancy?: {
    house?: { cohortN: number; p25: number; p50: number; p75: number };
    apartment?: { cohortN: number; p25: number; p50: number; p75: number };
  };
  marketingPeerMedians?: Record<
    string,
    { completeness: number; amenities: number; descLen: number }
  >;
  msaBackdropPoints?: Array<{ lat: number; lon: number }>;
  mapCenter?: { lat: number; lon: number };
  mapBounds?: { north: number; south: number; east: number; west: number };
};

type InputPM = {
  slug: string;
  name: string;
  marketId: string;
  primaryCity: string;
  claimed: boolean;
  accentColor?: string;
  quadrant: string;
  hybrid: boolean;
  rank: {
    overall: number;
    overallTotal: number;
    quadrant: number;
    quadrantTotal: number;
    quadrantMedianDomT12: number;
  };
  coverage: ScorecardData["coverage"];
  performance: {
    domT12: number;
    domT12N: number;
    domLifetime: number;
    houseDomT12: number | null;
    houseUrusT12: number;
    houseEligible: boolean;
    aptDomT12: number | null;
    aptUrusT12: number;
    aptEligible: boolean;
    timeSeries: ScorecardData["performance"]["timeSeries"];
  };
  rentTrajectory: ScorecardData["rentTrajectory"];
  pricing: {
    t12MedianPremium: number;
    t12PctAbove10: number;
    t12PctBelow10: number;
    t12ConcessionRate: number;
  };
  marketing: {
    completeness: number;
    amenitiesMentioned: number;
    descLen: number;
  };
  selectionBias: {
    buildings: number;
    observedIntensity: number;
    expectedIntensity: number;
    ratio: number;
    assessment: string;
  };
  tenancy: {
    totalUnits: number;
    multiEpisodeUnits: number;
    multiEpisodePct: number;
    house: {
      gap: number | null;
      n: number;
      cohortP25: number | null;
      cohortP50: number | null;
      cohortP75: number | null;
      cohortN: number;
      pctOfCohortMedian: number | null;
      position: string | null;
    };
    apartment: {
      gap: number | null;
      n: number;
      cohortP25: number | null;
      cohortP50: number | null;
      cohortP75: number | null;
      cohortN: number;
      pctOfCohortMedian: number | null;
      position: string | null;
    };
  };
  geographicCoverage: {
    citiesText: string;
    topCities?: Array<{ name: string; pct: number }>;
    coverageMapPoints?: Array<{
      lat: number;
      lon: number;
      n: number;
      city?: string;
      type?: string;
    }>;
  };
  classificationRationale: string;
};

type InputFile = {
  methodologyVersion: string;
  dataAsOf: string;
  markets: InputMarket[];
  pms: InputPM[];
};

const data = seedData as unknown as InputFile;

function buildScorecard(pm: InputPM, market: InputMarket): ScorecardData {
  const quadrantPeer = market.quadrantSummary[pm.quadrant];
  const marketingPeer = market.marketingPeerMedians?.[pm.quadrant];

  return {
    methodologyVersion: data.methodologyVersion,
    dataAsOf: data.dataAsOf,
    pm: {
      slug: pm.slug,
      name: pm.name,
      quadrant: pm.quadrant,
      hybrid: pm.hybrid,
      accentColor: pm.accentColor,
    },
    market: {
      id: market.id,
      name: market.city,
      state: market.state,
      fullName: market.fullName,
    },
    rank: {
      overall: pm.rank.overall,
      overallTotal: pm.rank.overallTotal,
      quadrant: pm.rank.quadrant,
      quadrantTotal: pm.rank.quadrantTotal,
      quadrantMedianDomT12: pm.rank.quadrantMedianDomT12,
    },
    coverage: pm.coverage,
    performance: {
      domT12: pm.performance.domT12,
      domT12N: pm.performance.domT12N,
      domLifetime: pm.performance.domLifetime,
      houseDomT12: pm.performance.houseDomT12,
      houseUrusT12: pm.performance.houseUrusT12,
      houseEligible: pm.performance.houseEligible,
      aptDomT12: pm.performance.aptDomT12,
      aptUrusT12: pm.performance.aptUrusT12,
      aptEligible: pm.performance.aptEligible,
      // Per-quadrant DOM peer (overall). Per-asset quadrant DOM not in source data → null.
      peerQuadrantDomT12: quadrantPeer?.medianDomT12 ?? market.medianDomT12,
      peerQuadrantHouseDomT12: null,
      peerQuadrantAptDomT12: null,
      peerQuadrantDomLifetime:
        quadrantPeer?.medianDomLifetime ?? market.medianDomLifetime,
      marketDomT12: market.medianDomT12,
      marketHouseDomT12: market.marketDomByAsset?.house?.t12 ?? 0,
      marketAptDomT12: market.marketDomByAsset?.apartment?.t12 ?? 0,
      marketDomLifetime: market.medianDomLifetime,
      timeSeries: pm.performance.timeSeries,
    },
    rentTrajectory: pm.rentTrajectory,
    pricing: {
      t12MedianPremium: pm.pricing.t12MedianPremium,
      t12PctAbove10: pm.pricing.t12PctAbove10,
      t12PctBelow10: pm.pricing.t12PctBelow10,
      t12ConcessionRate: pm.pricing.t12ConcessionRate,
      marketConcessionT12: market.marketConcessionT12 ?? 0,
    },
    marketing: {
      completeness: pm.marketing.completeness,
      amenitiesMentioned: pm.marketing.amenitiesMentioned,
      descLen: pm.marketing.descLen,
      peerCompleteness: marketingPeer?.completeness ?? 0,
      peerAmenities: marketingPeer?.amenities ?? 0,
      peerDescLen: marketingPeer?.descLen ?? 0,
    },
    selectionBias: {
      buildings: pm.selectionBias.buildings,
      observed: pm.selectionBias.observedIntensity,
      expected: pm.selectionBias.expectedIntensity,
      ratio: pm.selectionBias.ratio,
      assessment: pm.selectionBias.assessment,
    },
    tenancy: {
      totalUnits: pm.tenancy.totalUnits,
      multiEpisodeUnits: pm.tenancy.multiEpisodeUnits,
      multiEpisodePct: pm.tenancy.multiEpisodePct,
      aptGap: pm.tenancy.apartment.gap,
      aptN: pm.tenancy.apartment.n,
      aptPosition: pm.tenancy.apartment.position,
      aptP25: pm.tenancy.apartment.cohortP25,
      aptP50: pm.tenancy.apartment.cohortP50,
      aptP75: pm.tenancy.apartment.cohortP75,
      aptCohortN: pm.tenancy.apartment.cohortN,
      aptPctMedian: pm.tenancy.apartment.pctOfCohortMedian,
      sfrGap: pm.tenancy.house.gap,
      sfrN: pm.tenancy.house.n,
      sfrPosition: pm.tenancy.house.position,
      sfrP25: pm.tenancy.house.cohortP25,
      sfrP50: pm.tenancy.house.cohortP50,
      sfrP75: pm.tenancy.house.cohortP75,
      sfrCohortN: pm.tenancy.house.cohortN,
      sfrPctMedian: pm.tenancy.house.pctOfCohortMedian,
    },
    geographicCoverage: {
      citiesText: pm.geographicCoverage.citiesText,
      coverageMapPoints: pm.geographicCoverage.coverageMapPoints ?? [],
      mapCenter: market.mapCenter,
      mapBounds: market.mapBounds,
      msaBackdropPoints: market.msaBackdropPoints,
    },
    classificationRationale: pm.classificationRationale,
  };
}

async function main() {
  console.log(
    `Seeding from methodology ${data.methodologyVersion}, dataAsOf ${data.dataAsOf}`
  );

  // Idempotent: clear PMs first (FK to Market), then Markets.
  await prisma.pM.deleteMany();
  await prisma.market.deleteMany();

  for (const m of data.markets) {
    await prisma.market.create({
      data: {
        id: m.id,
        msaCode: m.msaCode,
        city: m.city,
        state: m.state,
        fullName: m.fullName,
        operatorCountTotal: m.operatorCountTotal,
        operatorCountEligible: m.operatorCountEligible,
        medianDomT12: m.medianDomT12,
        medianDomLifetime: m.medianDomLifetime,
        quadrantSummary: JSON.stringify(m.quadrantSummary),
      },
    });
    console.log(`  ✓ market: ${m.id} (${m.fullName})`);
  }

  for (const pm of data.pms) {
    const market = data.markets.find((m) => m.id === pm.marketId);
    if (!market) {
      throw new Error(
        `PM ${pm.slug} references unknown market ${pm.marketId}`
      );
    }

    const scorecard = buildScorecard(pm, market);

    await prisma.pM.create({
      data: {
        slug: pm.slug,
        name: pm.name,
        marketId: pm.marketId,
        quadrant: pm.quadrant,
        hybrid: pm.hybrid,
        rankOverall: pm.rank.overall,
        rankOverallTotal: pm.rank.overallTotal,
        rankQuadrant: pm.rank.quadrant,
        rankQuadrantTotal: pm.rank.quadrantTotal,
        claimed: pm.claimed,
        scorecardData: JSON.stringify(scorecard),
        methodologyVersion: data.methodologyVersion,
        dataAsOf: new Date(data.dataAsOf),
      },
    });
    console.log(`  ✓ pm: ${pm.slug} (rank ${pm.rank.overall}/${pm.rank.overallTotal})`);
  }

  const marketCount = await prisma.market.count();
  const pmCount = await prisma.pM.count();
  console.log(`\nSeed complete: ${marketCount} market(s), ${pmCount} PM(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
