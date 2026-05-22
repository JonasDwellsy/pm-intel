// Two-column section heading used across the homepage: eyebrow + H2 on the
// left, contextual paragraph on the right.
//
// PR #51 polish: PR #47 tightened the eyebrow → H2 gap to mt-2 (8px)
// thinking that matched the pillar-card cadence. It didn't — the
// pillar cards actually use mb-3.5 (14px) between their teal eyebrow
// and the H3 below it, and the homepage section heads were reading
// as too cramped at 8px against their 28-38px H2. mt-3.5 here
// applies the pillar-card spacing value directly, the way the user
// originally wanted in PR #47. Only the homepage uses
// HomepageSectionHead, so Methodology/Briefs/etc. are unaffected.

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
        <h2 className="dq-h2 mt-3.5 max-w-[18ch] text-balance text-[28px] leading-[1.1] tracking-[-0.014em] sm:text-[34px] lg:text-[38px]">
          {title}
        </h2>
      </div>
      <p className="max-w-[64ch] text-[16px] leading-[1.65] text-foreground/85 sm:text-[17px]">
        {context}
      </p>
    </header>
  );
}
