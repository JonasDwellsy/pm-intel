import { join } from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { MarketIqReportCell, MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

const FONT = "MarketIqInter";

try {
  const directory = join(process.cwd(), "public", "fonts");
  Font.register({
    family: FONT,
    fonts: [
      { src: join(directory, "inter-400.woff"), fontWeight: 400 },
      { src: join(directory, "inter-600.woff"), fontWeight: 600 },
      { src: join(directory, "inter-700.woff"), fontWeight: 700 },
    ],
  });
} catch (error) {
  console.error("[market-iq-report-pdf] font registration failed", error);
}

Font.registerHyphenationCallback((word) => [word]);

const colors = {
  ink: "#172033",
  body: "#445066",
  muted: "#687386",
  line: "#DCE1E8",
  soft: "#F4F5F3",
  white: "#FFFFFF",
};

const styles = StyleSheet.create({
  page: { backgroundColor: colors.white, color: colors.ink, fontFamily: FONT, fontSize: 9, lineHeight: 1.45, paddingTop: 42, paddingRight: 44, paddingBottom: 50, paddingLeft: 44 },
  between: { display: "flex", flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 15, fontWeight: 700 },
  overline: { fontSize: 7, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" },
  date: { color: colors.muted, fontSize: 8, textAlign: "right" },
  rule: { borderBottomColor: colors.line, borderBottomWidth: 1, marginTop: 14 },
  hero: { marginTop: 30, maxWidth: 455 },
  title: { fontSize: 28, fontWeight: 700, lineHeight: 1.1, marginTop: 8 },
  narrative: { color: colors.body, fontSize: 11, lineHeight: 1.55, marginTop: 14 },
  scope: { borderRadius: 7, marginTop: 22, padding: 15 },
  scopeValue: { color: colors.white, fontSize: 18, fontWeight: 700, marginTop: 4 },
  scopeText: { color: "#DDE7EA", fontSize: 8, marginTop: 4 },
  section: { marginTop: 28 },
  sectionTitle: { fontSize: 17, fontWeight: 700, marginTop: 5 },
  sectionIntro: { color: colors.body, fontSize: 9, marginTop: 6, maxWidth: 470 },
  cards: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 14 },
  card: { borderColor: colors.line, borderRadius: 6, borderWidth: 1, minHeight: 104, padding: 12, width: "31.8%" },
  cardMuted: { backgroundColor: colors.soft },
  cardValue: { fontSize: 18, fontWeight: 700, marginTop: 11 },
  cardPosition: { fontSize: 8, fontWeight: 700, marginTop: 3 },
  cardMeta: { borderTopColor: colors.line, borderTopWidth: 1, color: colors.muted, fontSize: 7, marginTop: 10, paddingTop: 7 },
  table: { borderColor: colors.line, borderRadius: 6, borderWidth: 1, marginTop: 14 },
  tableHeader: { backgroundColor: colors.soft, display: "flex", flexDirection: "row", paddingHorizontal: 8, paddingVertical: 7 },
  tableRow: { borderTopColor: colors.line, borderTopWidth: 1, display: "flex", flexDirection: "row", paddingHorizontal: 8, paddingVertical: 8 },
  colSubmarket: { width: "23%" },
  colSegment: { width: "22%" },
  colMoney: { width: "17%" },
  colPosition: { width: "21%" },
  tableLabel: { color: colors.muted, fontSize: 6.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" },
  context: { borderRadius: 7, marginTop: 15, padding: 16 },
  contextTitle: { color: colors.white, fontSize: 17, fontWeight: 700, marginTop: 7 },
  contextText: { color: "#DFE7EC", fontSize: 9, lineHeight: 1.55, marginTop: 9 },
  metricRow: { display: "flex", flexDirection: "row", gap: 9, marginTop: 12 },
  metric: { backgroundColor: colors.soft, borderRadius: 6, padding: 11, width: "24%" },
  metricValue: { fontSize: 14, fontWeight: 700, marginTop: 5 },
  source: { borderTopColor: colors.line, borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  sourceName: { fontSize: 8, fontWeight: 700 },
  sourceText: { color: colors.muted, fontSize: 7.5, marginTop: 3 },
  disclosure: { backgroundColor: colors.soft, borderRadius: 6, color: colors.body, fontSize: 8, lineHeight: 1.5, marginTop: 18, padding: 12 },
  footerLeft: { bottom: 20, color: colors.muted, fontSize: 6.5, left: 44, position: "absolute" },
  footerRight: { bottom: 20, color: colors.muted, fontSize: 6.5, position: "absolute", right: 44, textAlign: "right", width: 210 },
});

function safeColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function money(value: number | null) {
  return value === null ? "Not published" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function position(value: number | null) {
  if (value === null) return "Not published";
  if (Math.abs(value) < 0.05) return "In line with market";
  return `${Math.abs(value).toFixed(1)}% ${value > 0 ? "above" : "below"} market`;
}

function reportDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function SegmentCard({ cell, primary, accent }: { cell: MarketIqReportCell; primary: string; accent: string }) {
  const suppressed = cell.status === "suppressed";
  return <View style={suppressed ? [styles.card, styles.cardMuted] : styles.card} wrap={false}>
    <Text style={[styles.overline, { color: colors.muted }]}>{cell.label}</Text>
    <Text style={[styles.cardValue, { color: primary }]}>{money(cell.portfolio.medianAskingRent)}</Text>
    <Text style={[styles.cardPosition, { color: suppressed ? colors.muted : accent }]}>{suppressed ? "Sample below publication threshold" : position(cell.positionPct)}</Text>
    <Text style={styles.cardMeta}>{cell.portfolio.observations} portfolio | {cell.market.observations} market observations</Text>
  </View>;
}

function Footer({ brand, pageNumber }: { brand: string; pageNumber: number }) {
  return <>
    <Text style={styles.footerLeft} fixed>Prepared by {brand}</Text>
    <Text style={styles.footerRight} fixed>Market data by Dwellsy IQ  |  {pageNumber} of 3</Text>
  </>;
}

export function MarketIqReportPDF({ report }: { report: MarketIqReportSnapshot }) {
  const primary = safeColor(report.brand.primaryColor, "#173B57");
  const accent = safeColor(report.brand.accentColor, "#B96D3A");
  const reportableSubmarkets = report.portfolioPosition.submarkets.filter((cell) => cell.status === "reportable");
  const historical = report.marketConditions.historical;

  return <Document title={`${report.brand.displayName} | ${report.scope.marketName} market report`} author={report.brand.displayName}>
    <Page size="LETTER" style={styles.page}>
      <View style={styles.between}>
        <View><Text style={[styles.brand, { color: primary }]}>{report.brand.displayName}</Text><Text style={[styles.overline, { color: accent, marginTop: 4 }]}>Market advisory</Text></View>
        <View><Text style={styles.date}>{report.scope.periodStart} to {report.scope.periodEnd}</Text><Text style={[styles.date, { marginTop: 3 }]}>Prepared {reportDate(report.generatedAt)}</Text></View>
      </View>
      <View style={styles.rule} />
      <View style={styles.hero}>
        <Text style={[styles.overline, { color: accent }]}>{report.scope.marketName}</Text>
        <Text style={[styles.title, { color: primary }]}>{"Your portfolio's position in the asking market"}</Text>
        <Text style={styles.narrative}>{report.portfolioPosition.narrative}</Text>
      </View>
      <View style={[styles.scope, { backgroundColor: primary }]} wrap={false}>
        <Text style={[styles.overline, { color: "#C7D6DD" }]}>Portfolio scope</Text>
        <Text style={styles.scopeValue}>{report.scope.propertyCount} communities | {report.scope.observedUnits} observed advertised units</Text>
        <Text style={styles.scopeText}>{report.scope.submarkets.length} Cleveland submarkets | {report.scope.observedListings} listing observations in the portfolio sample</Text>
      </View>
      <View style={styles.section}>
        <Text style={[styles.overline, { color: accent }]}>Portfolio position</Text>
        <Text style={[styles.sectionTitle, { color: primary }]}>Advertised rents by bedroom segment</Text>
        <Text style={styles.sectionIntro}>Portfolio medians are compared with external apartment listings observed in the ZIP codes where the portfolio operates.</Text>
        <View style={styles.cards}>{report.portfolioPosition.portfolioWide.map((cell) => <SegmentCard key={cell.key} cell={cell} primary={primary} accent={accent} />)}</View>
      </View>
      <Footer brand={report.brand.displayName} pageNumber={1} />
    </Page>

    <Page size="LETTER" style={styles.page}>
      <Text style={[styles.overline, { color: accent }]}>{report.scope.marketName}</Text>
      <Text style={[styles.title, { color: primary, fontSize: 24 }]}>Positioning by submarket</Text>
      <Text style={styles.narrative}>{"These comparisons show where the portfolio's advertised position differs across the Cleveland submarkets it serves. Only statistically supported cells are published."}</Text>
      {reportableSubmarkets.length > 0 ? <View style={styles.section}>
        <Text style={[styles.overline, { color: accent }]}>Submarket detail</Text><Text style={[styles.sectionTitle, { color: primary }]}>Where positioning differs</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}><Text style={[styles.colSubmarket, styles.tableLabel]}>Submarket</Text><Text style={[styles.colSegment, styles.tableLabel]}>Segment</Text><Text style={[styles.colMoney, styles.tableLabel]}>Portfolio</Text><Text style={[styles.colMoney, styles.tableLabel]}>Market</Text><Text style={[styles.colPosition, styles.tableLabel]}>Position</Text></View>
          {reportableSubmarkets.map((cell) => <View key={cell.key} style={styles.tableRow} wrap={false}><Text style={[styles.colSubmarket, { fontWeight: 600, color: primary }]}>{cell.geographyLabel}</Text><Text style={styles.colSegment}>{cell.label}</Text><Text style={[styles.colMoney, { fontWeight: 600 }]}>{money(cell.portfolio.medianAskingRent)}</Text><Text style={styles.colMoney}>{money(cell.market.medianAskingRent)}</Text><Text style={[styles.colPosition, { color: accent, fontWeight: 600 }]}>{position(cell.positionPct)}</Text></View>)}
        </View>
      </View> : <Text style={styles.disclosure}>{"No submarket cell met the report's minimum sample requirements for publication."}</Text>}
      <View style={[styles.disclosure, { marginTop: 28 }]}>
        <Text style={{ fontWeight: 700, color: primary }}>Sample discipline</Text>
        <Text style={{ marginTop: 5 }}>{report.methodNote}</Text>
      </View>
      <Footer brand={report.brand.displayName} pageNumber={2} />
    </Page>

    <Page size="LETTER" style={styles.page}>
      <Text style={[styles.overline, { color: accent }]}>{report.scope.marketName}</Text>
      <Text style={[styles.title, { color: primary, fontSize: 24 }]}>Market conditions supporting your position</Text>
      <View style={[styles.context, { backgroundColor: primary }]}><Text style={[styles.overline, { color: "#C7D6DD" }]}>Market context</Text><Text style={styles.contextTitle}>{report.marketConditions.heading}</Text><Text style={styles.contextText}>{report.marketConditions.narrative}</Text></View>
      {historical && <View style={styles.section}>
        <Text style={[styles.overline, { color: accent }]}>At the export cutoff</Text>
        <View style={styles.metricRow}>
          <View style={styles.metric}><Text style={styles.tableLabel}>Active listings</Text><Text style={[styles.metricValue, { color: primary }]}>{historical.activeAtCutoff.toLocaleString("en-US")}</Text></View>
          <View style={styles.metric}><Text style={styles.tableLabel}>New, 30 days</Text><Text style={[styles.metricValue, { color: primary }]}>{historical.newListings30d.toLocaleString("en-US")}</Text></View>
          <View style={styles.metric}><Text style={styles.tableLabel}>Median DOM</Text><Text style={[styles.metricValue, { color: primary }]}>{Math.round(historical.medianDom)} days</Text></View>
          <View style={styles.metric}><Text style={styles.tableLabel}>Median rent / sf</Text><Text style={[styles.metricValue, { color: primary }]}>${historical.medianRentPerSqFt.toFixed(2)}</Text></View>
        </View>
      </View>}
      {report.marketConditions.trendSegments.length > 0 && <View style={styles.section}>
        <Text style={[styles.overline, { color: accent }]}>Asking-rent trends</Text>
        <View style={styles.cards}>{report.marketConditions.trendSegments.map((segment) => <View key={segment.label} style={styles.card} wrap={false}><Text style={[styles.overline, { color: colors.muted }]}>{segment.label}</Text><Text style={[styles.cardValue, { color: primary }]}>{money(segment.rent)}</Text><Text style={[styles.cardPosition, { color: accent }]}>{segment.yoy >= 0 ? "+" : ""}{segment.yoy.toFixed(1)}% year over year</Text><Text style={styles.cardMeta}>{segment.observations} observations</Text></View>)}</View>
      </View>}
      <View style={styles.section}>
        <Text style={[styles.overline, { color: accent }]}>Sources and methodology</Text><Text style={[styles.sectionTitle, { color: primary }]}>How to read this report</Text>
        {report.sources.map((source) => <View key={`${source.name}:${source.availableThrough}`} style={styles.source} wrap={false}><Text style={styles.sourceName}>{source.name}</Text><Text style={styles.sourceText}>Available through {source.availableThrough}{source.observationCount ? ` | ${source.observationCount.toLocaleString("en-US")} source records` : ""}</Text><Text style={styles.sourceText}>{source.note}</Text></View>)}
        <Text style={[styles.sourceText, { marginTop: 14 }]}>{report.methodNote}</Text>
        <Text style={styles.disclosure}>{report.disclosure}</Text>
        <Text style={[styles.sourceName, { color: primary, marginTop: 18 }]}>Prepared by {report.brand.displayName}</Text>
        {(report.brand.contactName || report.brand.contactEmail || report.brand.contactPhone) && <Text style={styles.sourceText}>{[report.brand.contactName, report.brand.contactEmail, report.brand.contactPhone].filter(Boolean).join(" | ")}</Text>}
        {report.brand.websiteUrl && <Text style={styles.sourceText}>{report.brand.websiteUrl}</Text>}
      </View>
      <Footer brand={report.brand.displayName} pageNumber={3} />
    </Page>
  </Document>;
}
