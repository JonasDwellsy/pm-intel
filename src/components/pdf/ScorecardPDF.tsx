/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ScorecardData } from "@/lib/types";

const colors = {
  ink: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  card: "#f8fafc",
  positive: "#15803d",
  negative: "#b91c1c",
  watermark: "rgba(15, 23, 42, 0.06)",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingHorizontal: 48,
    paddingBottom: 64,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: colors.ink,
    lineHeight: 1.4,
  },
  watermark: {
    position: "absolute",
    top: "45%",
    left: "10%",
    right: "10%",
    color: colors.watermark,
    fontSize: 36,
    transform: "rotate(-22deg)",
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
  },
  pageNumber: {
    position: "absolute",
    bottom: 28,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 9,
    color: colors.muted,
  },
  footerStrip: {
    position: "absolute",
    bottom: 44,
    left: 48,
    right: 48,
    fontSize: 8,
    color: colors.muted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerEyebrow: {
    fontSize: 8,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  h1: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 6,
  },
  pillRow: { flexDirection: "row", gap: 6, marginBottom: 14 },
  pill: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    fontSize: 8,
    backgroundColor: colors.card,
    borderRadius: 9,
    color: colors.ink,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: 6,
    marginBottom: 14,
  },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  kpi: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    padding: 8,
  },
  kpiLabel: {
    fontSize: 7,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  kpiValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  kpiSub: { fontSize: 8, color: colors.muted, marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 6,
  },
  cardBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  table: { width: "100%", marginTop: 4 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: colors.card,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    fontSize: 9,
  },
  tableCellLabel: { flex: 3 },
  tableCellNum: { flex: 1, textAlign: "right" },
  paragraph: { fontSize: 9, lineHeight: 1.5, color: colors.ink },
  twoCol: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
});

