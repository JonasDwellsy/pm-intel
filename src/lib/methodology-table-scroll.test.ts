import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Drift guard for the mobile table-overflow fix.
//
// `.dq-table` declares `width: 100%`, which reads like a promise it can never
// outgrow its column — but width is only a suggestion to table layout, and a
// table's min-content width wins. A single unwrapped table in §12 (585px of
// "Version | Date | Change") made the whole methodology page 617px wide on a
// 375px phone, so every heading and paragraph slid sideways.
//
// The failure is invisible in review: the markup looks identical to the tables
// that behave, and whether any given one overflows depends on its CONTENT.
// That is exactly what a source-level guard is for — it catches the next table
// added without a wrapper, before a phone does.

function src(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const PAGE = "src/app/methodology/page.tsx";

test("every dq-table on the methodology page sits inside a TableScroll", () => {
  const s = src(PAGE);
  const tables = (s.match(/<table className="dq-table">/g) ?? []).length;
  assert.ok(tables > 0, "expected dq-tables on the methodology page");

  // Each table must be immediately preceded by a TableScroll open tag,
  // ignoring the whitespace between them.
  const wrapped = (s.match(/<TableScroll[^>]*>\s*<table className="dq-table">/g) ?? [])
    .length;
  assert.equal(
    wrapped,
    tables,
    `${tables - wrapped} table(s) on ${PAGE} are missing a <TableScroll> wrapper — ` +
      "an unwrapped dq-table makes the whole page scroll sideways on a phone"
  );
});

test("the glossary table is wrapped too", () => {
  const s = src("src/components/methodology/GlossaryTable.tsx");
  assert.match(s, /<TableScroll bleed>\s*<table className="dq-table">/);
});

test("only the glossary opts into the gutter bleed", () => {
  // The bleed shifts a table 4px wider than the prose measure on both sides.
  // The glossary has always done that deliberately; applying it to the rest
  // would silently move four tables out of alignment on desktop.
  const s = src(PAGE);
  assert.equal(
    (s.match(/<TableScroll bleed>/g) ?? []).length,
    0,
    "methodology page tables must align with the prose measure — no bleed"
  );
});

test("TableScroll defaults to no bleed", () => {
  const s = src("src/components/methodology/TableScroll.tsx");
  assert.match(s, /bleed = false/);
  // The wrapper is only useful if it actually establishes a scroll container.
  assert.match(s, /overflow-x-auto/);
});
