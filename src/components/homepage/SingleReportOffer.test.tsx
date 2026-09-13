import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SingleReportOffer } from "./SingleReportOffer";
import { PRODUCTS } from "@/lib/billing/products";

// The offer block's job is to be findable without anchoring the enterprise
// conversation. Two properties matter: the prices match the catalog exactly
// (a hard-coded number here would silently drift from what Stripe charges),
// and the copy frames this by INTENT — "one manager" — rather than as a tier
// of the enterprise product.

describe("SingleReportOffer", () => {
  test("prices come from the catalog, not from hard-coded strings", () => {
    const { container } = render(<SingleReportOffer />);
    const text = container.textContent ?? "";
    expect(text).toContain(`$${PRODUCTS.single_report.priceUsd}`);
    expect(text).toContain(`$${PRODUCTS.three_pack.priceUsd}`);
  });

  test("the pack is stated as non-expiring", () => {
    // Credits have no expiry in the schema; saying so removes the buyer's
    // main hesitation about a pack they cannot fully redeem today. Assert
    // the actual claim (the negation), not just the word "expire" — that
    // weaker check would pass equally if the copy were inverted to say
    // credits DO expire.
    const { container } = render(<SingleReportOffer />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(/don.?t expire/.test(text)).toBe(true);
  });

  test("it does not name a price for the enterprise product", () => {
    // Enterprise is priced by conversation. A number here would anchor it.
    //
    // The pattern must catch a dollar amount followed, within a short span,
    // by a recurrence word — not just any "$digits" adjacent to "mo"/"year"
    // ANYWHERE in the text (the old pattern's `\s*` between price and unit
    // was too permissive in the wrong direction and too narrow in the right
    // one: it missed "$30k per year" and "from $1,200 a month" entirely,
    // since neither has a bare "mo"/"month"/"year"/"yr" immediately after an
    // optional "/" or "per " — "a month" and a bare "k" suffix weren't
    // covered).
    const text = render(<SingleReportOffer />).container.textContent ?? "";
    const enterprisePriceLike =
      /\$\s*\d[\d,]*\s*k?\b(?:\s*(?:\/|per\s+|a\s+))?\s*(?:mo|month|months|monthly|yr|yrs|year|years|annually|annual)\b/i;
    expect(enterprisePriceLike.test(text)).toBe(false);
  });

  test("the enterprise-price guard actually catches recurring prices", () => {
    // Finding 1: a guard that only ever returns false on real inputs isn't
    // a guard. Prove both directions against the same pattern used above.
    const enterprisePriceLike =
      /\$\s*\d[\d,]*\s*k?\b(?:\s*(?:\/|per\s+|a\s+))?\s*(?:mo|month|months|monthly|yr|yrs|year|years|annually|annual)\b/i;

    for (const s of [
      "$2,500/mo",
      "$30k per year",
      "from $1,200 a month",
      "$5,000 monthly",
      "$60,000 annually",
    ]) {
      expect(enterprisePriceLike.test(s)).toBe(true);
    }

    for (const s of [
      "$149",
      "$299",
      "Three reports for $299. They don't expire.",
      "$149 one report",
    ]) {
      expect(enterprisePriceLike.test(s)).toBe(false);
    }
  });

  test("the shortlist count comes from the catalog, not a hard-coded word", () => {
    // Finding 3: the count in "Three reports for $299" must track
    // PRODUCTS.three_pack.credits, not a literal "Three" that would silently
    // go stale if the pack size ever changed.
    const { container } = render(<SingleReportOffer />);
    const text = container.textContent ?? "";
    const n = PRODUCTS.three_pack.credits;
    const words: Record<number, string> = {
      1: "one",
      2: "two",
      3: "three",
      4: "four",
      5: "five",
      6: "six",
    };
    const expected = words[n] ?? String(n);
    const re = new RegExp(`\\b(${expected}|${n})\\b`, "i");
    expect(re.test(text)).toBe(true);
  });

  test("the single report routes into the funnel (operator picked first)", () => {
    // A single report is ABOUT one operator, so it cannot start a purchase
    // here — checkout needs a chosen manager. Its CTA is the funnel link, and
    // that path never carries an operator-less "checkout" URL.
    const { container } = render(<SingleReportOffer />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/report");
    expect(hrefs.some((h) => h?.includes("checkout"))).toBe(false);
  });

  test("unlimited access is offered as a conversation, not a third price", () => {
    // Jonas asked for a third option on the homepage. It must NOT become a
    // price card: unlimited is the monitoring system, and the block's whole
    // framing is that it differs from a report in KIND, not in volume. A
    // number here would anchor the enterprise conversation against $149 —
    // which is also why the enterprise-price guard above must keep passing.
    const { container } = render(<SingleReportOffer />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/unlimited access/i);

    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href")
    );
    const contact = hrefs.find((h) => h?.startsWith("mailto:"));
    expect(contact).toBeTruthy();
    expect(contact).toContain("sales@dwellsy.com");
  });

  test("the unlimited option carries no price of its own", () => {
    // Only two dollar amounts belong in this block: the single report and the
    // pack. A third would mean unlimited got priced on the page.
    const { container } = render(<SingleReportOffer />);
    const text = container.textContent ?? "";
    const amounts = text.match(/\$\s*\d[\d,]*/g) ?? [];
    const distinct = [...new Set(amounts.map((a) => a.replace(/\s+/g, "")))];
    expect(distinct.sort()).toEqual(
      [
        `$${PRODUCTS.single_report.priceUsd}`,
        `$${PRODUCTS.three_pack.priceUsd}`,
      ].sort()
    );
  });

  test("all three ways in are present and distinct", () => {
    // funnel link for the single report, a real checkout button for the pack,
    // a mailto for unlimited — three different mechanisms, by design.
    const { container } = render(<SingleReportOffer />);
    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs).toContain("/report");
    expect(hrefs.some((h) => h?.startsWith("mailto:sales@dwellsy.com"))).toBe(true);
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
  });

  test("the pack can be bought directly, with no operator", () => {
    // The three-pack has no operator dependency (its credits are redeemed
    // later), so the homepage offers it as a real checkout button rather than
    // routing through the funnel. The count in the label tracks the catalog.
    render(<SingleReportOffer />);
    const n = PRODUCTS.three_pack.credits;
    const words: Record<number, string> = {
      1: "one",
      2: "two",
      3: "three",
      4: "four",
      5: "five",
      6: "six",
    };
    const word = words[n] ?? String(n);
    expect(
      screen.getByRole("button", { name: new RegExp(`${word} reports`, "i") })
    ).toBeTruthy();
  });
});
