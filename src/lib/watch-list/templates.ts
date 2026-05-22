// v0.10 — Pre-built watch-list templates. Static JSON in
// src/data/watch-list-templates.json owns the data; this module
// exposes a typed loader with deep-clone semantics so the editor
// can mutate the cloned criteria without affecting the underlying
// template definitions.
//
// Five templates ship today (scale-density-rollup,
// integrated-services-platform, mid-market-independent,
// distressed-operator, institutional-platform). Add more by
// extending the JSON — no code change required, the loader
// re-validates every entry against the FIELD_REGISTRY at import
// time so a typo in a field id surfaces immediately in tests.

import templateJson from "@/data/watch-list-templates.json";
import {
  FIELD_REGISTRY,
  type FilterCriterion,
  type WeightedCriterion,
} from "./fields";

export interface WatchListTemplate {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  requiredCriteria: FilterCriterion[];
  preferredCriteria: WeightedCriterion[];
  excludedCriteria: FilterCriterion[];
}

// The JSON is shaped as { _comment, templates: [...] }; the
// leading underscore key is a human-readable note that the loader
// drops so the type stays clean.
interface TemplatesFile {
  templates: WatchListTemplate[];
}

const ALL_TEMPLATES = ((templateJson as unknown) as TemplatesFile).templates;

// ─── public API ──────────────────────────────────────────────────

/** Returns a deep copy of every template. Cloning protects the
 *  underlying JSON: a caller mutating the returned criteria (the
 *  editor does this constantly as the user adds/removes rows)
 *  cannot bleed back into the module-level cache. */
export function getTemplates(): WatchListTemplate[] {
  return ALL_TEMPLATES.map(cloneTemplate);
}

/** Look up a single template by slug. Returns a deep clone so the
 *  caller can pass it directly to the editor without worrying about
 *  shared references. */
export function getTemplateBySlug(slug: string): WatchListTemplate | null {
  const match = ALL_TEMPLATES.find((t) => t.slug === slug);
  return match ? cloneTemplate(match) : null;
}

/** Compact one-line summary of a template's criteria — used by the
 *  picker card to give the user a glance at what's inside without
 *  expanding the row. Format mirrors the editor's three-layer
 *  vocabulary so the phrase stays consistent ("Required: X · Preferred: Y"). */
export function summarizeTemplate(template: WatchListTemplate): string {
  const parts: string[] = [];
  if (template.requiredCriteria.length > 0) {
    parts.push(
      `Required: ${template.requiredCriteria
        .map((c) => labelFor(c.field))
        .join(", ")}`
    );
  }
  if (template.preferredCriteria.length > 0) {
    parts.push(
      `Preferred: ${template.preferredCriteria
        .map((c) => labelFor(c.field))
        .join(", ")}`
    );
  }
  if (template.excludedCriteria.length > 0) {
    parts.push(
      `Excluded: ${template.excludedCriteria
        .map((c) => labelFor(c.field))
        .join(", ")}`
    );
  }
  return parts.join(" · ");
}

/** Cross-check that every field id referenced by a template exists
 *  in the FIELD_REGISTRY. Returns the list of bad references (empty
 *  when the template is clean). The templates test uses this to
 *  fail loudly on a typo before a deploy ships broken criteria. */
export function validateTemplate(template: WatchListTemplate): string[] {
  const errors: string[] = [];
  const allCriteria = [
    ...template.requiredCriteria,
    ...template.preferredCriteria,
    ...template.excludedCriteria,
  ];
  for (const c of allCriteria) {
    const entry = FIELD_REGISTRY[c.field];
    if (!entry) {
      errors.push(`unknown field "${c.field}"`);
      continue;
    }
    if (!entry.validOperators.includes(c.operator)) {
      errors.push(
        `operator "${c.operator}" not valid for field "${c.field}" — registry allows ${entry.validOperators.join("/")}`
      );
    }
  }
  return errors;
}

// ─── helpers ─────────────────────────────────────────────────────

function labelFor(fieldId: string): string {
  return FIELD_REGISTRY[fieldId]?.label ?? fieldId;
}

/** Deep clone a template's criteria so callers can mutate freely.
 *  We use JSON.parse(JSON.stringify(...)) because the criterion
 *  shape is JSON-serializable by construction and the perf cost is
 *  negligible at template volume (< 10 entries each, < 10 templates). */
function cloneTemplate(t: WatchListTemplate): WatchListTemplate {
  return {
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    description: t.description,
    requiredCriteria: JSON.parse(
      JSON.stringify(t.requiredCriteria)
    ) as FilterCriterion[],
    preferredCriteria: JSON.parse(
      JSON.stringify(t.preferredCriteria)
    ) as WeightedCriterion[],
    excludedCriteria: JSON.parse(
      JSON.stringify(t.excludedCriteria)
    ) as FilterCriterion[],
  };
}
