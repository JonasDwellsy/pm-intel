// Two-column section heading used across the homepage: eyebrow + H2 on the
// left, contextual paragraph on the right.
//
// PR #47 polish: the eyebrow → headline gap was mt-4 (16px), which
// visually drifted off the headline because the H2 is 28-38px. The
// MethodologyPillars cards use mb-3.5 between eyebrow and h3 — and
// the H3 is only 22px there, so the gap reads tighter even at the
// same px count. Tightening to mt-2 (8px) here brings the home-page
// section heads in line with the pillar-card cadence the user is
// asking us to match.

export function HomepageSectionHead({
  eyebrow,
  title,
  context,
}: {
  eyebrow: string;
  title: string;
  context: string;
}) {
  return (
    <header className="mb-14 grid items-end gap-7 lg:grid-cols-[1fr_1.2fr] lg:gap-14">
      <div>
        <p className="dq-eyebrow tracking-[0.16em]">{eyebrow}</p>
        <h2 className="dq-h2 mt-2 max-w-[18ch] text-balance text-[28px] leading-[1.1] tracking-[-0.014em] sm:text-[34px] lg:text-[38px]">
          {title}
        </h2>
      </div>
      <p className="max-w-[64ch] text-[16px] leading-[1.65] text-foreground/85 sm:text-[17px]">
        {context}
      </p>
    </header>
  );
}
