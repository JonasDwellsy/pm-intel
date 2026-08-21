import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const TARGET = new Date("2026-08-07T00:00:00.000Z");
(async () => {
  const before = await p.digestPreference.findMany({
    select: { id: true, userId: true, cadence: true, lastNotifiedSnapshotDate: true, unsubscribed: true },
    orderBy: { id: "asc" },
  });
  console.log("BEFORE:");
  for (const r of before) console.log(`  ${r.userId}  lastNotified=${r.lastNotifiedSnapshotDate?.toISOString().slice(0,10)}  cadence=${r.cadence}`);

  if (process.env.APPLY !== "1") { console.log("\n(dry run — set APPLY=1 to write)"); await p.$disconnect(); return; }

  const res = await p.digestPreference.updateMany({
    data: { lastNotifiedSnapshotDate: TARGET },
  });
  console.log(`\nUPDATED ${res.count} row(s) -> lastNotifiedSnapshotDate=${TARGET.toISOString().slice(0,10)}`);

  const after = await p.digestPreference.findMany({
    select: { userId: true, cadence: true, lastNotifiedSnapshotDate: true, lastDigestAt: true },
    orderBy: { id: "asc" },
  });
  console.log("AFTER:");
  for (const r of after) console.log(`  ${r.userId}  lastNotified=${r.lastNotifiedSnapshotDate?.toISOString().slice(0,10)}  lastDigestAt=${r.lastDigestAt?.toISOString().slice(0,10)}`);
  await p.$disconnect();
})().catch(async (e) => { console.error("ERR:", e.message); await p.$disconnect(); process.exit(1); });
