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
    // main hesitation about a pack they cannot fully redeem today.
    const { container } = render(<SingleReportOffer />);
    expect((container.textContent ?? "").toLowerCase()).toContain("expire");
  });

  test("it does not name a price for the enterprise product", () => {
    // Enterprise is priced by conversation. A number here would anchor it.
    const text = render(<SingleReportOffer />).container.textContent ?? "";
    expect(/\$\d[\d,]*\s*(\/|per\s)?\s*(mo|month|year|yr)/i.test(text)).toBe(false);
  });

  test("it routes to the funnel, not to checkout", () => {
    // The block cannot start a purchase: the buyer picks an operator first.
    const { container } = render(<SingleReportOffer />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/report");
    expect(hrefs.some((h) => h?.includes("checkout"))).toBe(false);
  });
});
