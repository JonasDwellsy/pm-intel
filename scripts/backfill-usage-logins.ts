// One-off backfill: seed the UsageEvent table with historical login +
// signup events from Clerk, so /admin/usage isn't empty for users who
// logged in before the usage-analytics deploy.
//
// WHAT CLERK GIVES US: the backend API exposes, per user, `lastSignInAt`
// (their MOST RECENT sign-in) and `createdAt` (account creation) — NOT a
// full historical sign-in log. So this writes at most ONE "login" row per
// user (at lastSignInAt) and ONE "signup" row (at createdAt). It is a
// starting snapshot, not a complete history; forward capture (the Clerk
// webhook) records every login from the deploy onward.
//
// IDEMPOTENT + no double-count: for each event type we skip any user who
// ALREADY has a row of that type (from forward capture or a prior run).
// So re-running is safe, and a user who has logged in since the deploy
// (already has a "login" row) is left alone rather than duplicated.
//
// Usage (loads secrets from the dotenv file; nothing is printed):
//   npx tsx scripts/backfill-usage-logins.ts --env-file=.env.local --dry-run
//   npx tsx scripts/backfill-usage-logins.ts --env-file=.env.local
//
// Mirrors scripts/migrate-to-orgs.ts: the --env-file is loaded (force-
// overriding process.env) BEFORE PrismaClient is instantiated, so
// DATABASE_URL + CLERK_SECRET_KEY resolve correctly against prod.

import * as fs from "node:fs";

const envFileArg = process.argv.find((a) => a.startsWith("--env-file="));
if (envFileArg) {
  const p = envFileArg.slice("--env-file=".length);
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v; // force-override
  }
}

const DRY_RUN = process.argv.includes("--dry-run");

// Imported AFTER env loading so PrismaClient picks up DATABASE_URL.
import { PrismaClient } from "@prisma/client";
import { createClerkClient } from "@clerk/backend";

interface Candidate {
  userId: string;
  eventName: "login" | "signup";
  occurredAt: Date;
}

async function main(): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY not set — pass --env-file=<dotenv>");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set — pass --env-file=<dotenv>");
  }

  const clerk = createClerkClient({ secretKey });
  const prisma = new PrismaClient();

  try {
    // 1. Page through all Clerk users.
    const users: Array<{ id: string; lastSignInAt: number | null; createdAt: number }> = [];
    const LIMIT = 100;
    let offset = 0;
    for (;;) {
      const { data, totalCount } = await clerk.users.getUserList({ limit: LIMIT, offset });
      for (const u of data) {
        users.push({ id: u.id, lastSignInAt: u.lastSignInAt ?? null, createdAt: u.createdAt });
      }
      offset += data.length;
      if (data.length < LIMIT || offset >= (totalCount ?? offset)) break;
    }
    console.log(`Clerk users fetched: ${users.length}`);

    // 2. Which users already have a login / signup row? (skip those).
    const existing = await prisma.usageEvent.findMany({
      where: { eventName: { in: ["login", "signup"] } },
      select: { userId: true, eventName: true },
      distinct: ["userId", "eventName"],
    });
    const hasLogin = new Set(existing.filter((e) => e.eventName === "login").map((e) => e.userId));
    const hasSignup = new Set(existing.filter((e) => e.eventName === "signup").map((e) => e.userId));

    // 3. Build candidates, skipping users who already have that event type.
    const candidates: Candidate[] = [];
    for (const u of users) {
      if (!hasSignup.has(u.id)) {
        candidates.push({ userId: u.id, eventName: "signup", occurredAt: new Date(u.createdAt) });
      }
      if (u.lastSignInAt != null && !hasLogin.has(u.id)) {
        candidates.push({ userId: u.id, eventName: "login", occurredAt: new Date(u.lastSignInAt) });
      }
    }

    const logins = candidates.filter((c) => c.eventName === "login").length;
    const signups = candidates.filter((c) => c.eventName === "signup").length;
    console.log(
      `Candidates to insert: ${logins} logins + ${signups} signups = ${candidates.length} rows ` +
        `(users skipped — already had login: ${hasLogin.size}, signup: ${hasSignup.size})`
    );

    if (DRY_RUN) {
      console.log("[dry-run] wrote nothing.");
      return;
    }

    if (candidates.length > 0) {
      await prisma.usageEvent.createMany({
        data: candidates.map((c) => ({ userId: c.userId, eventName: c.eventName, occurredAt: c.occurredAt })),
      });
    }
    console.log(`Inserted ${candidates.length} UsageEvent rows.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[backfill-usage-logins] failed:", err);
  process.exit(1);
});
