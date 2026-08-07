import {
  searchReportedSizeTargets,
  loadReportedSizes,
} from "@/lib/operators/reported-size.server";
import { ReportedSizeForm } from "./ReportedSizeForm";

// Admin → Reported sizes. Captures what an operator says they manage, so the
// size estimator has ground truth to be checked against.
//
// Calibration against the first three of these (Fischer 1,400 vs 790 estimated;
// Riparian 950 across four markets; Income Property Specialists 3,000 vs 803)
// showed the gap is dominated by coverage — units that never list with Dwellsy
// — which no multiplier recovers. So the path forward isn't a better formula,
// it's more of these. They currently live in a chat transcript.
//
// Auth: gated by src/app/admin/layout.tsx.

export const dynamic = "force-dynamic";

export default async function AdminSizesPage() {
  const entries = await loadReportedSizes();
  // Computed server-side so the date input's default and max don't depend on
  // the admin's clock.
  const today = new Date().toISOString().slice(0, 10);

  async function search(query: string) {
    "use server";
    return searchReportedSizeTargets(query);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-16">
      <h1 className="text-[20px] font-semibold text-navy mb-1">
        Operator-reported sizes
      </h1>
      <p className="text-[13px] text-grey-600 mb-6">
        Record what an operator tells you they manage. This is inert by design —
        it never changes a displayed figure, a size band, a cohort, or a rank.
        Its job is to be the yardstick the estimator gets measured against, and a
        number folded into the estimate can no longer measure it.
      </p>
      <ReportedSizeForm search={search} entries={entries} today={today} />
    </div>
  );
}
