// Stateless unsubscribe tokens: HMAC-SHA256(userId, DIGEST_UNSUB_SECRET),
// hex-encoded. No token storage — the /api/digest/unsubscribe route verifies
// the HMAC and flips DigestPreference.unsubscribed. Constant-time compare.
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.DIGEST_UNSUB_SECRET;
  if (!s) throw new Error("DIGEST_UNSUB_SECRET is not set");
  return s;
}

export function signUnsubToken(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("hex");
}

export function verifyUnsubToken(userId: string, token: string): boolean {
  if (!token) return false;
  let expected: string;
  try {
    expected = signUnsubToken(userId);
  } catch {
    return false;
  }
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  if (a.length !== b.length || b.length === 0) return false;
  return timingSafeEqual(a, b);
}
