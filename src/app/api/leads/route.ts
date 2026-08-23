import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/lib/prisma";
import { leadApiSchema } from "@/lib/lead-schema";
import { isLeadBotTrapFilled, readLeadJsonBody } from "@/lib/lead-intake";
import { matchPms } from "@/lib/lead-matching";

function reportLeadFailure(operation: "matching" | "persistence", err: unknown) {
  Sentry.captureMessage("Lead intake failed", {
    level: "error",
    tags: {
      route: "api/leads",
      operation,
      error_name: err instanceof Error ? err.name : "unknown",
    },
  });
}

export async function POST(req: Request) {
  const body = await readLeadJsonBody(req);
  if (!body.ok) {
    return Response.json({ error: body.error }, { status: body.status });
  }

  const parsed = leadApiSchema.safeParse(body.value);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const data = parsed.data;
  if (isLeadBotTrapFilled(data.companyWebsite)) {
    return Response.json(
      { leadId: "received", matches: [] },
      { status: 201 }
    );
  }

  let matches: Awaited<ReturnType<typeof matchPms>>;
  try {
    matches = await matchPms(data);
  } catch (err) {
    reportLeadFailure("matching", err);
    return Response.json(
      { error: "Submission could not be completed" },
      { status: 500 }
    );
  }

  let lead: { id: string };
  try {
    lead = await prisma.lead.create({
      data: {
        marketId: data.marketId ?? null,
        propertyType: data.propertyType,
        unitCount: data.unitCount ?? null,
        preferredQuadrant: data.preferredQuadrant ?? null,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail,
        ownerPhone: data.ownerPhone ?? null,
        notes: data.notes ?? null,
        matchedPms: JSON.stringify(matches.map((m) => m.slug)),
        source: data.source ?? null,
      },
    });
  } catch (err) {
    reportLeadFailure("persistence", err);
    return Response.json(
      { error: "Submission could not be completed" },
      { status: 500 }
    );
  }

  return Response.json(
    {
      leadId: lead.id,
      matches,
    },
    { status: 201 }
  );
}
