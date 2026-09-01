import { HomepageSectionHead } from "./SectionHead";

// "Questions every owner should be able to answer" — the section that sells
// the questions rather than the metrics. Each row pairs the question an asset
// manager actually asks with the observed measure that answers it, so the
// mechanism is visible without the metrics becoming the pitch. Rendering it as
// a two-column record (question | measure) rather than a bulleted list keeps
// the density institutional and lets the eye scan either column on its own.

type Row = {
  question: string;
  measure: string;
  detail: string;
};

const ROWS: Row[] = [
  {
    question: "Which operators lease fastest in my markets?",
    measure: "Lease-up speed",
    detail: "Median days on market, against the operator's peer cohort",
  },
  {
    question: "Is my operator keeping pace with its peers?",
    measure: "Peer position",
    detail: "Percentile within operators of similar type and scale",
  },
  {
    question: "Are we capturing market rent growth?",
    measure: "Rent performance",
    detail: "Year-over-year rent change vs the cohort median",
  },
  {
    question: "Is retention where it should be?",
    measure: "Tenant retention",
    detail: "Share of tenancies still in place at 18 months",
  },
  {
    question: "Is my operator improving, or slipping?",
    measure: "Trend",
    detail: "Direction of travel across monthly observations",
  },
];

export function OwnerQuestions() {
  return (
    <section className="border-t border-grid bg-white">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="What you should be able to answer"
          title="Questions every owner should be able to answer."
          context="Dwellsy IQ Markets answers these from observed market activity. The same measures, on every operator, in every market."
        />

        <div className="overflow-hidden rounded-md border border-grid">
          {ROWS.map((row, i) => (
            <div
              key={row.question}
              className={
                "grid gap-3 px-6 py-5 sm:grid-cols-[1.15fr_1fr] sm:items-baseline sm:gap-8 " +
                (i > 0 ? "border-t border-grid" : "")
              }
            >
              <p className="text-[17px] font-semibold leading-[1.35] tracking-[-0.005em] text-foreground sm:text-[18px]">
                {row.question}
              </p>
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-teal">
                  {row.measure}
                </p>
                <p className="mt-1 text-[14.5px] leading-[1.45] text-muted-foreground">
                  {row.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
