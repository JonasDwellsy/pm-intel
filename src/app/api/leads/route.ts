import { prisma } from "@/lib/prisma";
import { leadApiSchema } from "@/lib/lead-schema";
import { matchPms } from "@/lib/lead-matching";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = leadApiSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const matches = await matchPms(data);

  const lead = await prisma.lead.create({
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

  // Mock email payloads. Real delivery wires in at deploy time.
  console.log("[EMAIL → owner]", {
    to: lead.ownerEmail,
    subject: "Your Dwellsy IQ property manager matches",
    body: `Hi ${lead.ownerName}, we found ${matches.length} operator${
      matches.length === 1 ? "" : "s"
    } that fit your search:\n${matches
      .map((m, i) => `  ${i + 1}. ${m.name} (${m.quadrant})`)
      .join("\n")}\nView your matches: /watch-lists/new?leadId=${lead.id}`,
  });

  for (const pm of matches) {
    console.log("[EMAIL → PM]", {
      pm: pm.slug,
      to: `${pm.slug}@example.invalid`, // contact email lands in Journey 3 (claim flow)
      subject: "New lead from Dwellsy IQ",
      body: `${lead.ownerName} (${lead.ownerEmail}) is exploring ${
        lead.propertyType
      }${lead.unitCount ? ` · ${lead.unitCount} units` : ""}${
        lead.notes ? `\nNotes: ${lead.notes}` : ""
      }`,
    });
  }

  return Response.json(
    {
      leadId: lead.id,
      matches,
    },
    { status: 201 }
  );
}
