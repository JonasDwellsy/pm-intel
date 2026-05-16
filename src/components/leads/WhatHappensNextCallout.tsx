type Step = {
  num: string;
  text: string;
};

const STEPS: Step[] = [
  {
    num: "1",
    text: "We match you with three operators based on the structural profile of your property and your operator preference.",
  },
  {
    num: "2",
    text: "You receive an email within 1–2 business days with the three matches and links to their full scorecards.",
  },
  {
    num: "3",
    text: "You reach out to the operators that resonate. No obligation, no fee, no automated outreach on your behalf.",
  },
];

// Editorial "what happens next" callout shown below the lead form. Muted-paper
// background, three numbered steps in a row.
export function WhatHappensNextCallout() {
  return (
    <aside className="mt-8 rounded-lg bg-[#F4F2EC] p-9 sm:p-10">
      <p className="mb-6 text-[11px] font-bold uppercase tracking-[0.14em] text-teal">
        What happens next
      </p>
      <ol className="grid gap-7 md:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.num} className="flex items-start gap-4">
            <span
              className="dq-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#C8CDD6] bg-white text-[13px] font-semibold text-navy"
              aria-hidden
            >
              {s.num}
            </span>
            <p className="text-[14px] leading-[1.55] text-navy/85">{s.text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-7 border-t border-[#E6E2D6] pt-5 text-[12.5px] italic text-muted-foreground">
        By submitting, you agree to our privacy policy and terms. We share your
        property type, market, and contact details with the matched operators
        only — never with operators outside the match list.
      </p>
    </aside>
  );
}
