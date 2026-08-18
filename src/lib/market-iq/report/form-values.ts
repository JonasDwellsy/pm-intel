import type { MarketIqReportBrandInput } from "@/lib/market-iq/report/composer.server";
import type { MarketIqEditorialDefaults } from "@/lib/market-iq/report/composer.server";
import { isValidMarketIqRecipientEmail } from "@/lib/market-iq/recipients/email";

export function marketIqClipped(value: FormDataEntryValue | null, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

export function marketIqOptionalUrl(value: FormDataEntryValue | null) {
  const raw = marketIqClipped(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function marketIqColor(value: FormDataEntryValue | null, fallback: string) {
  const raw = marketIqClipped(value, 7);
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toUpperCase() : fallback;
}

export function marketIqValidEmail(value: string) {
  return isValidMarketIqRecipientEmail(value);
}

export function parseMarketIqBrandForm(formData: FormData): MarketIqReportBrandInput {
  const displayName = marketIqClipped(formData.get("displayName"), 120);
  if (displayName.length < 2) throw new Error("Enter the firm name shown to clients.");
  const contactEmail = marketIqClipped(formData.get("contactEmail"), 254) || null;
  if (contactEmail && !marketIqValidEmail(contactEmail)) throw new Error("Enter a valid contact email.");
  const logoRaw = marketIqClipped(formData.get("logoUrl"), 500);
  const websiteRaw = marketIqClipped(formData.get("websiteUrl"), 500);
  const brand = {
    displayName,
    logoUrl: marketIqOptionalUrl(formData.get("logoUrl")),
    primaryColor: marketIqColor(formData.get("primaryColor"), "#173B57"),
    accentColor: marketIqColor(formData.get("accentColor"), "#B96D3A"),
    contactName: marketIqClipped(formData.get("contactName"), 120) || null,
    contactEmail,
    contactPhone: marketIqClipped(formData.get("contactPhone"), 40) || null,
    websiteUrl: marketIqOptionalUrl(formData.get("websiteUrl")),
  };
  if (logoRaw && !brand.logoUrl) throw new Error("Enter a valid logo address.");
  if (websiteRaw && !brand.websiteUrl) throw new Error("Enter a valid website address.");
  return brand;
}

export function parseMarketIqEditorialDefaultsForm(formData: FormData): MarketIqEditorialDefaults {
  const ctaRaw = marketIqClipped(formData.get("companyCtaUrl"), 500);
  const companyCtaUrl = marketIqOptionalUrl(formData.get("companyCtaUrl"));
  if (ctaRaw && !companyCtaUrl) throw new Error("Enter a valid call-to-action address.");
  return {
    defaultClientMessage: marketIqClipped(formData.get("defaultClientMessage"), 700) || null,
    defaultProspectMessage: marketIqClipped(formData.get("defaultProspectMessage"), 700) || null,
    companyProfile: marketIqClipped(formData.get("companyProfile"), 700) || null,
    companyCtaLabel: marketIqClipped(formData.get("companyCtaLabel"), 60) || null,
    companyCtaUrl,
  };
}
