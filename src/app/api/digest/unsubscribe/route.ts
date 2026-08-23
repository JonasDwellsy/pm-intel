// Signed unsubscribe endpoint for the watch-list digest. GET is deliberately
// read-only because corporate email scanners prefetch links. POST performs the
// opt-out for both the confirmation form and RFC 8058 one-click requests.
import { prisma } from "@/lib/prisma";
import { verifyUnsubToken } from "@/lib/watch-list/digest-unsubscribe";

export const dynamic = "force-dynamic";

interface UnsubscribeDependencies {
  verify: (userId: string, token: string) => boolean;
  unsubscribe: (userId: string) => Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

function page(title: string, body: string, formAction?: string, status = 200): Response {
  const form = formAction
    ? `<form method="post" action="${escapeHtml(formAction)}"><button type="submit" style="border:0;border-radius:6px;background:#0f1f3f;color:white;padding:10px 16px;font-weight:600;cursor:pointer;">Unsubscribe</button></form>`
    : "";
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:64px auto;padding:0 20px;color:#2a3547;">
       <h1 style="font-size:20px;color:#0f1f3f;">${title}</h1><p style="font-size:14px;">${body}</p>${form}</div>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export function createDigestUnsubscribeHandlers(deps: UnsubscribeDependencies) {
  function signedRequest(req: Request) {
    const url = new URL(req.url);
    const userId = url.searchParams.get("u") ?? "";
    const token = url.searchParams.get("t") ?? "";
    return { url, userId, valid: Boolean(userId && deps.verify(userId, token)) };
  }

  return {
    async GET(req: Request) {
      const { url, valid } = signedRequest(req);
      if (!valid) {
        return page("Link invalid", "This unsubscribe link is invalid or has expired. Please use the link from your most recent digest email.", undefined, 400);
      }
      return page(
        "Confirm unsubscribe",
        "Stop receiving the Operator IQ watch-list monthly digest? You can re-enable it anytime from your workspace settings.",
        `${url.pathname}${url.search}`,
      );
    },
    async POST(req: Request) {
      const { userId, valid } = signedRequest(req);
      if (!valid) {
        return page("Link invalid", "This unsubscribe link is invalid or has expired. Please use the link from your most recent digest email.", undefined, 400);
      }
      await deps.unsubscribe(userId);
      return page("You're unsubscribed", "You will no longer receive the Operator IQ watch-list monthly digest. You can re-enable it anytime from your workspace settings.");
    },
  };
}

const handlers = createDigestUnsubscribeHandlers({
  verify: verifyUnsubToken,
  unsubscribe: async (userId) => {
    await prisma.digestPreference.upsert({
      where: { userId },
      update: { unsubscribed: true },
      create: { userId, unsubscribed: true },
    });
  },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
