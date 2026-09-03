import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutButtons } from "./CheckoutButtons";

// The buttons are the last thing between a buyer and a charge, so what they
// POST matters more than how they look. marketId is gone with the market pass —
// we guard against re-adding it with a compile-time check, not runtime logic
// (see the test below).

const OFFERS = [
  { kind: "single_report" as const, label: "Get this report", priceLabel: "$149" },
  { kind: "three_pack" as const, label: "Get three reports", priceLabel: "$299" },
];

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    value: { assign: vi.fn() },
    writable: true,
  });
});

describe("CheckoutButtons", () => {
  test("renders one button per offer with its price", () => {
    render(<CheckoutButtons pmSlug="acme-denver-co" offers={OFFERS} />);
    expect(screen.getByText("Get this report")).toBeTruthy();
    expect(screen.getByText("$149")).toBeTruthy();
    expect(screen.getByText("Get three reports")).toBeTruthy();
    expect(screen.getByText("$299")).toBeTruthy();
  });

  test("posts kind, pmSlug, and partner to the checkout API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/x" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckoutButtons pmSlug="acme-denver-co" partner="bp" offers={OFFERS} />);
    await userEvent.click(screen.getByText("Get three reports"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.kind).toBe("three_pack");
    expect(body.pmSlug).toBe("acme-denver-co");
    expect(body.partner).toBe("bp");
    // Not load-bearing: JSON.stringify drops undefined keys, so this passes
    // whether or not marketId was forwarded. The real guard is compile-time (see below).
    expect("marketId" in body).toBe(false);
  });

  test("marketId is not an accepted prop (compile-time guard)", () => {
    // The checkout route removed `marketId` from its request schema. A compile-time
    // guard is the only reliable detector — JSON.stringify drops undefined-valued keys,
    // so a runtime check on the serialised body cannot catch a regression even if
    // `marketId` is re-added to CheckoutButtonsProps. This @ts-expect-error directive
    // ensures that if `marketId` is ever re-added, the directive becomes unused and
    // `tsc` reports "Unused '@ts-expect-error' directive", failing the build.
    // @ts-expect-error — marketId is no longer a CheckoutButtons prop
    render(<CheckoutButtons pmSlug="acme-denver-co" marketId="denver-co" offers={OFFERS} />);
  });

  test("surfaces an error instead of silently doing nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<CheckoutButtons pmSlug="acme-denver-co" offers={OFFERS} />);
    await userEvent.click(screen.getByText("Get this report"));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
