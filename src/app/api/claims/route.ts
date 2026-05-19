import { prisma } from "@/lib/prisma";
import { claimSchema } from "@/lib/lead-schema";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const data = parsed.data;

  const pm = await prisma.pM.findUnique({ where: { slug: data.pmSlug } });
  if (!pm) {
    return Response.json({ error: "PM not found" }, { status: 404 });
  }

  // v0.6.3 quick-wins — persist the existing 2-field shape (no Claim
  // schema migration in this PR) but log the full intent payload so the
  // optional contactRole + message captured by the scorecard ClaimModal
  // aren't lost. TODO v0.7: wire to email delivery (Resend, SendGrid,
  // etc.) — for now logs only. A follow-up migration can add columns +
  // backfill from the log stream if claim review needs them queryable.
  const claim = await prisma.claim.create({
    data: {
      pmSlug: data.pmSlug,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
    },
  });

  console.log("[claim_request]", {
    operatorSlug: data.pmSlug,
    operatorName: pm.name,
    marketId: pm.marketId,
    claimerName: data.contactName,
    claimerEmail: data.contactEmail,
    claimerRole: data.contactRole ?? null,
    message: data.message ?? null,
    claimId: claim.id,
    status: claim.status,
    timestamp: new Date().toISOString(),
  });

  return Response.json(
    {
      claimId: claim.id,
      status: claim.status,
    },
    { status: 201 }
  );
}
