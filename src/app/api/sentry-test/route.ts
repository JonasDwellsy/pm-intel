// v0.17 — Smoke-test endpoint for Sentry server-side wiring.
//
// Two-path diagnostic: every GET runs BOTH the SDK capture path AND
// a raw HTTP POST to Sentry's ingest endpoint, bypassing the SDK
// entirely. Comparing the two responses pinpoints where events get
// lost:
//
//   - SDK reports ok + raw POST returns 200 → wiring is fully good;
//     if events still don't appear in the dashboard, the DSN is
//     pointing at a different project than you're viewing
//   - SDK reports ok + raw POST returns 4xx → DSN is malformed or
//     points at a deleted/disabled project; SDK's `flushed: true`
//     is misleading because it only means the queue drained, not
//     that Sentry accepted the event
//   - SDK reports ok + raw POST returns 429 → rate-limited (Sentry
//     free tier caps; the dashboard view shows "your DSN is over
//     quota")
//   - SDK reports init_skipped / no_dsn → see earlier-PR diagnosis
//     paths
//
// Response shape:
//   {
//     diagnosis: "ok" | "no_dsn" | "init_skipped",
//     env: { hasServerDsn, hasPublicDsn, ... },
//     initialized, captured, eventId, flushed,    // SDK path
//     parsedDsn: { host, projectId, hasPublicKey }, // DSN sanity
//     rawProbe: {                                  // bypass-the-SDK probe
//       attempted, url, status, statusText,
//       responseBody, eventId, error
//     },
//     hint: string
//   }
//
// Safe to ship in production: not linked from anywhere, password-
// gate bypass is explicit (see middleware.ts), the throw +
// captureException + raw POST are all by design.

import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Strip the DSN apart into the pieces Sentry's ingest URL needs.
 *  DSN format: https://<public_key>@<host>/<project_id> */
function parseDsn(dsn: string | undefined):
  | { host: string; projectId: string; publicKey: string }
  | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "").replace(/\/$/, "");
    const publicKey = url.username;
    if (!projectId || !publicKey) return null;
    return { host: url.host, projectId, publicKey };
  } catch {
    return null;
  }
}

/** Direct POST to Sentry's store endpoint, no SDK in the loop.
 *  Returns the actual HTTP status and response body so we can see
 *  what Sentry's ingest API thinks of the DSN. */
async function rawIngestProbe(dsn: string | undefined): Promise<{
  attempted: boolean;
  url?: string;
  status?: number;
  statusText?: string;
  responseBody?: string;
  eventId?: string;
  error?: string;
}> {
  const parsed = parseDsn(dsn);
  if (!parsed) {
    return {
      attempted: false,
      error: "Could not parse DSN — check format `https://KEY@HOST/PROJECT_ID`",
    };
  }
  const url = `https://${parsed.host}/api/${parsed.projectId}/store/`;
  // Per Sentry's protocol, the event_id is a 32-char lowercase hex
  // string with no dashes. crypto.randomUUID() gives us the right
  // entropy; strip dashes and lowercase.
  const eventId = crypto.randomUUID().replace(/-/g, "").toLowerCase();
  const payload = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: "error",
    logger: "sentry-test-raw-probe",
    server_name: "vercel-edge",
    message: {
      formatted:
        "Raw HTTP probe from /api/sentry-test — bypasses the @sentry/nextjs SDK.",
    },
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tags: { probe: "raw_http" },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": [
          "Sentry sentry_version=7",
          "sentry_client=pm-intel-raw-probe/1.0",
          `sentry_timestamp=${Date.now() / 1000}`,
          `sentry_key=${parsed.publicKey}`,
        ].join(", "),
      },
      body: JSON.stringify(payload),
    });
    const responseBody = await response.text();
    return {
      attempted: true,
      url,
      status: response.status,
      statusText: response.statusText,
      // Sentry usually returns `{"id":"..."}` on success or a JSON
      // error blob on failure. Capping length so the diagnostic
      // response stays under any proxy size limits.
      responseBody: responseBody.slice(0, 500),
      eventId,
    };
  } catch (err) {
    return {
      attempted: true,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const env = {
    hasServerDsn: Boolean(process.env.SENTRY_DSN),
    hasPublicDsn: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    sentryOrg: process.env.SENTRY_ORG ?? null,
    sentryProject: process.env.SENTRY_PROJECT ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  };

  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  const parsed = parseDsn(dsn);
  const parsedDsn = parsed
    ? {
        host: parsed.host,
        projectId: parsed.projectId,
        hasPublicKey: parsed.publicKey.length > 0,
      }
    : null;

  // Raw probe runs regardless of SDK init state — we want to know
  // whether the DSN itself works even when the SDK path is broken.
  const rawProbe = await rawIngestProbe(dsn);

  const client = Sentry.getClient();
  const initialized = client !== undefined;

  if (!initialized) {
    const noDsn = !env.hasServerDsn && !env.hasPublicDsn;
    return Response.json(
      {
        diagnosis: noDsn ? "no_dsn" : "init_skipped",
        env,
        parsedDsn,
        initialized: false,
        captured: false,
        flushed: false,
        rawProbe,
        hint: noDsn
          ? "Neither SENTRY_DSN nor NEXT_PUBLIC_SENTRY_DSN is set in this deploy's env."
          : "A DSN env var is visible but Sentry.init() didn't run. Check src/instrumentation.ts.",
      },
      { status: 200 }
    );
  }

  // Sentry IS initialized — throw and capture for real.
  let eventId: string | undefined;
  let captured = false;
  try {
    throw new Error(
      "Sentry smoke test — if you see this in Sentry Issues, the wiring is good."
    );
  } catch (err) {
    eventId = Sentry.captureException(err);
    captured = Boolean(eventId);
  }

  const flushed = await Sentry.flush(2000);

  // Build a hint based on what the raw probe revealed about the
  // DSN, since the SDK path is now uninformative once `flushed:
  // true` becomes the steady state.
  let hint: string;
  if (rawProbe.status && rawProbe.status >= 200 && rawProbe.status < 300) {
    hint = `Both paths reached Sentry successfully. SDK eventId=${eventId}, raw-probe eventId=${rawProbe.eventId}. If neither appears in your Sentry dashboard, the DSN's projectId (${parsedDsn?.projectId ?? "unknown"}) points at a DIFFERENT project than the one you're viewing in the Sentry UI — check the URL of your Sentry tab vs. that projectId.`;
  } else if (rawProbe.status && rawProbe.status >= 400) {
    hint = `Raw HTTP probe to Sentry returned ${rawProbe.status} ${rawProbe.statusText}. The DSN itself is bad, deleted, or rate-limited at the Sentry side — the SDK's flushed:true is misleading because it only means the SDK's send queue drained. Response body: ${rawProbe.responseBody}`;
  } else if (rawProbe.error) {
    hint = `Raw probe to Sentry failed before getting a response: ${rawProbe.error}. Network issue between Vercel and Sentry, or the host parsed from the DSN (${parsedDsn?.host ?? "unknown"}) is wrong.`;
  } else {
    hint = `SDK eventId=${eventId}, raw-probe status=${rawProbe.status ?? "unknown"}. Inspect both paths.`;
  }

  return Response.json(
    {
      diagnosis: "ok",
      env,
      parsedDsn,
      initialized: true,
      captured,
      eventId,
      flushed,
      rawProbe,
      hint,
    },
    { status: 200 }
  );
}
