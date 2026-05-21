// v0.10 — Template picker. Shown by /buy-boxes/new when no
// ?template= query param is set. Five template cards plus a sixth
// "Start from Scratch" card. Each card is a Link so right-click /
// cmd-click opens in a new tab; the whole card is clickable.
//
// v0.12 split: the card grid itself lives in TemplateGrid.tsx so
// the /buy-boxes empty state can reuse the same cards without the
// full-page chrome (breadcrumb, large H1, prose intro).

import Link from "next/link";
import { TemplateGrid } from "./TemplateGrid";

export function TemplatePicker() {
  return (
    <div className="bg-background">
      <div className="mx-auto max-w-[1180px] px-6 py-12">
        <Link
          href="/buy-boxes"
          className="text-[12.5px] font-medium text-teal hover:text-teal-700 hover:underline"
        >
          ← All buy boxes
        </Link>

        <header className="mt-4 max-w-[68ch]">
          <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
            Buy Box · v0.10 templates
          </p>
          <h1 className="mt-2 text-[30px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy sm:text-[36px]">
            Start a new buy box
          </h1>
          <p className="mt-3 text-[14.5px] text-foreground/80">
            Clone a named acquisition strategy or build a custom set of
            criteria from scratch. Cloned templates are fully editable — pick
            the closest match and tweak from there.
          </p>
        </header>

        <div className="mt-10">
          <TemplateGrid />
        </div>
      </div>
    </div>
  );
}