function fmtDays(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(1)} d`;
}
function fmtInt(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US");
}
function fmtPct(n: number | null, digits = 1, signed = false): string {
  if (n === null || n === undefined) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function PdfPerfRow({
  label,
  pm,
  peer,
  market,
  n,
}: {
  label: string;
  pm: number | null;
  peer: number | null;
  market: number | null;
  n?: number | null;
}) {
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableCellLabel}>{label}</Text>
      <Text style={styles.tableCellNum}>{fmtDays(pm)}</Text>
      <Text style={styles.tableCellNum}>{fmtDays(peer)}</Text>
      <Text style={styles.tableCellNum}>{fmtDays(market)}</Text>
      <Text style={[styles.tableCellNum, { color: colors.muted }]}>
        {n !== undefined ? fmtInt(n ?? null) : ""}
      </Text>
    </View>
  );
}

export function ScorecardPDF({
  scorecard,
  watermark,
}: {
  scorecard: ScorecardData;
  watermark: string;
}) {
  const {
    pm,
    market,
    rank,
    coverage,
    performance,
    marketing,
    tenancy,
    rentPerformance,
    communityVisibility,
    classificationRationale,
    rentTrajectory,
    methodologyVersion,
    dataAsOf,
  } = scorecard;

  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        <Text fixed style={styles.watermark}>
          {watermark}
        </Text>

        <Text style={styles.headerEyebrow}>
          Dwellsy IQ · Methodology {methodologyVersion} · Data as of {dataAsOf}
        </Text>
        <Text style={styles.h1}>{pm.name}</Text>
        <Text style={styles.subtitle}>{market.fullName}</Text>
        <View style={styles.pillRow}>
          <Text style={styles.pill}>{pm.quadrant}</Text>
          {pm.hybrid && <Text style={styles.pill}>Hybrid</Text>}
          <Text style={styles.pill}>{coverage.dataTier}</Text>
        </View>
        <View style={styles.divider} />

        {/* Headline KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Overall rank</Text>
            <Text style={styles.kpiValue}>
              #{rank.overall} / {rank.overallTotal}
            </Text>
            <Text style={styles.kpiSub}>MSA-wide ({market.name})</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Quadrant rank</Text>
            <Text style={styles.kpiValue}>
              {rank.quadrant
                ? `#${rank.quadrant} / ${rank.quadrantTotal}`
                : `— / ${rank.quadrantTotal}`}
            </Text>
            <Text style={styles.kpiSub}>{pm.quadrant}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>DOM T12</Text>
            <Text style={styles.kpiValue}>{fmtDays(performance.domT12)}</Text>
            <Text style={styles.kpiSub}>
              Market {fmtDays(performance.marketDomT12)}
            </Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Observed units</Text>
            <Text style={styles.kpiValue}>
              {fmtInt(coverage.totalObservedUnits)}
            </Text>
            <Text style={styles.kpiSub}>
              {coverage.citiesObserved} cities ·{" "}
              {fmtInt(coverage.t12Listings)} listings T12
            </Text>
          </View>
        </View>

        {/* Coverage */}
        <Text style={styles.sectionTitle}>Coverage</Text>
        <View style={styles.cardBlock}>
          <View style={styles.twoCol}>
            <View style={styles.half}>
              <Text>
                First listing: {coverage.firstListing} · {coverage.monthsOnPlatform} months on platform
              </Text>
              <Text>
                Lifetime: {fmtInt(coverage.lifetimeListings)} listings ·{" "}
                {fmtInt(coverage.urusLifetime)} URUs
              </Text>
              <Text>
                T12: {fmtInt(coverage.t12Listings)} listings · {fmtInt(coverage.urusT12)} URUs
              </Text>
              <Text>Active: {fmtInt(coverage.activeListings)}</Text>
            </View>
            <View style={styles.half}>
              <Text>
                Observed managed units · this MSA: {fmtInt(coverage.totalObservedUnits)}
              </Text>
              {coverage.nationalObservedUnitsT12 !== null && (
                <Text>
                  Observed units · all Dwellsy IQ markets (T12): {fmtInt(coverage.nationalObservedUnitsT12)}
                </Text>
              )}
              <Text>
                Cities observed: {coverage.citiesObserved}
              </Text>
              {coverage.concentratedShare !== null && (
                <Text>
                  Share in concentrated communities: {Math.round(coverage.concentratedShare * 100)}%
                </Text>
              )}
              <Text>Quadrant: {pm.quadrant}</Text>
            </View>
          </View>
        </View>

        {/* Performance */}
        <Text style={styles.sectionTitle}>Performance</Text>
        <View style={styles.cardBlock}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.tableCellLabel}>Metric</Text>
            <Text style={styles.tableCellNum}>This PM</Text>
            <Text style={styles.tableCellNum}>Peer quad.</Text>
            <Text style={styles.tableCellNum}>Market</Text>
            <Text style={styles.tableCellNum}>N</Text>
          </View>
          <PdfPerfRow
            label="DOM T12 (all)"
            pm={performance.domT12}
            peer={performance.peerQuadrantDomT12}
            market={performance.marketDomT12}
            n={performance.domT12N}
          />
          <PdfPerfRow
            label="DOM lifetime"
            pm={performance.domLifetime}
            peer={performance.peerQuadrantDomLifetime}
            market={performance.marketDomLifetime}
          />
          <PdfPerfRow
            label={`DOM T12 — houses${performance.houseEligible ? "" : " (insufficient N)"}`}
            pm={performance.houseDomT12}
            peer={null}
            market={performance.marketDomT12}
            n={performance.houseUrusT12}
          />
          <PdfPerfRow
            label={`DOM T12 — apartments${performance.aptEligible ? "" : " (insufficient N)"}`}
            pm={performance.aptDomT12}
            peer={null}
            market={performance.marketDomT12}
            n={performance.aptUrusT12}
          />
        </View>

        {/* Rent trajectory */}
        <Text style={styles.sectionTitle}>Rent trajectory (mix-adjusted median by quarter)</Text>
        <View style={styles.cardBlock}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.tableCellLabel}>Quarter</Text>
            <Text style={styles.tableCellNum}>Median</Text>
            <Text style={styles.tableCellNum}>N</Text>
          </View>
          {rentTrajectory.map((r) => (
            <View key={r.quarter} style={styles.tableRow}>
              <Text style={styles.tableCellLabel}>{r.quarter}</Text>
              <Text style={styles.tableCellNum}>
                ${Math.round(r.mixAdjMedian).toLocaleString("en-US")}
              </Text>
              <Text style={[styles.tableCellNum, { color: colors.muted }]}>
                {fmtInt(r.n)}
              </Text>
            </View>
          ))}
        </View>

        {/* Rent performance + marketing quality */}
        <View style={styles.twoCol}>
          <View style={[styles.half, styles.cardBlock]}>
            <Text style={styles.sectionTitle}>Rent performance</Text>
            {rentPerformance ? (
              <>
                <Text>
                  PM YoY rent change: {fmtPct(rentPerformance.pmYoyChange * 100, 2, true)}
                </Text>
                <Text>
                  MSA cohort median YoY: {fmtPct((rentPerformance.cohortMedianYoyChange ?? 0) * 100, 2, true)}
                </Text>
                <Text>
                  Delta: {fmtPct(rentPerformance.delta * 100, 2, true)}
                </Text>
                <Text>
                  Cohort percentile: {rentPerformance.percentileRank.toFixed(1)}
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.muted }}>Not computed.</Text>
            )}
          </View>
          <View style={[styles.half, styles.cardBlock]}>
            <Text style={styles.sectionTitle}>Marketing quality</Text>
            <Text>
              Completeness: {marketing.completeness.toFixed(1)} fields (score {marketing.completenessScore.toFixed(0)})
            </Text>
            <Text>
              Amenities mentioned: {marketing.amenitiesMentioned.toFixed(1)} (score {marketing.amenitiesScore.toFixed(0)})
            </Text>
            <Text>
              Description length: {fmtInt(marketing.descLen)} chars (score {marketing.descScore.toFixed(0)})
            </Text>
            <Text>
              Composite: {marketing.compositeScore.toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Community visibility (when applicable) + tenancy */}
        <View style={styles.twoCol}>
          <View style={[styles.half, styles.cardBlock]}>
            <Text style={styles.sectionTitle}>Community visibility</Text>
            {communityVisibility ? (
              <>
                <Text>
                  Ratio: {communityVisibility.ratio.toFixed(2)}× · {communityVisibility.stateLabel}
                </Text>
                <Text>
                  Communities: {communityVisibility.perCommunity.length} · turnover assumption {Math.round(communityVisibility.expectedTurnoverRate * 100)}%
                </Text>
                <Text>
                  MSA percentile: {communityVisibility.percentileRank.toFixed(1)}
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.muted }}>
                Suppressed (operator outside Section 4 scope gate).
              </Text>
            )}
          </View>
          <View style={[styles.half, styles.cardBlock]}>
            <Text style={styles.sectionTitle}>Tenancy retention</Text>
            <Text>
              Total units: {fmtInt(tenancy.totalUnits)} · multi-episode {fmtInt(tenancy.multiEpisodeUnits)} ({tenancy.multiEpisodePct}%)
            </Text>
            {tenancy.apartment.gap !== null && (
              <Text>
                Apartments: {tenancy.apartment.gap.toFixed(1)} mo (cohort p25–p75 {tenancy.apartment.cohortP25?.toFixed(1)}–{tenancy.apartment.cohortP75?.toFixed(1)})
              </Text>
            )}
            {tenancy.house.gap !== null && (
              <Text>
                Houses: {tenancy.house.gap.toFixed(1)} mo (cohort p25–p75 {tenancy.house.cohortP25?.toFixed(1)}–{tenancy.house.cohortP75?.toFixed(1)})
              </Text>
            )}
          </View>
        </View>

        {/* Why this quadrant */}
        <Text style={styles.sectionTitle}>Why this quadrant</Text>
        <View style={styles.cardBlock}>
          <Text style={styles.paragraph}>{classificationRationale}</Text>
        </View>

        {/* Footer strip */}
        <View fixed style={styles.footerStrip}>
          <Text>iq.dwellsy.com</Text>
          <Text>Methodology {methodologyVersion} · Data as of {dataAsOf}</Text>
        </View>
        <Text
          fixed
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }: any) =>
            `${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
