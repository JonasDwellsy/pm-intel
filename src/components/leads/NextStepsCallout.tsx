// Editorial diligence callout shown below the match list on the confirmation
// page. Five questions, mono-numbered, hairline-separated.

const QUESTIONS: string[] = [
  "What is your fee structure, and are there any pass-through charges I should expect month to month?",
  "How do you handle maintenance escalations after hours, and what's your response time for an unplanned vacancy?",
  "What's your typical days-on-market for a unit like mine, and how do you decide when to drop the price?",
  "How do you screen tenants, and what's your eviction rate over the last twelve months?",
  "Can I see a sample owner statement and the renewal-rate data for properties of my type in your portfolio?",
];

export function NextStepsCallout() {
  return (
    <aside className="mt-10 rounded-lg bg-[#F4F2EC] p-9 sm:p-11">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal">
        What to ask
      </p>
      <h2 className="mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.014em] text-navy sm:text-[28px]">
        Questions to ask before hiring a property manager.
      </h2>
      <ol className="mt-6 list-none border-t border-[#E6E2D6] p-0">
        {QUESTIONS.map((q, i) => (
          <li
            key={i}
            className="flex gap-5 border-t border-[#E6E2D6] py-4 first:border-t-0"
          >
            <span
              className="dq-mono pt-0.5 text-[12px] font-medium tracking-[0.04em] text-teal"
              aria-hidden
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="text-[15px] leading-[1.55] text-navy/90">{q}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
