# Per-organization market entitlements — design

**Date:** 2026-06-29
**Status:** Approved (brainstorm)
**Author:** Jonas + Claude

## Problem

Dwellsy IQ sells access by market. The first paying client bought 15 of the
32 live markets. Today access is all-or-nothing: any signed-in user sees all
32 markets / 3,443 PMs. We need to provision a specific subset of markets per
client, manage it from the admin panel without code changes, and without
routing entitlements through Clerk.

## Decisions (locked during brainstorm)

1. **Unit of entitlement = the organization** (the client account). Every user
   in a client's org inherits the same markets. No per-user control. This
   matches the existing `WatchList.organizationId` authorization rail and
   `getActiveOrgId()` resolver.
2. **Non-entitled UX = hybrid (option C).** The org's purchased markets are
   fully live. Non-purchased markets render as greyed "available to add" dots
   on the in-app coverage map (reusing the existing available-upon-request
   visual). Lists, search, scorecards, and `/ask` are scoped to entitled
   markets.
3. **Default = fail-closed.** An org with no provisioning sees zero premium
   markets. Self-serve signup is already off, so access is deliberately
   turned on per deal. Existing orgs are backfilled to all-markets on
   migration so current users don't go dark.
4. **Two entitlement shapes:** an `allMarkets` flag (all current + future
   markets, for internal/comp accounts and any national-tier client) OR an
   explicit list of granted markets (the 15-market client).
5. **Search index filtering = client-side.** The static `search_index.json`
   ships whole to the browser; results are filtered client-side to the org's
   markets. Operator *names* in non-entitled markets are technically visible
   via devtools, but the premium scorecard data stays gated. Acceptable;
   revisit (move search server-side) only if a client objects.

## Data model (Prisma, local — no Clerk)

```prisma
model Organization {
  // ... existing fields ...
  allMarkets Boolean @default(false)   // entitled to ALL current + future markets
  marketAccess OrganizationMarketAccess[]
}

model OrganizationMarketAccess {
  id             String       @id @default(cuid())
  organizationId String
  marketId       String
  createdAt      DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, marketId])
  @@index([organizationId])
}
```

**Effective entitlement** for an org:
- Internal admin user (`ADMIN_USER_IDS`) → `"all"` (bypass).
- `allMarkets === true` → `"all"`.
- else → the set of `marketId`s in `OrganizationMarketAccess`.

## Entitlement resolver (single source of truth)

`src/lib/auth/market-entitlements.ts`:
- `getEntitledMarketIds(orgId): Promise<Set<string> | "all">`
- `isMarketEntitled(entitlement, marketId): boolean`
- `resolveViewerEntitlement(): Promise<Set<string> | "all">` — resolves active
  org via `getActiveOrgId()`, applies admin bypass, returns the entitlement.

Anonymous viewers on public pages are not gated here (public pages stay all-32).

## Enforcement (centralized helper, called per read path)

Rejected alternatives: middleware enforcement (edge runtime, no Prisma →
would force entitlements into Clerk metadata, which we're avoiding); per-org
static generation (impossible).

Read paths to scope (all server-side except search):
- `loadMarketView` (market page), `loadStateView` (state page),
  `loadMsaPool`, `cross-market` footprint, operator `loadOperatorScorecard`.
- Scorecard / market / state / operator **pages**: per-request entitlement
  guard. Non-entitled market → render an upsell page ("not in your plan —
  contact sales"), not a 404. These pages become dynamically rendered (they
  are already login-gated, so no SEO loss; also trims build-time prerender).
- In-app coverage map: entitled = live dots; non-entitled = greyed "available
  to add."
- Search: pass the entitled market set to the client; filter `search_index`
  results client-side.
- `/ask` AI tools: scope market/operator lookups to entitled markets.
- Watch-list results/preview: scope to entitled markets.
- APIs `/api/pms/[slug]`, `/api/scorecard/[slug]/pdf`: guard by market.

**Public marketing pages stay all-32** (home, state/market landing, briefs,
sitemap) for SEO and marketing truth. Entitlement scoping applies only to the
logged-in workspace + premium surfaces. The home-page coverage map stays
fully live (marketing); the entitlement-aware greying lives on the in-app
`/property-managers` surfaces.

## Admin provisioning (`/admin/organizations/[id]`)

A new **Markets** section on the org detail page:
- Toggle: "All markets (current + future)" → sets `allMarkets`.
- When off: a checklist of all 32 markets grouped by state, with
  select-all / clear and a live "N of 32 selected" count.
- Saved by a server action writing `OrganizationMarketAccess` rows + the flag
  (pure Prisma; no Clerk calls).
- The org **list** page shows each org's access at a glance ("All markets" /
  "15 markets").

Access control unchanged: `/admin/*` stays gated by `isAdminUser`.

## Migration + backfill

- One Prisma migration: add `Organization.allMarkets` +
  `OrganizationMarketAccess`.
- Backfill: `UPDATE "Organization" SET "allMarkets" = true;` for all existing
  rows so current users + team orgs keep full access.
- New orgs default `allMarkets = false`, zero grants (fail-closed).

## Testing

- Unit: resolver — `allMarkets` flag, explicit list, admin bypass, empty =
  locked, unknown org = locked.
- Unit: `isMarketEntitled` against `"all"` and a set.
- Enforcement: data-layer filters return only entitled markets; page guard
  routes non-entitled to the upsell.

## Out of scope (YAGNI)

- Per-user entitlements.
- Per-market expiry / billing dates / seat limits.
- Server-side search (revisit only if name-leak objected to).
- Self-serve purchase flow (sales-led for now).
