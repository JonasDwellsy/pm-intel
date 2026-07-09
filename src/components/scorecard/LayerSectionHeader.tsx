// Shared section header for Layers 2-6 on the v1.0 scorecard. Renders a
// numbered prefix ("01" through "05" matching the right-rail sidebar)
// followed by the section title at H2 size, with an optional lede
// paragraph below.
//
// Visual weight target: clearly larger than subsection titles (20px) and
// clearly smaller than the IdentityHero operator name (40-48px). Lands at
// 28-32px so the parent-child hierarchy reads at a glance.
//
// The Classic-only per-metric InfoIcon affordance (wired via a `metricKey`
// prop) was removed when Classic was retired — MethodologyFooter, the only
// surviving caller, never used it.

export function LayerSectionHeader({
  num,
  title,
  lede,
  ledeMaxWidthClass = "max-w-[780px]",
}: {
  /** Two-digit section number matching the sidebar (e.g. "01", "02"). */
  num: string;
  /** Section title in display case (e.g. "Performance dimensions"). */
  title: string;
  /** Optional paragraph rendered under the header. */
  lede?: string;
  /** Tailwind max-width class for the lede. Defaults to the standard reading
   *  width; a section whose content spans wider (e.g. Methodology's 2-col
   *  grid) can widen it so the lede doesn't read as conspicuously narrow. */
  ledeMaxWidthClass?: string;
}) {
  return (
    <header className="dq-section-header">
      <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[28px] font-bold leading-[1.1] tracking-[-0.014em] text-navy md:text-[32px]">
        <span className="dq-mono text-[20px] font-semibold text-muted-2 md:text-[22px]">
          {num}
        </span>
        <span aria-hidden className="text-[20px] text-muted-2 md:text-[22px]">
          ·
        </span>
        <span>{title}</span>
      </h2>
      {lede && (
        <p className={`mt-3 ${ledeMaxWidthClass} text-[14.5px] leading-[1.6] text-muted-foreground`}>
          {lede}
        </p>
      )}
    </header>
  );
}
