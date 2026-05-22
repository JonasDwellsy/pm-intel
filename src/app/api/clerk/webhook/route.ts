// v0.17 + v0.18 — Clerk webhook receiver.
//
// Bridges Clerk's webhook deliveries into:
//   1. PostHog conversion events (v0.17): signup_completed,
//      login_completed.
//   2. Our DB's Organization + OrganizationMembership mirror tables
//      (v0.18 / PR #65).
//   3. Auto-provisioning of every new user's personal Organization
//      (v0.18). Soft-fallback: if creation fails, we log to Sentry,
//      let the user sign in normally, and the /setup-workspace page
//      retries provisioning in the background.
//
// Event coverage:
//   user.created                     → signup_completed + provision personal org
//   session.created                  → login_completed (with post-signup dedup)
//   organization.created             → upsert Organization row
//   organization.updated             → update Organization row
//   organization.deleted             → log only (no soft-delete in Phase 1)
//   organizationMembership.created   → upsert OrganizationMembership row
//   organizationMembership.updated   → update role
//   organizationMembership.deleted   → delete row
//
// Setup checklist (one-time, after merge):
//   1. Clerk dashboard → Configure → Webhooks → existing endpoint
//   2. Add subscriptions: organization.created, organization.updated,
//      organization.deleted, organizationMembership.created,
//      organizationMembership.updated, organizationMembership.deleted
//   3. (Same signing secret as before — already in
//      CLERK_WEBHOOK_SECRET env var)
//
// Idempotency: every DB write uses Prisma `upsert` keyed on Clerk's
// unique sync id (clerkOrgId / clerkMembershipId). Re-delivery of the
// same Clerk event is a no-op. The signup-time personal-org
// provisioning checks the user's existing memberships before
// creating to make THAT path idempotent too.
//
// Sentry instrumentation: every dispatched handler is wrapped in
// try/catch. Failures fire Sentry.captureException with the event
// id and userId tag so we can correlate webhook drops to user
// reports. Webhook returns 200 even on handler failures (Clerk
// would otherwise retry; for partial successes — e.g.,
// signup_completed fired but personal org creation 500'd — retry
// would double-fire PostHog events).

import { Webhook } from "svix";
import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { captureServerEvent } from "@/lib/analytics-server";
import { prisma } from "@/lib/prisma";
import { provisionPersonalOrgForUser } from "@/lib/auth/provision-personal-org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** v0.17 — session.created within this window of user.createdAt is
 *  treated as the post-signup auto-login (suppresses login_completed
 *  so it doesn't double-fire with signup_completed). */
const SIGNUP_DEDUP_WINDOW_MS = 30_000;

// Inbound Clerk webhook payloads. We only type the fields we read;
// Clerk's schema is well-documented but unstable enough that
// over-typing here would create maintenance burden.
interface ClerkWebhookEvent {
  type: string;
  data: {
    /** user.created.id, organization.id (for org events) */
    id?: string;
    /** session.created.user_id, organizationMembership.public_user_data.user_id */
    user_id?: string;
    /** ms since epoch on session.created.created_at + user.createdAt */
    created_at?: number;
    /** Organization fields */
    name?: string;
    slug?: string;
    /** organization.created.created_by */
    created_by?: string;
    /** organizationMembership fields */
    role?: string;
    organization?: {
      id?: string;
    };
    public_user_data?: {
      user_id?: string;
    };
    /** Marker we set on signup-provisioned personal orgs. */
    private_metadata?: {
      isPersonal?: boolean;
      forUserId?: string;
    };
  };
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk/webhook] CLERK_WEBHOOK_SECRET env var missing");
    return Response.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();
  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("[clerk/webhook] svix verify failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Dispatch wrapped in a Sentry boundary. Per-handler errors get
  // captured + re-swallowed; we always return 200 so Clerk doesn't
  // retry partial-success events.
  try {
    await dispatch(event, svixId);
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        webhook: "clerk",
        event_type: event.type,
        svix_id: svixId,
      },
    });
    console.error(`[clerk/webhook] handler for ${event.type} threw:`, err);
  }

  return Response.json({ received: true });
}

/** Top-level dispatcher. Each branch is wrapped in its own try/catch
 *  via withSentryBoundary() so one handler's failure doesn't prevent
 *  unrelated handlers from running on multi-event deliveries (Clerk
 *  rarely batches but the model is more robust this way). */
