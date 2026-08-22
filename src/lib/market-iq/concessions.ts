export type MarketIqAdvertisedConcession = {
  kind: "free_rent" | "rent_credit" | "move_in_special" | "fee_waiver" | "deposit_special";
  label: string;
  evidence: string;
};

const CONCESSION_PATTERNS: Array<{
  kind: MarketIqAdvertisedConcession["kind"];
  label: string;
  pattern: RegExp;
}> = [
  {
    kind: "free_rent",
    label: "Free-rent offer",
    pattern: /(?:\b(?:\d+|one|two|three)[ -]?(?:month|week)s?\b.{0,24}\b(?:free|credit)\b|\bfree\b.{0,16}\b(?:month|week|rent)\b)/i,
  },
  {
    kind: "rent_credit",
    label: "Rent credit",
    pattern: /(?:\$\s?\d[\d,]*(?:\.\d{2})?.{0,12}\b(?:off|credit)\b|\b(?:rent|lease)\b.{0,20}\bcredit\b)/i,
  },
  {
    kind: "fee_waiver",
    label: "Fee waiver",
    pattern: /(?:\b(?:waive|waived|waiving|free)\b.{0,16}\b(?:application|admin|fee)\b|\b(?:application|admin|fee)\b.{0,16}\b(?:waived|free)\b)/i,
  },
  {
    kind: "deposit_special",
    label: "Deposit special",
    pattern: /(?:\bdeposit[- ]free\b|\b(?:waive|waived|waiving)\b.{0,16}\bdeposit\b|\bdeposit\b.{0,20}\bspecial\b)/i,
  },
  {
    kind: "move_in_special",
    label: "Move-in special",
    pattern: /\b(?:move[ -]?in|leasing|lease|rent)\b.{0,24}\b(?:special|discount)\b/i,
  },
];

const NEGATION_WINDOW_CHARACTERS = 24;
const NEGATOR_PATTERN = /(?:\b(?:no|not|without)\b|n['’]t\b)/i;

function isNegated(text: string, matchIndex: number, matchLength: number) {
  const contextStart = Math.max(0, matchIndex - NEGATION_WINDOW_CHARACTERS);
  return NEGATOR_PATTERN.test(text.slice(contextStart, matchIndex + matchLength));
}

function evidenceAround(text: string, matchIndex: number, matchLength: number) {
  const start = Math.max(0, matchIndex - 45);
  const end = Math.min(text.length, matchIndex + matchLength + 75);
  const excerpt = text.slice(start, end).trim().replace(/^[,.;:!?\s]+|[,.;:!?\s]+$/g, "");
  return `${start > 0 ? "…" : ""}${excerpt}${end < text.length ? "…" : ""}`;
}

export function parseAdvertisedConcession(value: string | null | undefined): MarketIqAdvertisedConcession | null {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  for (const candidate of CONCESSION_PATTERNS) {
    const match = candidate.pattern.exec(text);
    if (!match || match.index === undefined) continue;
    if (isNegated(text, match.index, match[0].length)) continue;
    return {
      kind: candidate.kind,
      label: candidate.label,
      evidence: evidenceAround(text, match.index, match[0].length),
    };
  }
  return null;
}
