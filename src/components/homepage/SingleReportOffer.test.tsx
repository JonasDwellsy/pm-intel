import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
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

  test("it routes to the funnel, not to checkout", () => {
    // The block cannot start a purchase: the buyer picks an operator first.
    const { container } = render(<SingleReportOffer />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/report");
    expect(hrefs.some((h) => h?.includes("checkout"))).toBe(false);
  });
});
