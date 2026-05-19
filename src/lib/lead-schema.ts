import { z } from "zod";

export const PROPERTY_TYPES = [
  "single-family",
  "small-mf",
  "multifamily",
  "condo",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  "single-family": "Single-family / SFR",
  "small-mf": "Small multifamily (2–4 units)",
  multifamily: "Multifamily / apartment building",
  condo: "Condo / townhome",
};

export const QUADRANTS = [
  "MF/BTR / Institutional",
  "MF/BTR / Independent",
  "Scattered / Institutional",
  "Scattered / Independent",
] as const;

// --- Form schema: what the LeadForm holds. Optional fields are plain strings
// (allowed to be "") so RHF's input type stays simple and zodResolver is happy.
export const leadFormSchema = z.object({
  marketId: z.string(),
  propertyType: z.enum(PROPERTY_TYPES, {
    message: "Please pick a property type",
  }),
  unitCount: z
    .string()
    .refine((v) => v === "" || /^[1-9]\d{0,5}$/.test(v), {
      message: "Enter a positive whole number",
    }),
  preferredQuadrant: z.string(),
  ownerName: z.string().min(2, "Please enter your name"),
  ownerEmail: z.string().email("Please enter a valid email"),
  ownerPhone: z.string(),
  notes: z.string().max(2000, "Keep it under 2000 characters"),
});
export type LeadFormValues = z.infer<typeof leadFormSchema>;

// --- API schema: cleaned + typed shape that POST /api/leads accepts.
export const leadApiSchema = z.object({
  marketId: z.string().min(1).optional(),
  propertyType: z.enum(PROPERTY_TYPES),
  unitCount: z.number().int().positive().max(100000).optional(),
  preferredQuadrant: z.enum(QUADRANTS).optional(),
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPhone: z.string().min(1).optional(),
  notes: z.string().max(2000).optional(),
  source: z.string().optional(),
});
export type LeadApiInput = z.infer<typeof leadApiSchema>;

export function leadFormToApiPayload(form: LeadFormValues): LeadApiInput {
  const preferred = form.preferredQuadrant;
  const isQuadrant = (QUADRANTS as readonly string[]).includes(preferred);
  return {
    marketId: form.marketId || undefined,
    propertyType: form.propertyType,
    unitCount: form.unitCount ? Number.parseInt(form.unitCount, 10) : undefined,
    preferredQuadrant: isQuadrant
      ? (preferred as (typeof QUADRANTS)[number])
      : undefined,
    ownerName: form.ownerName.trim(),
    ownerEmail: form.ownerEmail.trim(),
    ownerPhone: form.ownerPhone || undefined,
    notes: form.notes || undefined,
  };
}

// --- Claim schema: simple shape used both by form and API.
// v0.6.3 quick-wins — scorecard ClaimModal extends the field set with
// optional contactRole + message for richer intent capture. Both are
// optional so the existing /claim/[pmSlug] page ClaimForm (2 fields,
// name + email) continues to validate cleanly. The /api/claims handler
// logs the full payload when the optional fields are present; only the
// name + email get persisted to prisma.claim (no schema change in this
// PR — a v0.7 follow-up can add columns + a migration if claim review
// needs them queryable).
export const CLAIM_ROLES = [
  "owner",
  "manager",
  "marketing",
  "operations",
  "other",
] as const;
export type ClaimRole = (typeof CLAIM_ROLES)[number];
export const CLAIM_ROLE_LABELS: Record<ClaimRole, string> = {
  owner: "Owner / Principal",
  manager: "Property Manager",
  marketing: "Marketing",
  operations: "Operations",
  other: "Other",
};

export const claimSchema = z.object({
  pmSlug: z.string().min(1),
  contactName: z.string().min(2, "Please enter your name"),
  contactEmail: z.string().email("Please enter a valid email"),
  contactRole: z.enum(CLAIM_ROLES).optional(),
  message: z.string().max(500, "Keep it under 500 characters").optional(),
});

export type ClaimInput = z.infer<typeof claimSchema>;
