import { clearFindingFeedback, saveFindingFeedback } from "@/app/today/feedback-actions";
import { FINDING_FEEDBACK_LABELS, type FindingFeedbackRating } from "@/lib/portfolio-iq/finding-feedback";

export function FindingFeedbackControl({
  signalId,
  currentRating,
  compact = false,
}: {
  signalId: string;
  currentRating?: string | null;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-4 border-t border-grid pt-4" : "rounded-xl border border-grid bg-white p-5 sm:p-6"}>
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Help tune your attention queue</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Your response changes only your view. Wrong context also creates a correction for the launch team.</p>
      <form action={saveFindingFeedback} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="signalId" value={signalId} />
        <button name="rating" value="useful" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white">Useful</button>
        <select name="rating" defaultValue={currentRating && currentRating !== "useful" ? currentRating : "immaterial"} aria-label="Reason to hide this finding" className="rounded-md border border-grid bg-white px-3 py-2 text-xs text-navy">
          {(Object.entries(FINDING_FEEDBACK_LABELS) as Array<[FindingFeedbackRating, string]>).filter(([rating]) => rating !== "useful").map(([rating, label]) => <option key={rating} value={rating}>{label}</option>)}
        </select>
        <button className="rounded-md border border-grid bg-white px-3 py-2 text-xs font-semibold text-navy">Hide from my queue</button>
      </form>
      {currentRating && <form action={clearFindingFeedback} className="mt-2"><input type="hidden" name="signalId" value={signalId} /><button className="text-xs font-semibold text-teal-700 hover:underline">Clear my response</button></form>}
    </div>
  );
}
