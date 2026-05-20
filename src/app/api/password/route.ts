import { cookies } from "next/headers";

// POST /api/password — validates the submitted access code against the
// AUTH_PASSWORD env var and, on match, sets the `dq_auth` cookie with the
// SHA-256 digest as its value (the same value middleware.ts recomputes
// on every request). 30-day cookie lifetime; rotating AUTH_PASSWORD on
// the server invalidates every existing cookie because the expected
// digest changes.

const AUTH_COOKIE = "dq_auth";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req: Request) {
  const password = process.env.AUTH_PASSWORD;
  if (!password) {
    console.error("[api/password] AUTH_PASSWORD env var missing");
    // Generic error body — don't leak the configuration state to clients.
    return Response.json(
      { error: "Access gate is misconfigured." },
      { status: 500 }
    );
  }

  let body: { password?: unknown };
  try {
    body = (await req.json()) as { password?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const submitted = typeof body.password === "string" ? body.password : "";
  if (!submitted) {
    return Response.json({ error: "Password required." }, { status: 400 });
  }

  // Constant-time comparison against AUTH_PASSWORD. We compare strings
  // directly here (rather than hashing both sides first) because we
  // already have the plaintext; safeEqual prevents early-exit timing leaks.
  if (!safeEqual(submitted, password)) {
    return Response.json({ error: "Incorrect access code." }, { status: 401 });
  }

  // Match middleware.ts: cookie value is the SHA-256 hex digest of
  // AUTH_PASSWORD. Anyone who can compute this digest already knows the
  // password, so storing it client-side is no weaker than storing a
  // session id keyed to the same secret.
  const digest = await sha256Hex(password);

  const cookieStore = await cookies();
  cookieStore.set({
    name: AUTH_COOKIE,
    value: digest,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return Response.json({ ok: true }, { status: 200 });
}
