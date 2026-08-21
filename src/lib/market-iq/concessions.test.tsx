import { describe, expect, it } from "vitest";
import { parseAdvertisedConcession } from "./concessions";

describe("advertised concession parsing", () => {
  it.each([
    ["Apply today and receive one month free on a 13-month lease.", "free_rent", "Free-rent offer"],
    ["Limited move-in special for select homes. Restrictions apply.", "move_in_special", "Move-in special"],
    ["Receive a $500 rent credit when you move in by Friday.", "rent_credit", "Rent credit"],
    ["Application fee waived for leases signed this week.", "fee_waiver", "Fee waiver"],
    ["Ask about our deposit special on approved credit.", "deposit_special", "Deposit special"],
  ])("classifies observed offer language: %s", (text, kind, label) => {
    expect(parseAdvertisedConcession(text)).toMatchObject({ kind, label });
  });

  it.each([
    "Visit our leasing office for details.",
    "Move in ready apartment with free parking.",
    "Special features include a renovated kitchen.",
    "Credit and background checks are required.",
  ])("rejects non-concession language: %s", (text) => {
    expect(parseAdvertisedConcession(text)).toBeNull();
  });

  it.each([
    "No free month is offered.",
    "There is no move-in special at this time.",
    "The application fee is not waived.",
    "No credit is available.",
    "Apply without a rent credit.",
    "The application fee isn't waived.",
  ])("rejects negated concession language: %s", (text) => {
    expect(parseAdvertisedConcession(text)).toBeNull();
  });

  it("does not let an earlier unrelated negation suppress a real offer", () => {
    expect(parseAdvertisedConcession("No pets are permitted at this community. Apply today for one month free.")).toMatchObject({ kind: "free_rent" });
  });

  it("returns a short evidence excerpt rather than the full listing text", () => {
    const concession = parseAdvertisedConcession(`${"A spacious apartment. ".repeat(12)}Apply now for two months free. ${"Terms apply. ".repeat(12)}`);
    expect(concession?.evidence).toMatch(/two months free/i);
    expect(concession?.evidence.startsWith("…")).toBe(true);
    expect(concession?.evidence.endsWith("…")).toBe(true);
    expect(concession?.evidence.length).toBeLessThan(180);
  });
});
