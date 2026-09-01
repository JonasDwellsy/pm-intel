import { HomepageSectionHead } from "./SectionHead";

// The information-asymmetry section — the reposition's core argument, and the
// first thing a visitor reads after the hero. An operator sees performance
// across its whole book; the owner sees its own assets plus whatever the
// operator reports. That's a context gap, not a trust problem, and the copy is
// deliberately non-adversarial about it: Dwellsy IQ Markets adds the outside view, it
// doesn't accuse anyone. The three columns are ordered operator → owner →
// Dwellsy IQ Markets so the third column reads as the thing that closes the gap.

type Panel = {
  heading: string;
  items: string[];
  /** The Dwellsy IQ Markets column is the resolution, so it carries the accent. */
  accent?: boolean;
  footnote?: string;
};

const PANELS: Panel[] = [
  {
    heading: "What your operator sees",
    items: [
      "Performance across its portfolio",
      "Lease-up across many properties",
      "Retention patterns",
      "Rent performance",
      "Operating trends",
    ],
  },
  {
    heading: "What you usually see",
    items: [
      "Your properties",
      "Reports the operator prepares",
      "The operator's explanations",
      "Contracted KPIs",
    ],
  },
  {
    heading: "What Dwellsy IQ Markets adds",
    accent: true,
    items: [
      "Independent benchmarks",
      "Peer comparisons",
      "Performance trends",
      "Early signals when performance moves",
      "A view across operators",
    ],
    footnote: "The outside view",
  },
];

export function BlindSpot() {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="The blind spot"
          title="Your operators know more than you do about how they're doing."
          context="An operator sees performance across its whole portfolio. You see your properties and the reports your operator prepares. No one is hiding anything; operators simply have more context. Dwellsy IQ Markets gives you the independent outside view."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {PANELS.map((panel) => (
            <div
              key={panel.heading}
              className={
                "flex flex-col rounded-md border bg-white p-7 " +
                (panel.accent
                  ? "border-teal shadow-[0_0_0_1px_rgb(14_124_134_/_0.35)_inset]"
                  : "border-grid")
              }
            >
              <h3
                className={
                  "text-[11.5px] font-semibold uppercase tracking-[0.14em] " +
                  (panel.accent ? "text-teal" : "text-muted-foreground")
                }
              >
                {panel.heading}
              </h3>
              <ul className="mt-5 flex flex-1 flex-col gap-3">
                {panel.items.map((item) => (
                  <li
                    key={item}
                    className="relative pl-5 text-[15.5px] leading-[1.45] text-foreground/90"
                  >
                    <span
                      aria-hidden
                      className={
                        "absolute left-0 top-[9px] h-1.5 w-1.5 rounded-full " +
                        (panel.accent ? "bg-teal" : "bg-muted-foreground/60")
                      }
                    />
                    {item}
                  </li>
                ))}
              </ul>
              {panel.footnote && (
                <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">
                  {panel.footnote}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
