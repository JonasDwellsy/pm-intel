// Three-column definitional table used by the Glossary section (10). Reuses
// the dq-table chrome but lets the table break the 680px reading measure
// since terms + definitions read better with a wider column.

export type GlossaryRow = {
  term: string;
  definition: string;
  ref: string;
};

export function GlossaryTable({ rows }: { rows: GlossaryRow[] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="dq-table">
        <thead>
          <tr>
            <th className="w-[180px]">Term</th>
            <th>Definition</th>
            <th className="w-[140px]">Methodology</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.term}>
              <td className="whitespace-nowrap font-semibold text-navy">
                {r.term}
              </td>
              <td className="text-foreground/85">{r.definition}</td>
              <td className="dq-mono whitespace-nowrap text-[12px] text-muted-foreground">
                {r.ref}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
