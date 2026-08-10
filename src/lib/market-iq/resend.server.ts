import "server-only";

export async function sendMarketIqEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured for this preview.");
  const from = process.env.MARKET_IQ_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("MARKET_IQ_FROM_EMAIL is not configured for this preview.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.message || `Resend rejected the message (${response.status}).`);
  }
  return { id: payload.id };
}
