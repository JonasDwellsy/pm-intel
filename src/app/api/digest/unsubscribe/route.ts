// GET /api/digest/unsubscribe?u=<userId>&t=<hmac> — one-click unsubscribe.
// Stateless: verifies the HMAC token (no token storage), upserts
// DigestPreference.unsubscribed = true, renders a plain confirmation page.
import { prisma } from "@/lib/prisma";
import { verifyUnsubToken } from "@/lib/watch-list/digest-unsubscribe";

export const dynamic = "force-dynamic";

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:64px auto;padding:0 20px;color:#2a3547;">
       <h1 style="font-size:20px;color:#0f1f3f;">${title}</h1><p style="font-size:14px;">${body}</p></div>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!userId || !verifyUnsubToken(userId, token)) {
    return page("Link invalid", "This unsubscribe link is invalid or has expired. Please use the link from your most recent digest email.");
  }
  await prisma.digestPreference.upsert({
    where: { userId },
    update: { unsubscribed: true },
    create: { userId, unsubscribed: true },
  });
  return page("You're unsubscribed", "You will no longer receive the Operator IQ watch-list monthly digest. You can re-enable it anytime from your workspace settings.");
}
