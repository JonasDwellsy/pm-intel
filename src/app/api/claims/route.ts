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

  const claim = await prisma.claim.create({
    data: {
      pmSlug: data.pmSlug,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
    },
  });

  console.log("[EMAIL → claim review]", {
    to: "review@dwellsy.invalid",
    subject: `Claim request for ${pm.name}`,
    body: `${data.contactName} <${data.contactEmail}> is claiming ${pm.name} (${pm.slug}). Claim id ${claim.id}, status pending.`,
  });

  return Response.json(
    {
      claimId: claim.id,
      status: claim.status,
    },
    { status: 201 }
  );
}
