# Proving the payment path in Stripe test mode

The credit logic — minting, redemption, the concurrency guards — is proven in
CI against a real Postgres. What CI cannot prove is the **Stripe wiring**:
that a Checkout Session is created with the right Price, that the webhook
signature verifies, that `metadata` survives the round trip, and that the
grant actually lands. This runbook proves that end to end without moving
money.

Run it before inviting the first buyer, and again after any change to the
webhook, the checkout route, or the Price env vars.

## What test mode is, and what it is not

The Test mode switch is a **per-user view toggle**. It does not change account
state and is invisible to live traffic. Test and live are two permanently
separate data spaces; every account has both.

**Shared-account caveat.** A webhook endpoint receives every event of its
subscribed types for that account AND mode — including events another
application on the same Stripe account generated. Our handler is safe in both
directions: `handleCheckoutCompleted` returns immediately when
`session.metadata.kind` is absent (`// not one of our sessions`), and unknown
event types hit a `default:` that returns 200. Before running this, check
whether a sibling application has a **test-mode** endpoint subscribed to
`checkout.session.completed`, and warn that team that they will see a few
stray events. The same cross-talk exists in live mode, with real money, which
is the main reason this runbook is test-mode only.

## The one thing to know first

`DATABASE_URL` is the same Neon database in every environment, so a test
purchase writes real rows into **production**:

| table | rows |
|---|---|
| `StripeCustomer` | 1 |
| `ReportCredit` | 3 (one redeemed if bought from a report page) |
| `ReportEntitlement` | 1 |
| `StripeWebhookEvent` | 1 |

They are keyed to a guest email you choose and touch no other user and nothing
in the enterprise product. Use a distinctive address so cleanup is
unambiguous, and delete them afterwards (last section).

The clean alternative is a Neon branch pointed at Preview. More setup; worth
it once this is run regularly.

## Setup

**1. Test Prices.** In test mode create two **one-time** Prices: $149 single
report, $299 three-report pack. Note both `price_…` ids and the `sk_test_…`
secret key.

**2. A preview to test against.** Push a branch and open a PR; Vercel builds a
preview with a stable branch URL that survives redeploys.

**3. Webhook endpoint.** Still in test mode, add an endpoint at
`https://<preview-url>/api/stripe/webhook` subscribed to
**`checkout.session.completed`**. Copy the `whsec_…` signing secret.

Without this the checkout succeeds and **nothing is granted** — the webhook is
the only thing that turns payment into access.

**4. Vercel env vars, Preview scope only.** Leave Production untouched.

| variable | value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 3 |
| `STRIPE_PRICE_REPORT` | test $149 price id |
| `STRIPE_PRICE_THREE_PACK` | test $299 price id |
| `NEXT_PUBLIC_APP_URL` | the preview URL |

Check what Preview currently inherits. A live `sk_live_…` there would mean a
test click charges a real card. Mode separation makes this fail-safe once the
test key is in place: a live card cannot be used against a test key.

Redeploy the preview so the new vars take effect.

## The run

Buy the **$299 pack from an operator's report page** — that exercises the most
paths in one purchase: minting, immediate redemption, and the email.

Card `4242 4242 4242 4242`, any future expiry, any CVC. Never a real card.

## What to verify

Not "did it look like it worked" — check the rows:

- exactly **3** `ReportCredit` rows for the buyer email, sharing one
  `stripeSessionId`, with `slot` 0/1/2
- exactly **1** redeemed, its `redeemedPmSlug` equal to the operator bought
- exactly **1** `ReportEntitlement`, its `sourceCreditId` pointing at that
  redeemed credit
- the report itself readable at `/report/r/<slug>?token=…`
- the wallet at `/report/account?token=…` showing **2 reports left to use**
- redeeming a second credit from the wallet drops it to **1** and creates a
  second entitlement

That last step matters most: it is the only place the wallet's redemption path
runs outside CI.

## Cleanup

Delete by the buyer email, then confirm the four tables are back to zero:

```sql
DELETE FROM "ReportEntitlement" WHERE "guestEmail" = '<buyer email>';
DELETE FROM "ReportCredit"      WHERE "guestEmail" = '<buyer email>';
DELETE FROM "StripeCustomer"    WHERE "email"      = '<buyer email>';
DELETE FROM "StripeWebhookEvent" WHERE id IN (<the event ids from the run>);
```

Order matters only for readability — there is no FK between entitlements and
credits (`sourceCreditId` is unique but unconstrained), so neither cascades.
