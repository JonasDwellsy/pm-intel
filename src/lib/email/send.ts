// Thin provider boundary — the ONLY file that imports the Resend SDK.
// Swapping providers touches only this file.
import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}
export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM_EMAIL;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };
  if (!from) return { ok: false, error: "DIGEST_FROM_EMAIL not set" };
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true, id: data?.id ?? "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
