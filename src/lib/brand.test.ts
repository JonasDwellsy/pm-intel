import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_ASSISTANT_NAME,
  PRODUCT_DOWNLOAD_SLUG,
  PRODUCT_NAME,
  PRODUCT_SHORT_NAME,
} from "@/lib/brand";

test("Dwellsy IQ Markets exposes one canonical customer-facing brand", () => {
  assert.equal(PRODUCT_NAME, "Dwellsy IQ Markets");
  assert.equal(PRODUCT_SHORT_NAME, "Markets");
  assert.equal(PRODUCT_ASSISTANT_NAME, "Ask Dwellsy IQ Markets");
  assert.equal(PRODUCT_DOWNLOAD_SLUG, "dwellsy-iq-markets");
});
