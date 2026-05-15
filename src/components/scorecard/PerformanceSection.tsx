import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDays, fmtInt } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";
import { PerformanceRankChart } from "./PerformanceRankChart";

export function PerformanceSection({ scorecard }: { scorecard: ScorecardData }) {
  const p = scorecard.performance;
  return (
    <section id="performance" className="scroll-mt-20 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">This PM</TableHead>
                <TableHead className="text-right">Peer quadrant</TableHead>
                <TableHead className="text-right">Market</TableHead>
                <TableHead className="text-right">N</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">DOM T12 (all)</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(p.domT12)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(p.peerQuadrantDomT12)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(p.marketDomT12)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmtInt(p.domT12N)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">DOM lifetime</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(p.domLifetime)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(p.peerQuadrantDomLifetime)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(p.marketDomLifetime)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  DOM T12 — houses
                  {!p.houseEligible && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (insufficient N)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(p.houseDomT12)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  —
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(p.marketHouseDomT12)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmtInt(p.houseUrusT12)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  DOM T12 — apartments
                  {!p.aptEligible && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (insufficient N)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(p.aptDomT12)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  —
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(p.marketAptDomT12)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmtInt(p.aptUrusT12)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <PerformanceRankChart scorecard={scorecard} />
        </CardContent>
      </Card>
    </section>
  );
}
