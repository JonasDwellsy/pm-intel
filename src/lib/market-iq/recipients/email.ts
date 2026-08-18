export function normalizeMarketIqRecipientEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidMarketIqRecipientEmail(value: unknown) {
  const email = normalizeMarketIqRecipientEmail(value);
  if (!email || email.length > 254 || /[\s\u0000-\u001f\u007f]/.test(email)) return false;

  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || domain.length > 253) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) return false;
  const topLevelDomain = labels.at(-1) ?? "";
  return /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(topLevelDomain);
}
