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
import { extractEmailDomain } from "@/lib/auth/email-domain";

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
    /** organizationInvitation.* events carry the invitee's email
     *  address. We extract DOMAIN ONLY for analytics — full email
     *  never reaches PostHog. See extractEmailDomain. */
    email_address?: string;
    /** organizationInvitation.* — id of the org the invitation is for. */
    organization_id?: string;
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
    // v0.18 (PR #71, Phase 3) — Invitation lifecycle. These three
    // events fire when an admin sends/revokes an invitation and
    // when an invitee accepts. Membership creation is a separate
    // event (organizationMembership.created) that follows the
    // accepted invitation; the accepted-invitation handler also
    // writes the PendingWelcome row that drives the welcome toast.
    case "organizationInvitation.created":
      await withSentryBoundary(
        "organizationInvitation.created",
        event,
        svixId,
        () => handleInvitationCreated(event)
      );
      return;
    case "organizationInvitation.accepted":
      await withSentryBoundary(
        "organizationInvitation.accepted",
        event,
        svixId,
        () => handleInvitationAccepted(event)
      );
      return;
    case "organizationInvitation.revoked":
      await withSentryBoundary(
        "organizationInvitation.revoked",
        event,
        svixId,
        () => handleInvitationRevoked(event)
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
  // v0.18 PR #71 (Phase 3) — Check whether this membership row
  // already existed BEFORE the upsert so the analytics path below
  // can distinguish "genuinely-new membership" from "Clerk re-
  // delivered the same event". The upsert is still idempotent on
  // the DB side via clerkMembershipId; we just don't want to double-
  // fire org_member_joined.
  const existed = await prisma.organizationMembership.findUnique({
    where: { clerkMembershipId },
    select: { id: true },
  });

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

  // v0.18 PR #71 — Membership analytics. Fire org_member_joined only
  // on first delivery (not on re-delivery) AND only when this is
  // NOT the user's auto-provisioned personal org (which already
  // fires signup_completed from user.created — double-counting an
  // org_member_joined for the personal org would inflate the
  // invitation-funnel numbers). Personal orgs have
  // personalForUserId === userId.
  if (!existed) {
    const orgRow = await prisma.organization.findUnique({
      where: { id: org.id },
      select: { personalForUserId: true },
    });
    const isPersonalOrg = orgRow?.personalForUserId === userId;
    if (!isPersonalOrg) {
      captureServerEvent({
        userId,
        event: "org_member_joined",
        properties: {
          org_id: org.id,
          // Membership.created on its own can't distinguish
          // "joined via invitation" from "added by an admin via API"
          // (which is rare in v1). The cleaner invitation signal
          // is the parallel organizationInvitation.accepted event,
          // which fires alongside this one when join_method=invitation.
          // We mark this event source-agnostic; PostHog funnel can
          // join on user_id to disambiguate.
          join_method: "membership_created",
        },
      });
    }
  }
}

async function handleMembershipUpdated(event: ClerkWebhookEvent): Promise<void> {
  const clerkMembershipId = event.data.id;
  const newRole = event.data.role;
  if (!clerkMembershipId || !newRole) return;

  // v0.18 PR #71 — Read existing role BEFORE the update so we can
  // detect actual role changes and fire org_role_changed only when
  // the role really shifted (skip no-op updates from Clerk).
  const existing = await prisma.organizationMembership.findUnique({
    where: { clerkMembershipId },
    select: { id: true, role: true, organizationId: true, userId: true },
  });

  await prisma.organizationMembership.updateMany({
    where: { clerkMembershipId },
    data: { role: newRole },
  });

  if (existing && existing.role !== newRole) {
    captureServerEvent({
      userId: existing.userId,
      event: "org_role_changed",
      properties: {
        org_id: existing.organizationId,
        user_id: existing.userId,
        old_role: existing.role,
        new_role: newRole,
      },
    });
  }
}

async function handleMembershipDeleted(event: ClerkWebhookEvent): Promise<void> {
  const clerkMembershipId = event.data.id;
  if (!clerkMembershipId) return;

  // v0.18 PR #71 — Read the row BEFORE deleting so we have org +
  // user context for the analytics event. If the row doesn't exist
  // (Clerk re-delivery after we already processed delete), the
  // event simply doesn't fire — idempotent.
  const existing = await prisma.organizationMembership.findUnique({
    where: { clerkMembershipId },
    select: { organizationId: true, userId: true },
  });

  await prisma.organizationMembership.deleteMany({
    where: { clerkMembershipId },
  });

  if (existing) {
    captureServerEvent({
      userId: existing.userId,
      event: "org_member_removed",
      properties: {
        org_id: existing.organizationId,
        removed_user_id: existing.userId,
      },
    });
  }
}

// ─── v0.18 PR #71 (Phase 3) — Invitation lifecycle handlers ───

