// Verify a Stripe test-mode checkout landed correctly — the row-level
// assertions from docs/analysis/2026-09-03-stripe-test-mode-checkout.md, run
// as one command instead of by hand.
//
// READ-ONLY. It never writes or deletes; cleanup stays the manual SQL in the
// runbook so a script bug can't wipe rows. It reads DATABASE_URL from the
// environment it runs in — point it at the same Neon DB the preview writes to.
//
// Usage:
//   DATABASE_URL=... npx tsx scripts/verify-stripe-checkout.ts <buyerEmail> [operatorSlug] [flags]
//
//   <buyerEmail>    the guest email you bought as (matched case-insensitively)
//   [operatorSlug]  the operator you bought the pack FROM on its report page —
//                   when given, asserts one redeemed credit points at it
//
//   --expect-total=N     total credits expected (default 3 — the three-pack)
//   --expect-redeemed=N  hard-assert how many are redeemed. Omit to accept any
//                        count and just check internal consistency. Use =1
//                        right after the purchase, =2 after redeeming a second
//                        credit from the wallet.
//
// Exit code is 0 only when every check passes, so it drops into CI or a
// pre-invite gate. Phase-independent invariants (one session, contiguous
// slots, entitlement↔credit bijection) always run; the phase-specific counts
// are asserted only when you pass the flags.

import { PrismaClient } from "@prisma/client";

interface Args {
  email: string;
  operatorSlug: string | null;
  expectTotal: number;
  expectRedeemed: number | null;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let expectTotal = 3;
  let expectRedeemed: number | null = null;

  for (const arg of argv) {
    const total = arg.match(/^--expect-total=(\d+)$/);
    const redeemed = arg.match(/^--expect-redeemed=(\d+)$/);
    if (total) {
      expectTotal = Number(total[1]);
    } else if (redeemed) {
      expectRedeemed = Number(redeemed[1]);
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  const email = positional[0];
  if (!email) {
    throw new Error(
      "buyer email is required\n" +
        "usage: npx tsx scripts/verify-stripe-checkout.ts <buyerEmail> [operatorSlug] " +
        "[--expect-total=N] [--expect-redeemed=N]"
    );
  }
  return {
    email: email.trim().toLowerCase(),
    operatorSlug: positional[1] ?? null,
    expectTotal,
    expectRedeemed,
  };
}

// Collect pass/fail so we can print the FULL picture (a stop-at-first-failure
// run makes you re-run after each fix); exit non-zero if anything failed.
const results: { ok: boolean; label: string; detail?: string }[] = [];
function check(ok: boolean, label: string, detail?: string): void {
  results.push({ ok, label, detail });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set — point it at the Neon DB the preview writes to, e.g.\n" +
        "  DATABASE_URL=postgres://... npx tsx scripts/verify-stripe-checkout.ts you+test@dwellsy.com"
    );
  }