async function dispatch(event: ClerkWebhookEvent, svixId: string): Promise<void> {
  switch (event.type) {
    case "user.created":
      await withSentryBoundary("user.created", event, svixId, () =>
        handleUserCreated(event)
      );
      return;
    case "session.created":
      await withSentryBoundary("session.created", event, svixId, () =>
        handleSessionCreated(event)
      );
      return;
    case "organization.created":
      await withSentryBoundary("organization.created", event, svixId, () =>
        handleOrganizationCreated(event)
      );
      return;
    case "organization.updated":
      await withSentryBoundary("organization.updated", event, svixId, () =>
        handleOrganizationUpdated(event)
      );
      return;
    case "organization.deleted":
      await withSentryBoundary("organization.deleted", event, svixId, () =>
        handleOrganizationDeleted(event)
      );
      return;
    case "organizationMembership.created":
      await withSentryBoundary(
        "organizationMembership.created",
        event,
        svixId,
        () => handleMembershipCreated(event)
      );
      return;
    case "organizationMembership.updated":
      await withSentryBoundary(
        "organizationMembership.updated",
        event,
        svixId,
        () => handleMembershipUpdated(event)
      );
      return;
    case "organizationMembership.deleted":
      await withSentryBoundary(
        "organizationMembership.deleted",
        event,
        svixId,
        () => handleMembershipDeleted(event)
      );
      return;
    default:
      // Unhandled event type — 200 OK so Clerk doesn't retry.
      return;
  }
}

/** Wraps a handler in try/catch + Sentry.captureException so one
 *  failure doesn't take down the whole dispatcher. Re-throws so the
 *  outer Sentry boundary can also record + log. */
async function withSentryBoundary(
  eventType: string,
  event: ClerkWebhookEvent,
  svixId: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        webhook: "clerk",
        event_type: eventType,
        svix_id: svixId,
      },
      extra: {
        event_data_id: event.data.id ?? null,
        event_data_user_id: event.data.user_id ?? null,
      },
    });
    // Re-throw so the outer dispatcher's catch also logs it locally.
    throw err;
  }
}

// ─── v0.17 user/session handlers (extended in v0.18 with org provisioning) ───

async function handleUserCreated(event: ClerkWebhookEvent): Promise<void> {
  const userId = event.data.id;
  if (!userId) return;
  // signup_completed event (v0.17).
  captureServerEvent({
    userId,
    event: "signup_completed",
  });
  // v0.18 — provision the user's personal Organization. Soft-
  // fallback: if creation fails (Clerk API hiccup, Hobby plan
  // misconfig, etc.) we log to Sentry and let sign-in proceed. The
  // /setup-workspace page retries on the user's next visit.
  try {
    await provisionPersonalOrgForUser(userId);
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        webhook: "clerk",
        event_type: "user.created",
        provisioning_failure: "personal_org",
      },
      extra: { userId },
    });
    console.error(
      `[clerk/webhook] personal org provisioning failed for ${userId} — soft fallback: user can sign in, /setup-workspace will retry`,
      err
    );
    // Deliberately do NOT re-throw. signup_completed already fired;
    // partial-success is fine here, retry happens from
    // /setup-workspace.
  }
}

async function handleSessionCreated(event: ClerkWebhookEvent): Promise<void> {
  const userId = event.data.user_id;
  const sessionCreatedAt = event.data.created_at;
  if (!userId) return;
  const isPostSignupAutoLogin = await isWithinSignupWindow({
    userId,
    sessionCreatedAt,
  });
  if (isPostSignupAutoLogin) return;
  captureServerEvent({
    userId,
    event: "login_completed",
  });
}

async function isWithinSignupWindow(args: {
  userId: string;
  sessionCreatedAt: number | undefined;
}): Promise<boolean> {
  if (typeof args.sessionCreatedAt !== "number") return false;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(args.userId);
    const delta = Math.abs(args.sessionCreatedAt - user.createdAt);
    return delta < SIGNUP_DEDUP_WINDOW_MS;
  } catch (err) {
    console.error(
      "[clerk/webhook] dedup user-fetch failed, firing login_completed defensively",
      err
    );
    return false;
  }
}

// ─── v0.18 organization handlers ───

