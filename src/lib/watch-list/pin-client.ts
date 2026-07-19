// Shared client helper for every "add operators to a watch list" flow —
// the market multi-select bar, the search-and-add modal, and the
// per-operator "+ New list" path all funnel through here so the create +
// pin contract lives in one place. Pins go through the existing
// entitlement-safe endpoints; nothing here bypasses /members' canEditList
// authorization.
//
// Create body intentionally omits `description` — the server treats it
// as optional (defaults to null, see POST /api/watch-lists), and the
// existing AddToWatchList create-flow test asserts an EXACT body with no
// `description` key. Keeping this helper's create body identical to that
// contract means AddToWatchList's refactor to call this helper doesn't
// change what goes over the wire.
export interface AddOperatorsResult {
  listId: string;
  added: number;
  failed: number;
}

export async function addOperatorsToWatchList(
  target: { listId: string } | { newName: string },
  memberKeys: readonly string[]
): Promise<AddOperatorsResult> {
  let listId: string;
  if ("listId" in target) {
    listId = target.listId;
  } else {
    const res = await fetch("/api/watch-lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: target.newName,
        requiredCriteria: [],
        preferredCriteria: [],
        excludedCriteria: [],
      }),
    });
    if (!res.ok) throw new Error(`Failed to create watch list (${res.status}).`);
    const data = (await res.json()) as { watchList: { id: string } };
    listId = data.watchList.id;
  }

  // De-dupe keys defensively; pin each. allSettled so one bad key doesn't
  // abort the batch — the caller surfaces added/failed.
  const unique = Array.from(new Set(memberKeys));
  const outcomes = await Promise.allSettled(
    unique.map(async (memberKey) => {
      const r = await fetch(`/api/watch-lists/${listId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberKey }),
      });
      if (!r.ok) throw new Error(String(r.status));
    })
  );
  const added = outcomes.filter((o) => o.status === "fulfilled").length;
  return { listId, added, failed: unique.length - added };
}
