// v0.30 — Stateless guest magic-link tokens for the single-report funnel.
//
// A guest who buys a report has no Clerk account, so their durable access link
// carries a signed token instead of a session. The token asserts one thing: a
// verified email. Entitlement itself still comes from the DB
// (resolveReportAccess checks admin, then the B2B market entitlement, then a
// per-PM ReportEntitlement by guestEmail — bought outright or redeemed from a
// pack credit) — the
// token only proves the visitor owns that email, so it can't be used to read a
// report the email didn't pay for. HMAC-SHA256, same stateless pattern as the
// digest unsubscribe links (DIGEST_UNSUB_SECRET).
//
// nodejs runtime only (node:crypto).

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_DAYS = 400; // covers the $99/1yr era with headroom

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

/** Mint a magic-link token asserting `email`. Returns null if
 *  REPORT_ACCESS_SECRET is unset (caller should fall back to a login link). */
export function signReportAccessToken(
  email: string,
  ttlDays = DEFAULT_TTL_DAYS
): string | null {
  const secret = process.env.REPORT_ACCESS_SECRET;
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
  const payload = JSON.stringify({ e: email.trim().toLowerCase(), exp });
  const payloadB64 = b64url(payload);
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Verify a token and return the asserted (lowercased) email, or null if the
 *  token is missing, malformed, tampered, or expired. */
export function verifyReportAccessToken(
  token: string | null | undefined
): string | null {
  if (!token) return null;
  const secret = process.env.REPORT_ACCESS_SECRET;
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { e, exp } = JSON.parse(fromB64url(payloadB64).toString("utf8"));
    if (typeof e !== "string" || typeof exp !== "number") return null;
    if (Math.floor(Date.now() / 1000) > exp) return null;
    return e;
  } catch {
    return null;
  }
}
