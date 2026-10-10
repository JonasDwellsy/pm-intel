export const CONCESSIONS_ACTIVATION_ORIGIN = "https://concessions.iq.dwellsy.com";
export const CONCESSIONS_CONSENT_VERSION = "concessions-invitation-v1";
export function concessionsActivationToken(destination: string | null) {
  if (!destination) return null;
  try {
    const url = new URL(destination);
    const token = url.searchParams.get("token");
    if (url.origin !== CONCESSIONS_ACTIVATION_ORIGIN || url.pathname !== "/invitations/activate" || url.username || url.password || url.hash
      || url.searchParams.getAll("token").length !== 1 || !token || !/^[a-f0-9]{64}$/.test(token)
      || [...url.searchParams.keys()].some(k => k !== "token" && k !== "__clerk_synced")) return null;
    return token;
  } catch { return null; }
}
export function concessionsBridgeEnabled(env: Record<string,string|undefined> = process.env) {
  return env.CONCESSIONS_ACTIVATION_BRIDGE_ENABLED === "1" && env.NODE_ENV === "production" && env.VERCEL_ENV === "production"
    && Boolean(env.CONCESSIONS_ACTIVATION_BRIDGE_SECRET && env.CONCESSIONS_ACTIVATION_BRIDGE_SECRET.length >= 32);
}
