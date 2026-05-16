export function InstitutionCTA() {
  return (
    <section>
      <div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-16 lg:py-24">
        <div className="grid gap-10 rounded-lg bg-navy p-10 text-white lg:grid-cols-[1.2fr_1fr] lg:gap-16 lg:p-14">
          <div>
            <p
              className="text-[11.5px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "#6FB3C6" }}
            >
              For institutions
            </p>
            <h2 className="mt-4 max-w-[22ch] text-balance text-[26px] font-bold leading-[1.1] tracking-[-0.014em] sm:text-[32px] lg:text-[38px]">
              Coming: enterprise platform for lenders, aggregators, and PM
              consolidators.
            </h2>
            <p className="mt-5 max-w-[60ch] text-[16px] leading-[1.6] sm:text-[17px]" style={{ color: "rgba(255,255,255,0.78)" }}>
              Programmatic access, multi-market scorecards, portfolio
              surveillance, and watchlist alerts for institutional users.
              Currently in design partner phase with a small group of DSCR
              lenders, SFR aggregators, and BTR developers.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 lg:items-end">
            <a
              href="mailto:intel@dwellsy.com?subject=Dwellsy%20IQ%20%E2%80%94%20Early%20access"
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/40 bg-transparent px-6 text-[14.5px] font-semibold text-white transition-colors hover:bg-white hover:text-navy"
            >
              Request early access →
            </a>
            <p
              className="max-w-[42ch] text-[12px] lg:text-right"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              Limited design partner cohort · 2026
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
