// PR #50 (Clerk auth foundation, v0.13).
// PR #65 (multi-tenancy Phase 1, v0.18).
// v0.26 (Task 3, PR pending) — authz reworked onto the pure
// canViewList/canEditList predicates from ./visibility (own list, or
// shared-within-your-org for view; own or legacy-owned-in-your-org
// for edit). See ./visibility.test.ts for the behavioral matrix.
//
// The store delegates authorization-scoping to Prisma's `where`
// clause, which makes the read/write paths impossible to unit-test
// without a real database connection (or a heavyweight Prisma mock
// setup). This file covers only what's testable in isolation:
//
//   - The two well-known owner-id sentinels and the contract they
//     share with the 20260521190000_clerk_owner_id_backfill
//     migration (LEGACY_OWNER_ID was the v0.13 authz key; in v0.18
//     it stays on the row for forensics but no longer drives authz).
//   - The store function signatures — v0.26 requires BOTH userId and
//     organizationId on every read/write, and requires the
//     canViewList/canEditList predicates to actually be consulted
//     (not just organizationId equality). A regression that drops
//     userId, or that re-derives the authz check inline instead of
//     calling the shared predicates, is a tenancy/sharing boundary
//     violation.
//
// Behavioural coverage of cross-org isolation + the own/shared/private
// visibility matrix (getWatchList/updateWatchList/deleteWatchList)
// ships via ./visibility.test.ts (pure predicates) and the manual
// smoke test in the PR plan until we wire a Prisma test database into
// CI.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_OWNER_ID, LEGACY_OWNER_ID, WATCH_LIST_KINDS } from "./store";

test("LEGACY_OWNER_ID is the stable string the migration targets", () => {
  assert.equal(LEGACY_OWNER_ID, "legacy-pre-auth");
  // No real Clerk userId can collide with this sentinel — they're
  // always prefixed with "user_". Belt-and-suspenders against a
  // future Clerk versioning surprise.
  assert.equal(LEGACY_OWNER_ID.startsWith("user_"), false);
});

test("DEFAULT_OWNER_ID stays distinct from the legacy stamp", () => {
  assert.equal(DEFAULT_OWNER_ID, "shared");
  assert.notEqual(DEFAULT_OWNER_ID, LEGACY_OWNER_ID);
});

test("clerk_owner_id_backfill migration updates 'shared' → LEGACY_OWNER_ID", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260521190000_clerk_owner_id_backfill/migration.sql"
    ),
    "utf8"
  );
  // Migration must reference both sentinels by their exact strings.
  // If LEGACY_OWNER_ID changes, this fails — forcing the migration
  // to be updated in lock-step.
  assert.ok(
    sql.includes(`'${LEGACY_OWNER_ID}'`),
    `migration must set ownerId to '${LEGACY_OWNER_ID}'`
  );
  assert.ok(
    sql.includes(`'${DEFAULT_OWNER_ID}'`),
    `migration must target the legacy '${DEFAULT_OWNER_ID}' rows`
  );
});

