// Thin provider boundary — the ONLY file that imports an email SDK.
// Swapping providers touches only this file. Provider: SendGrid
// (@sendgrid/mail) — Dwellsy's transactional email runs through SendGrid.
//
// FOLLOW-UP (deferred, YAGNI at current tiny recipient counts): the digest
// sends one email per recipient in a serial loop with no backoff. Once the
// audience grows past a handful, add rate-limit / batch handling here
// (SendGrid's `personalizations` array lets one API call fan out to many
// recipients) before the loop starts recording 429s as failed sends.
import sgMail from "@sendgrid/mail";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  customArgs?: Record<string, string>;
}
export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.DIGEST_FROM_EMAIL;
  if (!apiKey) return { ok: false, error: "SENDGRID_API_KEY not set" };
  if (!from) return { ok: false, error: "DIGEST_FROM_EMAIL not set" };
  try {
    sgMail.setApiKey(apiKey);
    const [response] = await sgMail.send({
      to: msg.to,
      from, // must be a SendGrid-verified sender / authenticated domain
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      customArgs: msg.customArgs,
    });
    // SendGrid returns 202 Accepted with the message id in the
    // x-message-id response header on success.
    const headers = response?.headers as
      | Record<string, string | string[] | undefined>
      | undefined;
    const rawId = headers?.["x-message-id"];
    const id = Array.isArray(rawId) ? rawId[0] ?? "" : rawId ?? "";
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: extractSendGridError(err) };
  }
}

/** SendGrid throws on failure; the actionable detail lives in
 *  err.response.body.errors[].message (e.g. "The from address does not
 *  match a verified Sender Identity", or an invalid API key). Surface that
 *  when present; otherwise fall back to the plain error message. */
function extractSendGridError(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const body = (
      err as { response?: { body?: { errors?: { message?: string }[] } } }
    ).response?.body;
    const messages = body?.errors
      ?.map((e) => e.message)
      .filter((m): m is string => Boolean(m));
    if (messages && messages.length > 0) return messages.join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}
