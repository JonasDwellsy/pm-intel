// v0.10 — Template picker. Shown by /buy-boxes/new when no
// ?template= query param is set. Five template cards plus a sixth
// "Start from Scratch" card. Each card is a Link so right-click /
// cmd-click opens in a new tab; the whole card is clickable.
//
// No client interactivity is needed — the page reloads with
// ?template=<slug> and the editor mounts pre-populated. Keeping
// this a server component avoids a needless "use client" boundary
// and lets the data flow stay direct.

import Link from "next/link";
import {
  getTemplates,
  summarizeTemplate,
  type BuyBoxTemplate,
} from "@/lib/buy-box/templates";

export function TemplatePicker() {
  const templates = getTemplates();
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

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard key={t.slug} template={t} />
          ))}
          <StartFromScratchCard />
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: BuyBoxTemplate }) {
  const summary = summarizeTemplate(template);
  const requiredCount = template.requiredCriteria.length;
  const preferredCount = template.preferredCriteria.length;
  const excludedCount = template.excludedCriteria.length;
  return (
    <Link
      href={`/buy-boxes/new?template=${encodeURIComponent(template.slug)}`}
      className="group flex h-full flex-col rounded-lg border border-grid bg-white p-5 transition-shadow hover:shadow-tile-hover hover:border-teal"
    >
      <h2 className="text-[17px] font-semibold leading-snug text-navy group-hover:text-teal-700">
        {template.name}
      </h2>
      <p className="mt-1.5 text-[13px] font-medium text-teal">
        {template.tagline}
      </p>
      <p className="mt-3 text-[13px] leading-snug text-foreground/75">
        {template.description}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <CountChip label="required" color="text-bad" dot="bg-bad" value={requiredCount} />
        <CountChip
          label="preferred"
          color="text-orange-700"
          dot="bg-orange"
          value={preferredCount}
        />
        <CountChip
          label="excluded"
          color="text-muted-foreground"
          dot="bg-muted-2"
          value={excludedCount}
        />
      </div>

      {summary && (
        <p className="mt-3 line-clamp-2 text-[12px] text-muted-foreground">
          {summary}
        </p>
      )}

      <div className="mt-auto pt-5">
        <span className="inline-flex h-9 items-center rounded-md bg-teal px-4 text-[13px] font-semibold text-white group-hover:bg-teal-700">
          Use this template →
        </span>
      </div>
    </Link>
  );
}

function StartFromScratchCard() {
  return (
    <Link
      href="/buy-boxes/new?template=blank"
      className="group flex h-full flex-col rounded-lg border border-dashed border-grid bg-surface-soft p-5 transition-colors hover:border-navy hover:bg-white"
    >
      <h2 className="text-[17px] font-semibold leading-snug text-navy">
        Start from Scratch
      </h2>
      <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
        Custom criteria, blank slate
      </p>
      <p className="mt-3 text-[13px] leading-snug text-foreground/75">
        Build a custom buy box from a blank slate. Use this when none of the
        templates above match your acquisition thesis closely enough to be a
        useful starting point.
      </p>
      <div className="mt-auto pt-5">
        <span className="inline-flex h-9 items-center rounded-md border border-navy bg-white px-4 text-[13px] font-semibold text-navy group-hover:bg-navy group-hover:text-white">
          Start Blank →
        </span>
      </div>
    </Link>
  );
}

function CountChip({
  label,
  value,
  color,
  dot,
}: {
  label: string;
  value: number;
  color: string;
  dot: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block size-1.5 rounded-full ${dot}`} />
      <span className="dq-mono tabular-nums text-navy">{value}</span>
      <span className={color}>{label}</span>
    </span>
  );
}
