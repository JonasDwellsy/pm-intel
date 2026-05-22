import type { Metadata } from "next";
import { WatchListEditor, type StarterDraft } from "@/components/watch-list/WatchListEditor";
import { TemplatePicker } from "@/components/watch-list/TemplatePicker";
import { listMarketOptions } from "@/lib/watch-list/editor-options";
import { getTemplateBySlug } from "@/lib/watch-list/templates";

// /watch-lists/new
//
// v0.10 — Default is the template picker (5 acquisition-thesis
// templates + "Start from Scratch"). Each picker card navigates
// back to this same route with ?template=<slug>; the page reads
// the param and either:
//
//   - template === "blank"          → renders the blank editor
//   - template is a known slug      → clones the template into a
//                                     starterDraft and renders
//                                     the editor pre-populated
//   - template is unknown / missing → renders the picker
//
// The clone uses templates.getTemplateBySlug() which returns a
// deep copy, so editor mutations cannot bleed back into the
// underlying template definitions.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New watch list",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ template?: string }>;
}

export default async function NewWatchListPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const templateSlug = params.template;

  // No param → picker.
  if (!templateSlug) {
    return <TemplatePicker />;
  }

  // Blank → existing v0.8.1 behavior.
  if (templateSlug === "blank") {
    const marketOptions = await listMarketOptions();
    return (
      <WatchListEditor
        initial={null}
        templateSlug="blank"
        marketOptions={marketOptions}
      />
    );
  }

  // Known slug → clone into starterDraft. Unknown slug falls
  // through to the picker so a stale link doesn't trap the user
  // on a broken state.
  const template = getTemplateBySlug(templateSlug);
  if (!template) {
    return <TemplatePicker />;
  }

  const marketOptions = await listMarketOptions();
  const starter: StarterDraft = {
    // "[Template Name] — Untitled" so the validation rule (3+ chars)
    // is satisfied immediately but the suffix nudges the user to
    // rename before they hit save.
    name: `${template.name} — Untitled`,
    description: template.description,
    requiredCriteria: template.requiredCriteria,
    preferredCriteria: template.preferredCriteria,
    excludedCriteria: template.excludedCriteria,
  };
  return (
    <WatchListEditor
      initial={null}
      starterDraft={starter}
      templateSlug={templateSlug}
      marketOptions={marketOptions}
    />
  );
}