test("v0.26 store: read/write signatures require BOTH userId and organizationId", () => {
  // Source-level regression guard. If anyone reverts the v0.26 authz
  // rework and drops userId back off these signatures (reverting to
  // plain organizationId-only scoping), this catches it — that would
  // silently re-introduce the "any org member sees any org list"
  // leak that canViewList/canEditList exist to close.
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  // listWatchListes takes (userId, organizationId) — both required.
  assert.ok(
    src.includes("listWatchListes(\n  userId: string,\n  organizationId: string\n)"),
    "listWatchListes must take (userId: string, organizationId: string)"
  );
  // getWatchList/updateWatchList/deleteWatchList all take a
  // WatchListAuthContext ({ userId, organizationId }), not a bare
  // organizationId string.
  assert.ok(
    src.match(/getWatchList\(\s*id: string,\s*ctx: WatchListAuthContext/),
    "getWatchList must accept a WatchListAuthContext (userId + organizationId), not a bare organizationId"
  );
  assert.ok(
    /updateWatchList\([\s\S]*?ctx: WatchListAuthContext/.test(src),
    "updateWatchList must accept a WatchListAuthContext"
  );
  assert.ok(
    /deleteWatchList\(\s*id: string,\s*ctx: WatchListAuthContext/.test(src),
    "deleteWatchList must accept a WatchListAuthContext"
  );
});

test("v0.26 store: reads/writes consult canViewList/canEditList, not raw field comparisons", () => {
  // The v0.18 store compared row.organizationId directly against the
  // caller's organizationId inline. v0.26 delegates that decision to
  // the shared predicates in ./visibility so the view/edit rules live
  // in exactly one place. A regression that re-inlines an
  // organizationId-only comparison (bypassing canViewList/canEditList)
  // would silently resurrect the private-list leak Task 2/3 closed.
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  assert.ok(
    src.includes('import { canViewList, canEditList } from "./visibility";'),
    "store.ts must import canViewList and canEditList from ./visibility"
  );
  // Every mutation site is gated by canEditList.
  assert.equal(
    (src.match(/canEditList\(/g) ?? []).length >= 2,
    true,
    "updateWatchList and deleteWatchList must both call canEditList"
  );
  // Every read site is gated by canViewList.
  assert.equal(
    (src.match(/canViewList\(/g) ?? []).length >= 3,
    true,
    "listWatchListes, getWatchList, and getWatchListWithCrossOrgCheck must all call canViewList"
  );
});

test("v0.26 store: getWatchListWithCrossOrgCheck gates the same-org happy path on canViewList", () => {
  // SECURITY: Task 3's headline fix. Before, any row whose
  // organizationId matched the caller's active org was unconditionally
  // "found" — including a teammate's PRIVATE (isShared: false) list.
  // The happy-path branch must now also fail closed via canViewList
  // before returning "found".
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  assert.ok(
    /row\.organizationId === activeOrganizationId\) \{[\s\S]{0,300}?canViewList\(record, \{ userId, organizationId: activeOrganizationId \}\)[\s\S]{0,120}?status: "not_found"/.test(
      src
    ),
    'getWatchListWithCrossOrgCheck must return { status: "not_found" } when the row is in the active org but canViewList fails (teammate\'s private list)'
  );
});

test("createWatchList defaults isShared to false (private-by-default)", () => {
  // Fix 2 (post-Task-3): the store's default must match the schema's
  // @default(false) and the private-by-default model. `?? true` here
  // would silently make every list org-visible unless a caller
  // explicitly opts out — a landmine for any future caller that omits
  // isShared.
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  assert.ok(
    src.includes("isShared: input.isShared ?? false"),
    "createWatchList must default isShared to false, not true"
  );
  assert.equal(
    src.includes("isShared: input.isShared ?? true"),
    false,
    "createWatchList must not fall back to isShared ?? true"
  );
});

test("listSharedForOrg filters by organizationId + isShared, never by ownerId", () => {
  // Fix 1 (CRITICAL, cross-tenant leak): the digest content pass used to
  // call listWatchListes(LEGACY_OWNER_ID, orgId) as a stand-in for "the
  // org's visible lists." LEGACY_OWNER_ID is a REAL ownerId stamped on
  // backfilled pre-auth rows (organizationId: NULL), and canViewList's
  // ownership branch (ownerId === userId) has no org check — so that
  // call surfaced every org's legacy rows in every org's digest.
  //
  // listSharedForOrg must query strictly by { organizationId,
  // isShared: true } with no ownerId-match path at all, so legacy rows
  // (organizationId: null) and other members' private rows can never
  // match regardless of what ownerId they carry.
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  const fnMatch = src.match(
    /export async function listSharedForOrg\([\s\S]*?\n\}/
  );
  assert.ok(fnMatch, "listSharedForOrg must exist and be exported");
  const fn = fnMatch![0];
  assert.ok(
    /where:\s*\{\s*organizationId,\s*isShared:\s*true\s*\}/.test(fn),
    "listSharedForOrg's where clause must be exactly { organizationId, isShared: true }"
  );
  assert.equal(
    fn.includes("ownerId"),
    false,
    "listSharedForOrg must not reference ownerId anywhere in its body"
  );
});

test("digest-run.ts no longer uses LEGACY_OWNER_ID as a fake userId", () => {
  // Regression guard for Fix 1: the digest's org-scoped content pass
  // must use a real store query, not listWatchListes(LEGACY_OWNER_ID, ...).
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/digest-run.ts"),
    "utf8"
  );
  assert.equal(
    src.includes("LEGACY_OWNER_ID"),
    false,
    "digest-run.ts must not import or reference LEGACY_OWNER_ID"
  );
});

test("listAllForOrg queries strictly by organizationId, no isShared/ownerId filter", () => {
  // Task 8 (W-T8): buildOrgListContext must evaluate EVERY list in the org
  // (private + shared), not just the shared subset listSharedForOrg
  // returns — per-recipient scoping (canViewList) is what makes a private
  // list safe to include here; see digest-gather.ts's visibleListsForMember.
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  const fnMatch = src.match(
    /export async function listAllForOrg\([\s\S]*?\n\}/
  );
  assert.ok(fnMatch, "listAllForOrg must exist and be exported");
  const fn = fnMatch![0];
  assert.ok(
    /where:\s*\{\s*organizationId\s*\}/.test(fn),
    "listAllForOrg's where clause must be exactly { organizationId } — no isShared, no ownerId"
  );
  assert.equal(
    fn.includes("ownerId"),
    false,
    "listAllForOrg must not reference ownerId anywhere in its body"
  );
});

test("Task 8: buildOrgListContext calls listAllForOrg and carries ownerId/isShared/organizationId per list", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/digest-run.ts"),
    "utf8"
  );
  assert.ok(
    src.includes("listAllForOrg(orgId)"),
    "buildOrgListContext must call listAllForOrg(orgId), not listSharedForOrg"
  );
  assert.ok(
    /lists\.push\(\{\s*\n\s*name:\s*wl\.name,\s*ownerId:\s*wl\.ownerId,\s*isShared:\s*wl\.isShared,\s*organizationId:\s*wl\.organizationId,/.test(
      src
    ),
    "each pushed list entry must carry ownerId/isShared/organizationId alongside name/matchedPmSlugs/metaBySlug"
  );
});

test("Task 8: buildOrgListContext passes skipCriteriaMatch for kind:'pinned' lists (mirrors /results and /changes)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/digest-run.ts"),
    "utf8"
  );
  assert.ok(
    /const isPinnedList = wl\.kind === "pinned";/.test(src),
    "buildOrgListContext must compute isPinnedList from wl.kind"
  );
  assert.ok(
    /applyWatchList\(\s*\{[\s\S]*?\},\s*entitlement,\s*pins,\s*isPinnedList,?\s*\)/.test(src),
    "buildOrgListContext must pass pins + isPinnedList (skipCriteriaMatch) as the 3rd/4th applyWatchList args"
  );
});

test("Task 8: runDigest's per-recipient fan-out filters ctx.lists through visibleListsForMember before rendering", () => {
  // SECURITY-CRITICAL: this is the actual leak-prevention gate — a
  // private list owned by a different member must never reach that
  // member's rendered digest. buildOrgListContext deliberately performs
  // NO authorization (it's org-wide + prior-independent), so this filter
  // is the only thing standing between "org's full list set" and "one
  // recipient's email."
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/digest-run.ts"),
    "utf8"
  );
  assert.ok(
    src.includes(
      "import { buildListChanges, isDigestDue, selectPriorForRecipient, parseCadence, visibleListsForMember, type OperatorMeta } from \"./digest-gather\";"
    ),
    "digest-run.ts must import visibleListsForMember from digest-gather"
  );
  assert.ok(
    /const visibleLists = visibleListsForMember\(ctx\.lists,\s*\{\s*\n\s*userId:\s*m\.userId,\s*organizationId:\s*org\.id,\s*\n\s*\}\);/.test(
      src
    ),
    "the per-member loop must filter ctx.lists via visibleListsForMember before buildListChanges"
  );
  assert.ok(
    /const lists = visibleLists\s*\n\s*\.map\(\(c\) => buildListChanges\(/.test(src),
    "buildListChanges must map over visibleLists, not the unfiltered ctx.lists"
  );
});

test("v0.26 store: createWatchList requires organizationId in input", () => {
  // The WatchListInput interface MUST require organizationId so
  // TypeScript catches any caller that forgets to thread it through.
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  // Match the WatchListInput shape — organizationId must be a
  // required (non-optional) field.
  const ifaceMatch = src.match(
    /export interface WatchListInput \{[\s\S]*?\n\}/
  );
  assert.ok(ifaceMatch, "WatchListInput interface must exist");
  const iface = ifaceMatch![0];
  // Required field — no `?` after the name.
  assert.ok(
    /organizationId:\s*string;/.test(iface),
    "WatchListInput.organizationId must be required (no `?` modifier)"
  );
});

// v0.26 (Task 4) — member store fns (addMember/removeMember/listMembers).
// Same constraint as the rest of this file: Prisma's `where` clause makes
// these impossible to unit-test end-to-end without a real DB, so these are
// source-level regression guards that the owner-only gate is actually
// consulted (not re-derived inline), plus the upsert/deleteMany shape.

test("addMember gates on canEditList before writing, and upserts on the compound unique", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  const fnMatch = src.match(
    /export async function addMember\([\s\S]*?\n\}/
  );
  assert.ok(fnMatch, "addMember must exist and be exported");
  const fn = fnMatch![0];
  assert.ok(
    /if \(!existing\) return false;/.test(fn),
    "addMember must return false when the watch list doesn't exist"
  );
  assert.ok(
    /if \(!canEditList\(parseRow\(existing\), ctx\)\) return false;/.test(fn),
    "addMember must refuse (return false) unless canEditList passes — this is the owner-only enforcement point"
  );
  assert.ok(
    /prisma\.watchListMember\.upsert\(/.test(fn),
    "addMember must upsert (not create), so re-pinning the same company is a no-op instead of a unique-constraint error"
  );
  assert.ok(
    /where:\s*\{\s*watchListId_memberKey:\s*\{\s*watchListId,\s*memberKey\s*\}\s*\}/.test(fn),
    "addMember's upsert must key on the (watchListId, memberKey) compound unique"
  );
  assert.ok(
    /addedByUserId:\s*ctx\.userId/.test(fn),
    "addMember must stamp addedByUserId from ctx.userId on create"
  );
});

test("removeMember gates on canEditList before deleting, and tolerates an already-absent row", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  const fnMatch = src.match(
    /export async function removeMember\([\s\S]*?\n\}/
  );
  assert.ok(fnMatch, "removeMember must exist and be exported");
  const fn = fnMatch![0];
  assert.ok(
    /if \(!existing\) return false;/.test(fn),
    "removeMember must return false when the watch list doesn't exist"
  );
  assert.ok(
    /if \(!canEditList\(parseRow\(existing\), ctx\)\) return false;/.test(fn),
    "removeMember must refuse (return false) unless canEditList passes — this is the owner-only enforcement point"
  );
  // deleteMany (not delete) — delete() on a compound-unique where clause
  // throws P2025 if the row is already gone; a repeat unpin must still
  // report success as long as the caller was authorized to ask.
  assert.ok(
    /prisma\.watchListMember\.deleteMany\(/.test(fn),
    "removeMember must use deleteMany so an already-absent member doesn't throw"
  );
});

test("member store fns require the same WatchListAuthContext shape as update/deleteWatchList", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  assert.ok(
    /addMember\(\s*watchListId: string,\s*memberKey: string,\s*ctx: WatchListAuthContext\s*\)/.test(
      src
    ),
    "addMember must take (watchListId, memberKey, ctx: WatchListAuthContext)"
  );
  assert.ok(
    /removeMember\(\s*watchListId: string,\s*memberKey: string,\s*ctx: WatchListAuthContext\s*\)/.test(
      src
    ),
    "removeMember must take (watchListId, memberKey, ctx: WatchListAuthContext)"
  );
});

test("WATCH_LIST_KINDS is exactly the two valid kind values", () => {
  // Fix 1 (post-Task-6): shared source of truth for both createWatchList's
  // default and the POST route's whitelist below — a change here should
  // force both call sites to be reconsidered.
  assert.deepEqual([...WATCH_LIST_KINDS], ["criteria", "pinned"]);
});

test("POST /api/watch-lists whitelists kind to WATCH_LIST_KINDS before it reaches createWatchList", () => {
  // Fix 1 (post-Task-6): the route used to only check `typeof input.kind
  // !== "string"`, so any string ("archived", "smart-list", a typo) was
  // accepted and persisted verbatim. Nothing downstream (the
  // AddToWatchList island's kind === "pinned" filter, the editor's
  // kind === "criteria" assumptions, the /members route) knows what to
  // do with an unrecognized kind, so bad input here silently produces a
  // list that can't be found by either surface.
  const routeSrc = readFileSync(
    join(process.cwd(), "src/app/api/watch-lists/route.ts"),
    "utf8"
  );
  assert.ok(
    routeSrc.includes(
      'import { createWatchList, listWatchListes, WATCH_LIST_KINDS } from "@/lib/watch-list/store";'
    ),
    "route.ts must import WATCH_LIST_KINDS from the store rather than re-declaring the two literals"
  );
  assert.ok(
    /input\.kind !== undefined &&\s*input\.kind !== "criteria" &&\s*input\.kind !== "pinned"/.test(
      routeSrc
    ),
    'POST must reject any kind value other than "criteria" or "pinned"'
  );
  const guardMatch = routeSrc.match(
    /if \(\s*input\.kind !== undefined[\s\S]{0,250}?\n  \}/
  );
  assert.ok(guardMatch, "the kind-whitelist guard block must exist");
  assert.ok(
    /status: 422/.test(guardMatch![0]),
    "an invalid kind must 422, matching the other validation failures in this handler"
  );
});

test("the /members route enforces owner-only mutation via the store fns, not an inline check", () => {
  // The route itself must NOT re-derive an authz decision — it only
  // resolves { userId, organizationId } and defers the actual
  // owner-only gate to addMember/removeMember (canEditList). This
  // guards against a future edit that adds a shortcut check in the
  // route and bypasses the shared predicate.
  const routeSrc = readFileSync(
    join(
      process.cwd(),
      "src/app/api/watch-lists/[id]/members/route.ts"
    ),
    "utf8"
  );
  assert.ok(
    routeSrc.includes('import { addMember, removeMember } from "@/lib/watch-list/store";'),
    "the /members route must import addMember/removeMember from the store"
  );
  assert.equal(
    routeSrc.includes("canEditList("),
    false,
    "the /members route must not CALL canEditList directly — the gate lives inside addMember/removeMember"
  );
  assert.ok(
    /const ok = await addMember\(/.test(routeSrc) &&
      /if \(!ok\) return Response\.json\(\{ error: "Not found\." \}, \{ status: 404 \}\);/.test(
        routeSrc
      ),
    "POST must 404 when addMember returns false (covers both not-found and not-authorized)"
  );
  assert.ok(
    /const ok = await removeMember\(/.test(routeSrc),
    "DELETE must call removeMember"
  );
});

test("Task 7 Step 4: /changes wires pinned members into applyWatchList, same as /results", () => {
  // Before this fix, changes/page.tsx called applyWatchList(watchList,
  // entitlement) with no 3rd/4th arg — its matchedPmSlugs (and thus its
  // diff) disagreed with the pin-inclusive set /results computes and
  // links here from, violating changes.ts's own documented "both
  // surfaces must show the same diff" invariant. Source-level check
  // (matching this file's convention for page/route logic that isn't
  // otherwise unit-testable without a database) rather than a
  // behavioral test, since applyWatchList/listMembers are both
  // DB-bound.
  const pageSrc = readFileSync(
    join(process.cwd(), "src/app/watch-lists/[id]/changes/page.tsx"),
    "utf8"
  );
  assert.ok(
    pageSrc.includes(
      'import {\n  getWatchListWithCrossOrgCheck,\n  listMembers,\n} from "@/lib/watch-list/store";'
    ),
    "/changes must import listMembers alongside getWatchListWithCrossOrgCheck"
  );
  assert.ok(
    /const pins = new Set\(\s*\(await listMembers\(watchList\.id\)\)\.map\(\(m\) => m\.memberKey\)\s*\);/.test(
      pageSrc
    ),
    "/changes must build the same pins Set (memberKey) that /results builds"
  );
  assert.ok(
    /applyWatchList\(\s*\{[\s\S]*?\},\s*entitlement,\s*pins,\s*isPinnedList\s*\)/.test(
      pageSrc
    ),
    "/changes must pass pins + skipCriteriaMatch (isPinnedList) as the 3rd/4th applyWatchList args, same as /results"
  );
});
