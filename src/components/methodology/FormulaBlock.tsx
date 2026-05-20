// JetBrains Mono formula display with a 3px navy left border. Used in the DOM,
// rent trajectory, coverage confidence, and tenancy sections. Children render
// the literal formula expression (use the inline helper components below for
// operator/comment tinting).

export function FormulaBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="my-6 rounded-[0_6px_6px_0] border-l-[3px] border-navy bg-surface-soft px-5 py-4"
      role="figure"
      aria-label={`Formula ${label}`}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-navy">
        {label}
      </p>
      <code className="dq-mono block text-[14px] leading-[1.5] text-navy">
        {children}
      </code>
    </div>
  );
}

// Inline helper: teal-tinted operator (=, −, /, etc.)
export function Op({ children }: { children: React.ReactNode }) {
  return <span className="text-teal">{children}</span>;
}
