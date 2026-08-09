// Scroll container for a .dq-table.
//
// WHY THIS EXISTS. `.dq-table` sets `width: 100%`, which reads as "this can
// never be wider than its column" — but width is only a suggestion to table
// layout. A table's min-content width wins, so any table whose cells hold a
// long unbreakable run (a prose "Change" column, a wide term) grows past its
// container and drags the whole page's scrollWidth with it. On a 375px phone
// the methodology page scrolled sideways as a whole: every heading and
// paragraph shifted because one table in §12 was 585px wide.
//
// The table itself cannot fix this — `overflow` on a table box does not
// establish a scroll container the way it does on a block. It needs a real
// block-level parent that clips, which is what this is.
//
// Wrapping is deliberately unconditional rather than applied only to the
// tables observed to overflow. Whether a given table fits at 375px is a
// property of its current CONTENT, not its markup: the §01 states table and
// the two weights tables fit today and would start overflowing the moment
// someone adds a longer row. Wrapping every one makes the page structurally
// safe instead of coincidentally safe.

export function TableScroll({
  children,
  /** Let the table bleed 4px into the gutter either side. The glossary opts
   *  in because it deliberately breaks the 680px reading measure and the
   *  extra sliver keeps its rounded border off the scroll container's edge.
   *  OFF by default so every other table stays flush with the prose measure
   *  it has always aligned to — wrapping must not move anything on desktop. */
  bleed = false,
}: {
  children: React.ReactNode;
  bleed?: boolean;
}) {
  return (
    <div className={bleed ? "-mx-1 overflow-x-auto" : "overflow-x-auto"}>
      {children}
    </div>
  );
}
