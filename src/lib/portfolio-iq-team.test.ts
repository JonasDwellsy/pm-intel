import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOwnerTeamWorkQueue, type OwnerTeamWorkItem } from "@/lib/portfolio-iq/team";

const now = new Date("2026-08-11T12:00:00Z");
const item = (overrides: Partial<OwnerTeamWorkItem>): OwnerTeamWorkItem => ({ signalId: "signal", headline: "Review asking-rent position", severity: "medium", state: "acknowledged", assignedUserId: null, assignedTo: null, dueAt: null, assetNames: ["The Acadian Apartments"], ...overrides });

test("owner team queue separates personal, delegated, unassigned, and role assignments", () => {
  const queue = buildOwnerTeamWorkQueue({ userId: "user-1", now, items: [
    item({ signalId: "mine", assignedUserId: "user-1", assignedTo: "Jonas", dueAt: new Date("2026-08-10T12:00:00Z") }),
    item({ signalId: "delegated", assignedUserId: "user-2", assignedTo: "Asset manager" }),
    item({ signalId: "unassigned" }),
    item({ signalId: "pm", assignedTo: "Property manager" }),
    item({ signalId: "resolved", assignedUserId: "user-1", assignedTo: "Jonas", state: "resolved" }),
  ] });
  assert.deepEqual(queue.mine.map((work) => work.signalId), ["mine"]);
  assert.deepEqual(queue.delegated.map((work) => work.signalId), ["delegated"]);
  assert.deepEqual(queue.unassigned.map((work) => work.signalId), ["unassigned"]);
  assert.deepEqual(queue.roleOrExternal.map((work) => work.signalId), ["pm"]);
  assert.equal(queue.dueMine, 1);
});

test("owner team migration and route remain additive and portfolio scoped", () => {
  const migration = readFileSync("prisma/migrations/20260811140000_portfolio_iq_owner_team/migration.sql", "utf8");
  const server = readFileSync("src/lib/portfolio-iq/team.server.ts", "utf8");
  const action = readFileSync("src/app/portfolio-iq/team/actions.ts", "utf8");
  assert.match(migration, /ADD COLUMN "assignedUserId" TEXT/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|OperatorIq|\"PM\"/);
  assert.match(server, /organizationId: portfolio\.organizationId/);
  assert.match(action, /organizationMembership\.findUnique/);
  assert.match(action, /userId_organizationId/);
});
