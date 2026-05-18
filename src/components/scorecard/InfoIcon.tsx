"use client";

import { useMetricInfo } from "@/components/scorecard/MetricInfoProvider";
import {
  METRIC_DEFINITIONS,
  type MetricKey,
} from "@/lib/metric-definitions";

// Interactive "i" icon button — triggers the centralized metric info modal
// for the given metric key. Used by every per-metric affordance across
// Layers 1-5 of the v1.0 scorecard. The button is keyboard-accessible
// (Enter / Space) and surfaces the metric name on hover via the title attr.

export function InfoIcon({
  metricKey,
  className = "",
}: {
  metricKey: MetricKey;
  className?: string;
}) {
  const { open } = useMetricInfo();
  const def = METRIC_DEFINITIONS[metricKey];
  const label = `${def.name} — methodology details`;
  return (
    <button
      type="button"
      onClick={() => open(metricKey)}
      aria-label={label}
      title={label}
      className={"dq-info-icon " + className}
    >
      i
    </button>
  );
}