async function handleOrganizationCreated(event: ClerkWebhookEvent): Promise<void> {
  const clerkOrgId = event.data.id;
  const name = event.data.name;
  const slug = event.data.slug ?? null;
  if (!clerkOrgId || !name) {
    console.warn(
      "[clerk/webhook] organization.created missing id or name; skipping"
    );
    return;
  }
  // Read the marker we set in provisionPersonalOrgForUser() to know
  // whether this org is personal (and for whom). Non-personal orgs
  // (Phase 2+ team creation) leave personalForUserId null.
  const isPersonal = event.data.private_metadata?.isPersonal === true;
  const forUserId = isPersonal
    ? event.data.private_metadata?.forUserId ?? event.data.created_by ?? null
    : null;
  await prisma.organization.upsert({
    where: { clerkOrgId },
    create: {
      clerkOrgId,
      name,
      slug,
      personalForUserId: forUserId,
    },
    update: {
      name,
      slug,
      // Don't overwrite personalForUserId on update — it's set at
      // creation and immutable.
    },
  });
}

async function handleOrganizationUpdated(event: ClerkWebhookEvent): Promise<void> {
  const clerkOrgId = event.data.id;
  const name = event.data.name;
  const slug = event.data.slug ?? null;
  if (!clerkOrgId) return;
  // Use upsert pattern: if we missed organization.created (rare,
  // but possible during the initial webhook subscription rollout)
  // this catches up the row anyway. Idempotent.
  await prisma.organization.upsert({
    where: { clerkOrgId },
    create: {
      clerkOrgId,
      name: name ?? "Unnamed organization",
      slug,
      personalForUserId: null,
    },
    update: {
      ...(name !== undefined && { name }),
      slug,
    },
  });
}

async function handleOrganizationDeleted(event: ClerkWebhookEvent): Promise<void> {
  // Per architecture decision (Phase 1, decision #3): log + 200,
  // no DB mutation. Personal orgs aren't user-deletable in Clerk's
  // default config; non-personal org deletion is a Phase 2+ concern.
  // Soft-delete via deletedAt ships in Phase 3 alongside the
  // org-management UI.
  console.log(
    `[clerk/webhook] organization.deleted received for ${event.data.id} — no-op in Phase 1 (intentional; see PR #65 architecture decision)`
  );
}

async function handleMembershipCreated(event: ClerkWebhookEvent): Promise<void> {
  const clerkMembershipId = event.data.id;
  const clerkOrgId = event.data.organization?.id;
  const userId = event.data.public_user_data?.user_id ?? event.data.user_id;
  const role = event.data.role;
  if (!clerkMembershipId || !clerkOrgId || !userId || !role) {
    console.warn(
      "[clerk/webhook] organizationMembership.created missing required field; skipping",
      { clerkMembershipId, clerkOrgId, userId, role }
    );
    return;
  }
  // Look up our Organization row by clerkOrgId. There's a small race
  // window where organizationMembership.created could arrive before
  // organization.created (Clerk delivers webhooks in parallel). If
  // we don't find the org, retry by upserting a stub Organization
  // row first — the eventual organization.created delivery will
  // fill in the details via the update branch of its upsert.
  let org = await prisma.organization.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  if (!org) {
    org = await prisma.organization.upsert({
      where: { clerkOrgId },
      create: {
        clerkOrgId,
        // Placeholder name; the eventual organization.created or
        // organization.updated webhook backfills the real name.
        name: "Pending organization",
        slug: null,
        personalForUserId: null,
      },
      update: {},
      select: { id: true },
    });
  }
  await prisma.organizationMembership.upsert({
    where: { clerkMembershipId },
    create: {
      clerkMembershipId,
      organizationId: org.id,
      userId,
      role,
    },
    update: {
      role,
    },
  });
}

async function handleMembershipUpdated(event: ClerkWebhookEvent): Promise<void> {
  const clerkMembershipId = event.data.id;
  const role = event.data.role;
  if (!clerkMembershipId || !role) return;
  await prisma.organizationMembership.updateMany({
    where: { clerkMembershipId },
    data: { role },
  });
}

async function handleMembershipDeleted(event: ClerkWebhookEvent): Promise<void> {
  const clerkMembershipId = event.data.id;
  if (!clerkMembershipId) return;
  await prisma.organizationMembership.deleteMany({
    where: { clerkMembershipId },
  });
}
