export type LoginQuery = Record<string, string | string[] | undefined>;

// Explicit destinations only. This route authenticates identity; the destination
// product still performs its own membership, approval and subscription checks.
const origins = new Set([
  "https://concessions.iq.dwellsy.com",
  "https://dwellsy-iq-concessions.vercel.app",
  "https://evidence.iq.dwellsy.com",
  "https://portfolio.iq.dwellsy.com",
]);

export function iqLoginReturn(query: LoginQuery): string | null {
  const values = [query.sign_in_force_redirect_url, query.sign_up_force_redirect_url, query.redirect_url];
  const value = values.find((item) => item !== undefined);
  if (typeof value !== "string" || /[\\\s]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!origins.has(url.origin) || url.username || url.password || url.hash) return null;
    // Older satellite helpers use the initiating auth page as redirect_url.
    // Never send a signed-in user through that page again.
    if (/^\/sign-(in|up)(\/|$)/.test(url.pathname)) url.pathname = "/app";
    url.searchParams.set("__clerk_synced", "false");
    return url.href;
  } catch {
    return null;
  }
}

export function iqLoginLink(mode: "sign-in" | "sign-up", destination: string) {
  return `/iq/${mode}?${new URLSearchParams({ redirect_url: destination })}`;
}
