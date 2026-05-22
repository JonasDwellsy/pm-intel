// v0.12 — extracted template card grid.
//
// Both the full-page picker at /watch-lists/new and the empty-state
// of /watch-lists (anonymous user or logged-in user with no saved
// watch lists) render the same six cards: five named acquisition
// templates plus a "Start from Scratch" card. Lives here as a
// standalone server component so the surrounding page chrome
// (breadcrumb, header copy) can differ without duplicating the
// card markup.
//
// Pure server component — no client state needed since every
// card is a Link.

import Link from "next/link";
import {
  getTemplates,
  summarizeTemplate,
  type WatchListTemplate,
} from "@/lib/watch-list/templates";

export function TemplateGrid() {
  const templates = getTemplates();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templates.map((t) => (
        <TemplateCard key={t.slug} template={t} />
      ))}
      <StartFromScratchCard />
    </div>
  );
}

function TemplateCard({ template }: { template: WatchListTemplate }) {
  const summary = summarizeTemplate(template);
  const requiredCount = template.requiredCriteria.length;
  const preferredCount = template.preferredCriteria.length;
  const excludedCount = template.excludedCriteria.length;
  return (
    <Link
      href={`/watch-lists/new?template=${encodeURIComponent(template.slug)}`}
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
      href="/watch-lists/new?template=blank"
      className="group flex h-full flex-col rounded-lg border border-dashed border-grid bg-surface-soft p-5 transition-colors hover:border-navy hover:bg-white"
    >
      <h2 className="text-[17px] font-semibold leading-snug text-navy">
        Start from Scratch
      </h2>
      <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
        Custom criteria, blank slate
      </p>
      <p className="mt-3 text-[13px] leading-snug text-foreground/75">
        Build a custom watch list from a blank slate. Use this when none of the
        templates above match what you&rsquo;re tracking closely enough to be a
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
