import { InfoIcon } from "@/components/scorecard/InfoIcon";
import type { MetricKey } from "@/lib/metric-definitions";

// Shared section header for Layers 2-6 on the v1.0 scorecard. Renders a
// numbered prefix ("01" through "05" matching the right-rail sidebar)
// followed by the section title at H2 size, with optional InfoIcon and
// optional lede paragraph below.
//
// Visual weight target: clearly larger than subsection titles (20px) and
// clearly smaller than the IdentityHero operator name (40-48px). Lands at
// 28-32px so the parent-child hierarchy reads at a glance.

export function LayerSectionHeader({
  num,
  title,
  metricKey,
  lede,
}: {
  /** Two-digit section number matching the sidebar (e.g. "01", "02"). */
  num: string;
  /** Section title in display case (e.g. "Performance dimensions"). */
  title: string;
  /** Optional MetricKey to wire an InfoIcon adjacent to the title. */
  metricKey?: MetricKey;
  /** Optional paragraph rendered under the header. */
  lede?: string;
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
        {metricKey && (
          <span className="self-center">
            <InfoIcon metricKey={metricKey} />
          </span>
        )}
      </h2>
      {lede && (
        <p className="mt-3 max-w-[780px] text-[14.5px] leading-[1.6] text-muted-foreground">
          {lede}
        </p>
      )}
    </header>
  );
}
