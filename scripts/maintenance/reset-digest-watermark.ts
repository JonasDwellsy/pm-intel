// One-off maintenance: move each digest subscriber's watermark forward so the
// next digest diffs ONE refresh step instead of replaying several weeks.
//
// WHY THIS EXISTS. A digest diffs against each recipient's
// `lastNotifiedSnapshotDate`, not against the previous snapshot. Both
// subscribers sat on 2026-07-17 while the newest snapshot was 2026-08-20, so
// the pending digest spanned a full monthly refresh: 16,830 changes, 5.7 MB of
// HTML — past the point where any mail client renders it. Thresholding the
// noisy signals (PRs #348, #350) cut that to 6,807 / 2.9 MB, still unsendable,
// because the window itself is the problem.
//
// Moving the watermark to 2026-08-07 makes the next diff 08-07 → 08-20: 25
// operators, 28 changes, 21 KB. All of them real market entries.
//
// THE TRADE-OFF, stated plainly: this declares the 07-17 → 08-07 changes as
// already-notified, so they are never reported. That span is dominated by
// refresh churn, which is exactly what should not be sent — but any real
// signal inside it is skipped too.
//
// Run:  npx tsx scripts/maintenance/reset-digest-watermark.ts          (dry run)
//       APPLY=1 npx tsx scripts/maintenance/reset-digest-watermark.ts  (writes)
//
// Requires DATABASE_URL pointed at the intended database. Prints before/after
// and never touches any row whose watermark is not exactly FROM_DATE, so a
// re-run is a no-op rather than a second shift.

import { PrismaClient } from "@prisma/client";

const FROM_DATE = new Date("2026-07-17T00:00:00.000Z");
const TO_DATE = new Date("2026-08-07T00:00:00.000Z");
const iso = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? "null";

const prisma = new PrismaClient();

(async () => {
  const before = await prisma.digestPreference.findMany({
    select: { userId: true, cadence: true, lastNotifiedSnapshotDate: true, unsubscribed: true },
    orderBy: { userId: "asc" },
  });
  console.log(`BEFORE (${before.length} subscriber(s)):`);
  for (const r of before) {
    console.log(`  ${r.userId}  watermark=${iso(r.lastNotifiedSnapshotDate)}  cadence=${r.cadence}  unsubscribed=${r.unsubscribed}`);
  }

  const eligible = before.filter(
    (r) => r.lastNotifiedSnapshotDate?.getTime() === FROM_DATE.getTime(),
  );
  console.log(`\n${eligible.length} row(s) match watermark ${iso(FROM_DATE)} and would move to ${iso(TO_DATE)}.`);

  if (process.env.APPLY !== "1") {
    console.log("Dry run — set APPLY=1 to write.");
    await prisma.$disconnect();
    return;
  }
  if (eligible.length === 0) {
    console.log("Nothing to do (already moved, or watermarks differ). No write attempted.");
    await prisma.$disconnect();
    return;
  }

  // Scoped by the current value, so this can only ever move the rows it just
  // reported — never a subscriber added since, and never twice.
  const res = await prisma.digestPreference.updateMany({
    where: { lastNotifiedSnapshotDate: FROM_DATE },
    data: { lastNotifiedSnapshotDate: TO_DATE },
  });
  console.log(`\nUPDATED ${res.count} row(s).`);

  const after = await prisma.digestPreference.findMany({
    select: { userId: true, lastNotifiedSnapshotDate: true, lastDigestAt: true },
    orderBy: { userId: "asc" },
  });
  console.log("AFTER:");
  for (const r of after) {
    console.log(`  ${r.userId}  watermark=${iso(r.lastNotifiedSnapshotDate)}  lastDigestAt=${iso(r.lastDigestAt)}`);
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