  const prisma = new PrismaClient();
  try {
    const [credits, entitlements, customer] = await Promise.all([
      prisma.reportCredit.findMany({
        where: { guestEmail: args.email },
        orderBy: { slot: "asc" },
      }),
      prisma.reportEntitlement.findMany({ where: { guestEmail: args.email } }),
      prisma.stripeCustomer.findFirst({ where: { email: args.email } }),
    ]);

    // --- Show what's actually there, first ---
    console.log(`\nBuyer: ${args.email}`);
    console.log(
      `\nReportCredit rows (${credits.length}):` +
        (credits.length === 0 ? " none" : "")
    );
    for (const c of credits) {
      console.log(
        `  slot ${c.slot}  session=${c.stripeSessionId}  ` +
          `redeemed=${c.redeemedPmSlug ?? "—"}` +
          `${c.redeemedAt ? ` @ ${c.redeemedAt.toISOString()}` : ""}  ` +
          `id=${c.id}`
      );
    }
    console.log(
      `\nReportEntitlement rows (${entitlements.length}):` +
        (entitlements.length === 0 ? " none" : "")
    );
    for (const e of entitlements) {
      console.log(`  pmSlug=${e.pmSlug}  sourceCreditId=${e.sourceCreditId ?? "—"}  id=${e.id}`);
    }

    const redeemedCredits = credits.filter((c) => c.redeemedAt !== null);
    const remaining = credits.length - redeemedCredits.length;
    console.log(
      `\nStripeCustomer: ${customer ? `1 (id=${customer.id})` : "none"}`
    );
    console.log(`Reports left to use (wallet should agree): ${remaining}\n`);

    // --- Assertions ---

    // 1. Customer.
    check(customer != null, "StripeCustomer row exists for the buyer");

    // 2. Total credits.
    check(
      credits.length === args.expectTotal,
      `credit count is ${args.expectTotal}`,
      `saw ${credits.length}`
    );

    if (credits.length > 0) {
      // 3. One session across all credits.
      const sessions = new Set(credits.map((c) => c.stripeSessionId));
      check(
        sessions.size === 1,
        "all credits share exactly one stripeSessionId",
        `saw ${sessions.size}: ${[...sessions].join(", ")}`
      );

      // 4. Contiguous slots 0..n-1, no dupes.
      const slots = credits.map((c) => c.slot).sort((a, b) => a - b);
      const expectedSlots = Array.from({ length: credits.length }, (_, i) => i);
      check(
        JSON.stringify(slots) === JSON.stringify(expectedSlots),
        `slots are contiguous 0..${credits.length - 1}`,
        `saw [${slots.join(",")}]`
      );

      // 5. redeemedAt and redeemedPmSlug are set together, never one without
      //    the other (a half-written redemption is a bug).
      const halfRedeemed = credits.filter(
        (c) => (c.redeemedAt === null) !== (c.redeemedPmSlug === null)
      );
      check(
        halfRedeemed.length === 0,
        "every redeemed credit has both redeemedAt and redeemedPmSlug",
        halfRedeemed.length > 0
          ? `${halfRedeemed.length} credit(s) have one set without the other`
          : undefined
      );
    }

    // 6. Entitlement count matches redeemed-credit count.
    check(
      entitlements.length === redeemedCredits.length,
      "entitlement count equals redeemed-credit count",
      `entitlements=${entitlements.length}, redeemed=${redeemedCredits.length}`
    );

    // 7 + 8. Each entitlement's sourceCreditId points at a redeemed credit of
    // THIS buyer, each redeemed credit is referenced exactly once, and the
    // entitlement's pmSlug equals that credit's redeemedPmSlug.
    const redeemedById = new Map(redeemedCredits.map((c) => [c.id, c]));
    const referenced = new Set<string>();
    let danglingRefs = 0;
    let slugMismatches = 0;
    for (const e of entitlements) {
      const src = e.sourceCreditId ? redeemedById.get(e.sourceCreditId) : undefined;
      if (!src) {
        danglingRefs += 1;
        continue;
      }
      referenced.add(src.id);
      if (src.redeemedPmSlug !== e.pmSlug) slugMismatches += 1;
    }
    check(
      danglingRefs === 0,
      "every entitlement.sourceCreditId points at a redeemed credit of this buyer",
      danglingRefs > 0 ? `${danglingRefs} entitlement(s) with a missing/foreign sourceCreditId` : undefined
    );
    check(
      referenced.size === redeemedCredits.length,
      "each redeemed credit backs exactly one entitlement",
      `redeemed=${redeemedCredits.length}, referenced=${referenced.size}`
    );
    check(
      slugMismatches === 0,
      "each entitlement.pmSlug matches its credit's redeemedPmSlug",
      slugMismatches > 0 ? `${slugMismatches} mismatch(es)` : undefined
    );

    // 9. Operator bought from a report page shows up as a redemption.
    if (args.operatorSlug) {
      const hit = redeemedCredits.some((c) => c.redeemedPmSlug === args.operatorSlug);
      check(
        hit,
        `a credit is redeemed for the operator bought (${args.operatorSlug})`,
        hit ? undefined : "no redeemed credit points at that slug"
      );
    }

    // 10. Optional phase count.
    if (args.expectRedeemed !== null) {
      check(
        redeemedCredits.length === args.expectRedeemed,
        `redeemed-credit count is ${args.expectRedeemed}`,
        `saw ${redeemedCredits.length}`
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  // --- Report ---
  console.log("Checks:");
  let failed = 0;
  for (const r of results) {
    console.log(
      `  ${r.ok ? "✓" : "✗"} ${r.label}` +
        (!r.ok && r.detail ? `  — ${r.detail}` : "")
    );
    if (!r.ok) failed += 1;
  }
  console.log(
    `\n${failed === 0 ? "PASS" : "FAIL"} — ${results.length - failed}/${results.length} checks passed\n`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nverify-stripe-checkout: ${err instanceof Error ? err.message : err}\n`);
  process.exit(2);
});
