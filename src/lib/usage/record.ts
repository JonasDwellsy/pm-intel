// v0.24 — First-party usage-analytics writer.
//
// recordUsageEvent inserts one UsageEvent row FIRE-AND-FORGET: it never
// throws into or blocks its caller, and adds no latency to the request
// that instruments it. The prisma create is a floating promise whose
// .catch() swallows + logs any failure — a telemetry write must never
// degrade the page/route it observes. Use this from server-rendered
// pages, whose render keeps the lambda alive long enough for the write
// to land.
//
// recordUsageEventAwait is the REQUIRED variant for replay-safe webhook
// deliveries. It rejects when persistence fails so the webhook can return
// a retryable response instead of silently dropping the event.
//
// This is an ADDITIVE parallel sink alongside PostHog's captureServerEvent
// (see src/lib/analytics-server.ts) — call sites keep their existing
// PostHog calls untouched and add one non-blocking recordUsageEvent line.
//
// PRIVACY: pass Clerk IDs ONLY (userId / orgId). Never pass names or
// emails — those are resolved at read time in /admin/usage. Callers must
// only record for AUTHENTICATED viewers (userId is required); anonymous
// activity is out of scope for usage analytics.

import "server-only";
import { prisma } from "@/lib/prisma";

export interface RecordUsageEventArgs {
  /** Clerk userId of the authenticated viewer. Required — callers gate
   *  on a resolved session before recording. */
  userId: string;
  /** Clerk org id (auth().orgId). Null when the session carries no
   *  active org. */
  orgId?: string | null;
  /** e.g. "login", "scorecard_view", "ask_query". */
  eventName: string;
  /** e.g. "operator", "market", "brief", "watch_list". */
  targetKind?: string | null;
  /** e.g. a pm slug or market id. */
  targetSlug?: string | null;
  /** Stable primary key for replay-safe external deliveries such as webhooks. */
  eventId?: string;
}

/** Shared insert. Page instrumentation stays best-effort, while required
 *  webhook writes surface failures to the delivery handler. */
async function insert(
  args: RecordUsageEventArgs,
  required: boolean
): Promise<void> {
  try {
    const data = {
      userId: args.userId,
      orgId: args.orgId ?? null,
      eventName: args.eventName,
      targetKind: args.targetKind ?? null,
      targetSlug: args.targetSlug ?? null,
    };
    if (args.eventId) {
      await prisma.usageEvent.upsert({
        where: { id: args.eventId },
        create: { id: args.eventId, ...data },
        update: {},
      });
    } else {
      await prisma.usageEvent.create({ data });
    }
  } catch (err) {
    console.error("[usage] recordUsageEvent failed", err);
    if (required) throw err;
  }
}

/** Fire-and-forget insert. Synchronous return (void); the write is a
 *  floating promise the caller does NOT await, so it never blocks or
 *  throws into the response path. Use from server-rendered pages. */
export function recordUsageEvent(args: RecordUsageEventArgs): void {
  void insert(args, false);
}

/** Required insert. Rejects on failure so replay-capable callers can return
 *  a non-success response and let the delivery retry safely. */
export function recordUsageEventAwait(args: RecordUsageEventArgs): Promise<void> {
  return insert(args, true);
}
