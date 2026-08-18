import { describe, expect, it } from "vitest";
import { isValidMarketIqRecipientEmail, normalizeMarketIqRecipientEmail } from "./email";

describe("Market IQ recipient email hygiene", () => {
  it("normalizes ordinary business email addresses", () => {
    expect(normalizeMarketIqRecipientEmail("  Jonas+Reports@Dwellsy.COM ")).toBe("jonas+reports@dwellsy.com");
  });

  it.each([
    "person@example.com",
    "first.last+market@example.co.uk",
    "recipient@xn--bcher-kva.example",
  ])("accepts %s", (email) => {
    expect(isValidMarketIqRecipientEmail(email)).toBe(true);
  });

  it.each([
    "person@example",
    "person @example.com",
    ".person@example.com",
    "person..name@example.com",
    "person@-example.com",
    "person@example-.com",
    "person@example.c",
    "person@@example.com",
  ])("rejects %s", (email) => {
    expect(isValidMarketIqRecipientEmail(email)).toBe(false);
  });
});
