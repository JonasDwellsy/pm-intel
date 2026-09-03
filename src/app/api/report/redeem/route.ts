// v0.33 — Spend one report credit on an operator.
//
// PUBLIC (guests own credits too), but ownership is never taken from the
// request body: a guest is identified by a SIGNED magic-link token, a
// workspace user by their session. An unsigned email would let anyone spend
// anyone's credits.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { verifyReportAccessToken } from "@/lib/report/access-token";
import { redeemCredit } from "@/lib/billing/credits.server";
import type { CreditOwner } from "@/lib/billing/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  pmSlug: z.string().min(1),
  token: z.string().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const { organizationId } = await getActiveOrgContext();
  const guestEmail = organizationId ? null : verifyReportAccessToken(body.token);
  if (!organizationId && !guestEmail) {
    return Response.json({ ok: false, reason: "unidentified" }, { status: 401 });
  }

  const pm = await prisma.pM.findUnique({
    where: { slug: body.pmSlug },
    select: { slug: true },
  });
  if (!pm) {
    return Response.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const owner: CreditOwner = { organizationId, guestEmail };
  const res = await redeemCredit(owner, pm.slug);
  return Response.json(res, { status: res.ok ? 200 : 409 });
}
