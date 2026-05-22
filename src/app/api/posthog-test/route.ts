// v0.17 — Smoke-test endpoint for PostHog server-side wiring.
//
// Mirrors /api/sentry-test in shape + intent. Two diagnostic paths
// per call:
//
//   1. SDK path (posthog-node): construct a PostHog client, fire
//      a test event, await client.shutdown() to force a flush.
//   2. Raw HTTP path: POST a minimal capture payload directly to
//      PostHog's /capture/ endpoint, return the actual status
//      code + body.
//
// Why two paths? Same lesson as Sentry — once the SDK reports
// success, you can't tell from the SDK alone whether PostHog
// accepted the event or silently rejected it. The raw probe shows
// the real HTTP response.
//
// Response shape:
//   {
//     diagnosis: "ok" | "no_key" | "client_init_failed",
//     env: {
//       hasPublicKey, hasPublicHost,
//       hasClerkWebhookSecret, hasClerkSecretKey,
//       nodeEnv, vercelEnv
//     },
//     sdkProbe: { attempted, eventDistinctId, shutdownOk, error },
//     rawProbe: { attempted, url, status, statusText, responseBody, error },
//     clerkWebhookConfigured: boolean,   // env var is set
//     hint: string
//   }
//
// Safe to ship in production: not linked from anywhere, password-
// gate bypass is explicit, all writes are tagged probe events that
// can be filtered out in PostHog.

import { PostHog } from "posthog-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

/** Direct POST to PostHog's /capture/ endpoint, no SDK in the loop.
 *  Returns the actual HTTP status and response body so we can see
 *  what PostHog's ingest API thinks of the key. */
async function rawCaptureProbe(): Promise<{
  attempted: boolean;
  url?: string;
  status?: number;
  statusText?: string;
  responseBody?: string;
  error?: string;
}> {
  if (!KEY) {
    return {
      attempted: false,
      error: "NEXT_PUBLIC_POSTHOG_KEY not set — nothing to probe",
    };
  }
  const url = `${HOST.replace(/\/$/, "")}/capture/`;
  const payload = {
    api_key: KEY,
    event: "diagnostic_raw_probe",
    distinct_id: "posthog-raw-probe-server",
    properties: {
      probe: "raw_http",
      // Tag so this event is easy to filter out in PostHog later.
      source: "api/posthog-test",
      environment:
        process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    },
    timestamp: new Date().toISOString(),
  };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseBody = await response.text();
    return {
      attempted: true,
      url,
      status: response.status,
      statusText: response.statusText,
      // PostHog typically returns `{"status":1}` on success.
      responseBody: responseBody.slice(0, 500),
    };
  } catch (err) {
    return {
      attempted: true,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** posthog-node SDK path. Fire one event, await shutdown to force
 *  a flush, report whether shutdown completed without throwing. */
async function sdkProbe(): Promise<{
  attempted: boolean;
  eventDistinctId?: string;
  shutdownOk?: boolean;
  error?: string;
}> {
  if (!KEY) {
    return {
      attempted: false,
      error: "NEXT_PUBLIC_POSTHOG_KEY not set — SDK cannot init",
    };
  }
  const distinctId = "posthog-sdk-probe-server";
  try {
    const client = new PostHog(KEY, { host: HOST });
    client.capture({
      distinctId,
      event: "diagnostic_sdk_probe",
      properties: {
        probe: "sdk",
        source: "api/posthog-test",
        environment:
          process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      },
    });
    // shutdown() forces a flush and waits for it. Without this the
    // Vercel lambda may freeze before the queued event hits the
    // wire.
    await client.shutdown();
    return { attempted: true, eventDistinctId: distinctId, shutdownOk: true };
  } catch (err) {
    return {
      attempted: true,
      eventDistinctId: distinctId,
      shutdownOk: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const env = {
    hasPublicKey: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
    hasPublicHost: Boolean(process.env.NEXT_PUBLIC_POSTHOG_HOST),
    // Surfaced so we can tell whether the Clerk webhook path is
    // even possible. Without these, signup_completed +
    // login_completed never fire regardless of PostHog state.
    hasClerkWebhookSecret: Boolean(process.env.CLERK_WEBHOOK_SECRET),
    hasClerkSecretKey: Boolean(process.env.CLERK_SECRET_KEY),
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  };

  // Both probes run in parallel for speed. They're independent —
  // we want both signals even when one fails.
  const [sdk, raw] = await Promise.all([sdkProbe(), rawCaptureProbe()]);

  let diagnosis: string;
  let hint: string;

  if (!env.hasPublicKey) {
    diagnosis = "no_key";
    hint =
      "NEXT_PUBLIC_POSTHOG_KEY is not set in this deploy's env. Add it in Vercel → Project Settings → Environment Variables (Production + Preview) using the project API key from PostHog → Project Settings → Project API key, then redeploy. Client-side capture() calls are no-ops until this is set.";
  } else if (raw.status && raw.status >= 200 && raw.status < 300) {
    diagnosis = "ok";
    if (!env.hasClerkWebhookSecret) {
      hint =
        "PostHog accepted the test event (HTTP 200). Client-side page-view events should reach PostHog within ~30s of mount. However, CLERK_WEBHOOK_SECRET is NOT set — signup_completed and login_completed never fire because the Clerk webhook isn't wired. To fix: (1) Clerk dashboard → Configure → Webhooks → Add endpoint → URL: https://<your-deploy>/api/clerk/webhook → subscribe to user.created + session.created → copy the signing secret. (2) Paste the secret into Vercel as CLERK_WEBHOOK_SECRET (Production + Preview). (3) Redeploy.";
    } else {
      hint =
        "PostHog accepted the test event (HTTP 200) AND Clerk webhook secret is set. If signup_completed / login_completed still don't appear, verify the webhook endpoint is configured in the Clerk dashboard (Configure → Webhooks) and that it's subscribed to user.created + session.created. Test the webhook from the Clerk dashboard's 'Testing' tab — it'll show the response from your /api/clerk/webhook route. Also check that an ad blocker isn't blocking the client-side PostHog requests in your browser.";
    }
  } else if (raw.status && raw.status >= 400) {
    diagnosis = "key_rejected";
    hint = `PostHog's /capture/ endpoint returned ${raw.status} ${raw.statusText}. The NEXT_PUBLIC_POSTHOG_KEY value is wrong, doesn't belong to a real project, or the project was deleted. Verify the key matches what's in PostHog → Project Settings → Project API key. Response body: ${raw.responseBody}`;
  } else if (raw.error) {
    diagnosis = "network_error";
    hint = `Network failure reaching PostHog: ${raw.error}. Check that NEXT_PUBLIC_POSTHOG_HOST (${HOST}) is correct — it should usually be https://us.i.posthog.com or https://eu.i.posthog.com depending on your PostHog Cloud region.`;
  } else {
    diagnosis = "unknown";
    hint = `Unexpected diagnostic state. SDK shutdown=${sdk.shutdownOk}, raw status=${raw.status ?? "(none)"}. Inspect the full response for details.`;
  }

  return Response.json(
    {
      diagnosis,
      env,
      sdkProbe: sdk,
      rawProbe: raw,
      clerkWebhookConfigured: env.hasClerkWebhookSecret,
      hint,
    },
    { status: 200 }
  );
}
