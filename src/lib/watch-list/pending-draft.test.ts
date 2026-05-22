// pending-draft.ts — sessionStorage-backed snapshot of in-flight buy
// box edits that survives the anon → authed sign-in round-trip.
//
// Coverage focuses on the safety rails that prevent stale or
// mismatched drafts from ambushing a fresh editor session:
//
//   - templateSlug mismatch is rejected
//   - drafts older than DRAFT_TTL_MS are rejected
//   - malformed JSON is rejected without throwing
//   - consume clears the key on read (success AND failure cases)
//   - save round-trip round-trips cleanly

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  PENDING_DRAFT_KEY,
  DRAFT_TTL_MS,
  consumePendingDraft,
  savePendingDraft,
  clearPendingDraft,
  type StorageLike,
} from "./pending-draft";

/** Minimal Map-backed sessionStorage stand-in for node:test. */
function fakeStorage(): StorageLike & { snapshot: () => Map<string, string> } {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    snapshot: () => new Map(store),
  };
}

const SAMPLE_DRAFT = {
  templateSlug: "scale-density-rollup",
  name: "My Scale Density Rollup",
  description: "tweaked from template",
  requiredCriteria: [
    { field: "urusT12", operator: "gte" as const, value: 150 },
  ],
  preferredCriteria: [],
  excludedCriteria: [],
};

test("save → consume round-trip restores the snapshot", () => {
  const storage = fakeStorage();
  savePendingDraft(storage, SAMPLE_DRAFT);
  const loaded = consumePendingDraft(storage, {
    expectedTemplateSlug: "scale-density-rollup",
  });
  assert.ok(loaded);
  assert.equal(loaded.name, SAMPLE_DRAFT.name);
  assert.equal(loaded.templateSlug, "scale-density-rollup");
  assert.deepEqual(loaded.requiredCriteria, SAMPLE_DRAFT.requiredCriteria);
});

test("consume CLEARS the storage key on success — refresh doesn't re-hydrate", () => {
  const storage = fakeStorage();
  savePendingDraft(storage, SAMPLE_DRAFT);
  consumePendingDraft(storage, {
    expectedTemplateSlug: "scale-density-rollup",
  });
  assert.equal(storage.getItem(PENDING_DRAFT_KEY), null);
});

test("consume returns null + clears when templateSlug mismatches", () => {
  const storage = fakeStorage();
  savePendingDraft(storage, SAMPLE_DRAFT);
  const loaded = consumePendingDraft(storage, {
    expectedTemplateSlug: "institutional-platform",
  });
  assert.equal(loaded, null);
  // Mismatched draft is dropped even though it didn't match — keeps
  // stale stuff from shadowing future templates.
  assert.equal(storage.getItem(PENDING_DRAFT_KEY), null);
});

test("consume returns null + clears when timestamp is older than TTL", () => {
  const storage = fakeStorage();
  savePendingDraft(storage, SAMPLE_DRAFT);
  const writtenAt = Date.now();
  const loaded = consumePendingDraft(storage, {
    expectedTemplateSlug: "scale-density-rollup",
    now: writtenAt + DRAFT_TTL_MS + 1,
  });
  assert.equal(loaded, null);
  assert.equal(storage.getItem(PENDING_DRAFT_KEY), null);
});

test("consume returns the draft when timestamp is within TTL", () => {
  const storage = fakeStorage();
  savePendingDraft(storage, SAMPLE_DRAFT);
  const writtenAt = Date.now();
  const loaded = consumePendingDraft(storage, {
    expectedTemplateSlug: "scale-density-rollup",
    now: writtenAt + DRAFT_TTL_MS - 1000,
  });
  assert.ok(loaded);
});

test("consume returns null when storage is empty", () => {
  const storage = fakeStorage();
  const loaded = consumePendingDraft(storage, {
    expectedTemplateSlug: "scale-density-rollup",
  });
  assert.equal(loaded, null);
});

test("consume returns null + clears on malformed JSON without throwing", () => {
  const storage = fakeStorage();
  storage.setItem(PENDING_DRAFT_KEY, "{not valid json");
  const loaded = consumePendingDraft(storage, {
    expectedTemplateSlug: "anything",
  });
  assert.equal(loaded, null);
  assert.equal(storage.getItem(PENDING_DRAFT_KEY), null);
});

test("consume returns null on wrong-shape payload (missing fields)", () => {
  const storage = fakeStorage();
  storage.setItem(
    PENDING_DRAFT_KEY,
    JSON.stringify({ version: 1, templateSlug: "foo" })
  );
  const loaded = consumePendingDraft(storage, {
    expectedTemplateSlug: "foo",
  });
  assert.equal(loaded, null);
});

test("consume returns null on wrong version (forward-compat guard)", () => {
  const storage = fakeStorage();
  storage.setItem(
    PENDING_DRAFT_KEY,
    JSON.stringify({
      version: 99,
      templateSlug: "scale-density-rollup",
      name: "x",
      description: null,
      requiredCriteria: [],
      preferredCriteria: [],
      excludedCriteria: [],
      timestamp: Date.now(),
    })
  );
  const loaded = consumePendingDraft(storage, {
    expectedTemplateSlug: "scale-density-rollup",
  });
  assert.equal(loaded, null);
});

test("clearPendingDraft removes the key (save-success belt-and-suspenders)", () => {
  const storage = fakeStorage();
  savePendingDraft(storage, SAMPLE_DRAFT);
  clearPendingDraft(storage);
  assert.equal(storage.getItem(PENDING_DRAFT_KEY), null);
});

test("clearPendingDraft is a no-op when the key wasn't set", () => {
  const storage = fakeStorage();
  // Should not throw.
  clearPendingDraft(storage);
  assert.equal(storage.getItem(PENDING_DRAFT_KEY), null);
});

test("savePendingDraft tolerates storage exceptions (private mode etc.)", () => {
  const broken: StorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  };
  // Should not throw.
  savePendingDraft(broken, SAMPLE_DRAFT);
});

test("save → consume preserves description=null distinct from empty string", () => {
  const storage = fakeStorage();
  savePendingDraft(storage, { ...SAMPLE_DRAFT, description: null });
  const loaded = consumePendingDraft(storage, {
    expectedTemplateSlug: "scale-density-rollup",
  });
  assert.ok(loaded);
  assert.equal(loaded.description, null);
});
