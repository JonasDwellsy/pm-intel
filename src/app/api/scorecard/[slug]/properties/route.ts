// Property-detail rollup xlsx export route.
//
// GET /api/scorecard/[slug]/properties
//   → 200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
//     (one-sheet workbook: one row per property/submarket rollup + repeated
//     MSA-comp columns — see src/lib/scorecard/property-export.ts)
//   → 404 if the PM slug doesn't exist, the market isn't in the caller's
//     entitlement (404 not 403 — mirrors the PDF route so we never confirm
//     existence of an operator in an unpurchased market), or the operator has
//     no `propertyDetail` to export (nothing to download)
//   → 500 on build failure
//
// Auth + entitlement gating mirrors
// src/app/api/scorecard/[slug]/pdf/route.tsx EXACTLY — same prisma lookup,
// same resolveViewerEntitlement()/isMarketEntitled() check, same 404-not-403
// semantics. This is the ONLY gate a client-side property export can go
// through; the button doesn't duplicate any of this logic.

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import {
  resolveViewerEntitlement,
  isMarketEntitled,
} from "@/lib/auth/market-entitlements.server";
import { parseScorecard } from "@/lib/scorecard/parse";
import { buildPropertyWorkbook } from "@/lib/scorecard/property-export";

// nodejs runtime — Prisma + the xlsx package both need Node.
export const runtime = "nodejs";
// Dynamic — don't try to statically pre-generate at build time.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const pm = await prisma.pM.findUnique({ where: { slug } });
    if (!pm) {
      return new Response("Operator not found", { status: 404 });
    }

    // Entitlement gate — identical to the PDF route. 404 (not 403) so we
    // don't confirm the operator exists in a market the caller's org hasn't
    // purchased.
    const entitlement = await resolveViewerEntitlement();
    if (!isMarketEntitled(entitlement, pm.marketId)) {
      return new Response("Operator not found", { status: 404 });
    }

    const scorecard = parseScorecard(pm);

    // Nothing to export for operators with no property-level detail (older
    // seed generations, or operators the pipeline's property_detail pass
    // produced zero records for). 404 rather than an empty-but-valid
    // workbook — there's no file to download.
    if (!scorecard.propertyDetail || scorecard.propertyDetail.properties.length === 0) {
      return new Response("No property detail available", { status: 404 });
    }

    const { workbook, filename } = buildPropertyWorkbook(scorecard);
    const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[scorecard-properties] export error", err, { slug });
    return new Response("Failed to build property export", { status: 500 });
  }
}
