// Stateless unsubscribe tokens for the market-brief digest. HMAC-SHA256 over
// `brief:<userId>` with DIGEST_UNSUB_SECRET — namespaced with the "brief:"
// prefix so a brief token can't be replayed against the watch-list digest's
// unsubscribe (and vice-versa), even though both share the secret.
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.DIGEST_UNSUB_SECRET;
  if (!s) throw new Error("DIGEST_UNSUB_SECRET is not set");
  return s;
}

export function signBriefUnsubToken(userId: string): string {
  return createHmac("sha256", secret()).update(`brief:${userId}`).digest("hex");
}

export function verifyBriefUnsubToken(userId: string, token: string): boolean {
  try {
    const expected = Buffer.from(signBriefUnsubToken(userId), "hex");
    const got = Buffer.from(token, "hex");
    return expected.length === got.length && timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}
