// An illustration of the monthly change alert, shown beneath the three jobs so
// the recurring value is tangible rather than described. Two deliberate calls:
//
//  1. The operator is a placeholder ("ABC Property Management"), not a real
//     one. A named operator on a public marketing surface would put a real
//     company's declining metric on the homepage, and it would collide with the
//     rule against featuring Dwellsy data clients on public pages.
//  2. The styling is amber, never red, and the closing line points at a
//     conversation rather than a verdict. A signal that reads as an accusation
//     makes the product feel adversarial toward operators, which is exactly the
//     posture the positioning avoids.

const FIGURES: Array<{ label: string; value: string; emphasis?: boolean }> = [
  { label: "Median DOM", value: "34 days", emphasis: true },
  { label: "Peer median", value: "24 days" },
  { label: "Last quarter", value: "25 days" },
];

export function PerformanceAlert() {
  return (
    <div className="mt-14">
      <p className="mb-4 text-center text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        What a monthly signal looks like
      </p>
      <div className="mx-auto max-w-[620px] overflow-hidden rounded-md border border-grid border-l-4 border-l-[#B26B00] bg-white shadow-[0_8px_24px_rgb(15_31_63_/_0.06)]">
        <div className="flex items-center justify-between gap-3 border-b border-grid px-6 py-3.5">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#B26B00]">
            Monthly signal
          </p>
          <p className="text-[12.5px] text-muted-foreground">
            Phoenix, AZ MSA · August 2026
          </p>
        </div>

        <div className="px-6 py-5">
          <p className="text-[18px] font-semibold tracking-[-0.005em]">
            ABC Property Management
          </p>
          <p className="mt-2 text-[15px] leading-[1.5] text-foreground/85">
            Lease-up has eased from the{" "}
            <span className="font-semibold">71st</span> to the{" "}
            <span className="font-semibold">38th percentile</span> among Phoenix
            peers over the last 90 days.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-grid bg-grid">
            {FIGURES.map((f) => (
              <div key={f.label} className="bg-white px-3.5 py-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {f.label}
                </p>
                <p
                  className={
                    "dq-tnum mt-1 text-[19px] font-bold " +
                    (f.emphasis ? "text-[#B26B00]" : "text-foreground")
                  }
                >
                  {f.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-grid px-6 py-3.5">
          <p className="text-[13.5px] italic text-muted-foreground">
            Worth a conversation with your operator.
          </p>
          <span className="text-[13.5px] font-semibold text-teal">
            View performance →
          </span>
        </div>
      </div>
      <p className="mt-3 text-center text-[12.5px] italic text-muted-foreground">
        Illustrative example. Operator name is a placeholder.
      </p>
    </div>
  );
}