/** organizationInvitation.created — admin sent an invite. Fires
 *  org_member_invited with the invitee's email DOMAIN ONLY (never
 *  the full email — see PRIVACY.md). */
async function handleInvitationCreated(event: ClerkWebhookEvent): Promise<void> {
  const clerkOrgId = event.data.organization_id;
  const email = event.data.email_address;
  // The admin who sent the invite isn't always in the payload;
  // we attribute the event to the org rather than a specific user.
  // distinctId falls back to a synthetic per-org bucket so PostHog
  // doesn't strip the event for "no distinctId".
  if (!clerkOrgId || !email) {
    console.warn(
      "[clerk/webhook] organizationInvitation.created missing required field; skipping"
    );
    return;
  }
  const orgRow = await prisma.organization.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  if (!orgRow) {
    // Org not in our DB yet (race). The invitation event still
    // fires for analytics, but we tag with clerkOrgId so it can
    // be reconciled later.
    captureServerEvent({
      userId: null,
      anonymousId: `org-${clerkOrgId}`,
      event: "org_member_invited",
      properties: {
        org_id: clerkOrgId, // clerk-side id as fallback
        invited_email_domain: extractEmailDomain(email),
      },
    });
    return;
  }
  captureServerEvent({
    userId: null,
    anonymousId: `org-${orgRow.id}`,
    event: "org_member_invited",
    properties: {
      org_id: orgRow.id,
      invited_email_domain: extractEmailDomain(email),
    },
  });
}

/** organizationInvitation.accepted — invitee accepted. Fires
 *  org_member_joined AND writes the PendingWelcome row that drives
 *  the welcome toast on the user's next /watch-lists visit.
 *
 *  Note: organizationMembership.created fires alongside this event
 *  (Clerk delivers both). The membership handler also fires
 *  org_member_joined but tagged with join_method: "membership_created";
 *  this handler fires with join_method: "invitation" — PostHog can
 *  disambiguate. Both events on the same userId are intentional
 *  (funnel attribution); deduplication happens dashboard-side via
 *  the join_method property. */
async function handleInvitationAccepted(event: ClerkWebhookEvent): Promise<void> {
  const clerkOrgId = event.data.organization_id;
  const userId = event.data.user_id;
  const email = event.data.email_address;
  if (!clerkOrgId || !userId) {
    console.warn(
      "[clerk/webhook] organizationInvitation.accepted missing required field; skipping"
    );
    return;
  }
  const orgRow = await prisma.organization.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  if (!orgRow) {
    console.warn(
      `[clerk/webhook] organizationInvitation.accepted for unknown org ${clerkOrgId}; org row not mirrored yet`
    );
    // Still fire the analytics event with the clerk-side id so we
    // don't lose the funnel signal.
    captureServerEvent({
      userId,
      event: "org_member_joined",
      properties: {
        org_id: clerkOrgId,
        member_user_id: userId,
        join_method: "invitation",
        invited_email_domain: extractEmailDomain(email),
      },
    });
    return;
  }
  captureServerEvent({
    userId,
    event: "org_member_joined",
    properties: {
      org_id: orgRow.id,
      member_user_id: userId,
      join_method: "invitation",
      invited_email_domain: extractEmailDomain(email),
    },
  });
  // Write PendingWelcome row. Upsert so re-delivery is a no-op.
  // /watch-lists deletes this row on the user's next visit and
  // shows the welcome toast.
  try {
    await prisma.pendingWelcome.upsert({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgRow.id,
        },
      },
      create: {
        userId,
        organizationId: orgRow.id,
      },
      update: {}, // no-op — keep the original createdAt
    });
  } catch (err) {
    // Welcome is a nice-to-have; don't fail the whole handler if
    // the upsert errors. Sentry captures the failure for diagnosis.
    Sentry.captureException(err, {
      tags: {
        webhook: "clerk",
        event_type: "organizationInvitation.accepted",
        provisioning_failure: "pending_welcome",
      },
      extra: { userId, organizationId: orgRow.id },
    });
    console.error(
      `[clerk/webhook] PendingWelcome upsert failed for ${userId}/${orgRow.id}; welcome toast will not fire`,
      err
    );
  }
}

/** organizationInvitation.revoked — admin cancelled a pending
 *  invite. Closes the invitation-funnel loop in PostHog (so we can
 *  attribute the gap between "invited" and "joined" to either
 *  expired, declined, or revoked). */
async function handleInvitationRevoked(event: ClerkWebhookEvent): Promise<void> {
  const clerkOrgId = event.data.organization_id;
  const email = event.data.email_address;
  if (!clerkOrgId) return;
  const orgRow = await prisma.organization.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  const orgIdForEvent = orgRow?.id ?? clerkOrgId;
  captureServerEvent({
    userId: null,
    anonymousId: `org-${orgIdForEvent}`,
    event: "org_invitation_revoked",
    properties: {
      org_id: orgIdForEvent,
      invited_email_domain: extractEmailDomain(email),
    },
  });
}
