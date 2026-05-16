// Three-up "Why claim your profile" tile grid. Uses the existing dq-tile
// surface with the dq-tile-numbered modifier that disables its top teal
// hairline (the claim tiles carry a numeric eyebrow instead).

const BENEFITS = [
  {
    num: "01",
    title: "Review your scorecard.",
    body: "See exactly what owners and institutional buyers see when they look you up on Dwellsy IQ.",
  },
  {
    num: "02",
    title: "Respond to the data.",
    body: "Add operator-supplied context, marketing materials, and corrections to your profile.",
  },
  {
    num: "03",
    title: "Receive owner-matched leads.",
    body: "Owners matched to your quadrant and market send inquiries through Dwellsy IQ. Claimed profiles get them first.",
  },
] as const;

export function BenefitTiles() {
  return (
    <section className="mt-16 max-md:mt-10">
      <span className="dq-eyebrow-muted">Why claim your profile</span>
      <div className="mt-[22px] grid grid-cols-3 gap-4 max-md:mt-4 max-md:grid-cols-1 max-md:gap-3">
        {BENEFITS.map((b) => (
          <article
            key={b.num}
            className="dq-tile dq-tile-numbered flex min-h-[200px] flex-col rounded-[14px] border px-[22px] pb-[26px] pt-6 max-md:min-h-0 max-md:px-5 max-md:py-5"
            style={{ borderColor: "var(--color-warm-grid)" }}
          >
            <span className="dq-tile-num">{b.num}</span>
            <h3 className="dq-tile-title">{b.title}</h3>
            <p className="dq-tile-body max-md:mt-1 md:mt-auto">{b.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
