// Reusable methodology section wrapper. Renders the eyebrow / H2 / 56×2 teal
// underline / lede header, plus the body slot at the spec's 680px reading
// measure. The anchor `id` is preserved for cross-page links from the
// scorecards and homepage.

export function SectionAnchor({
  id,
  num,
  title,
  lede,
  children,
}: {
  id: string;
  num: string;
  title: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-toc-section={id}
      className="scroll-mt-24 border-t border-grid pt-14 first:border-t-0 first:pt-0"
    >
      <header className="mb-8">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-teal">
          Section {num}
        </p>
        <h2 className="mt-2 max-w-[680px] text-[28px] font-bold leading-[1.18] tracking-[-0.018em] text-navy sm:text-[32px]">
          {title}
        </h2>
        <div className="mt-4 h-0.5 w-14 bg-teal" />
        {lede && (
          <p className="mt-6 max-w-[680px] text-[19px] leading-[1.55] text-foreground/85">
            {lede}
          </p>
        )}
      </header>
      <div className="methodology-prose max-w-[680px]">{children}</div>
    </section>
  );
}
