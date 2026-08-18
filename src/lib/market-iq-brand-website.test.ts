import assert from "node:assert/strict";
import test from "node:test";
import { chooseWebsitePalette, extractWebsiteColors, normalizePublicWebsite } from "./market-iq/brand/website";

test("normalizes a website entered without a scheme", () => {
  assert.equal(normalizePublicWebsite("example.com/contact"), "https://example.com/contact");
  assert.equal(normalizePublicWebsite("https://example.com"), "https://example.com");
});

test("extracts CSS colors and chooses distinct usable brand colors", () => {
  const colors = extractWebsiteColors("body{color:#173b57;background:rgb(244, 244, 244)} .cta{background:#d56b28}");
  assert.deepEqual(colors, ["#173b57", "#d56b28", "#f4f4f4"]);
  assert.deepEqual(chooseWebsitePalette(colors), { primaryColor: "#173b57", accentColor: "#d56b28" });
});
