import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtNumber, fmtInt } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

function delta(pm: number, peer: number) {
  const diff = pm - peer;
  if (diff === 0 || peer === 0) return null;
  const pct = (diff / peer) * 100;
  const sign = pct > 0 ? "+" : "";
  const tone = pct >= 0 ? "text-emerald-700" : "text-rose-700";
  return (
    <span className={`ml-2 text-xs font-medium tabular-nums ${tone}`}>
      {sign}
      {pct.toFixed(0)}% vs peer
    </span>
  );
}

export function ListingQualitySection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const m = scorecard.marketing;
  return (
    <section id="listing-quality" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Listing quality</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            How this PM's listings stack up vs the median operator in the same
            quadrant.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">This PM</TableHead>
                <TableHead className="text-right">Peer median</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  Completeness score (0–5)
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNumber(m.completeness, 2)}
                  {delta(m.completeness, m.peerCompleteness)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNumber(m.peerCompleteness, 2)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Amenities mentioned (avg)
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNumber(m.amenitiesMentioned, 1)}
                  {delta(m.amenitiesMentioned, m.peerAmenities)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNumber(m.peerAmenities, 1)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Description length (chars)
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtInt(m.descLen)}
                  {delta(m.descLen, m.peerDescLen)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtInt(m.peerDescLen)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
