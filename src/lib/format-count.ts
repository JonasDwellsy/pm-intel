// v0.6.4 Patch 4 — small helper for rendering market counts as words.
//
// Marketing/header copy reads more cleanly with the count spelled out
// ("Fifteen US MSAs are live today" vs. "15 US MSAs are live today").
// We previously hardcoded "Ten" in several places and went stale on
// every market addition. This helper makes the count data-driven.
//
// For counts 1-20 we return the word ("One", "Two", ..., "Twenty");
// for larger counts we return the digits as a string. Twenty is the
// arbitrary cutoff — beyond that, words start to feel like a parlor
// trick and "25 US MSAs" reads fine.

const NUMBER_WORDS_TITLE_CASE = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
];

/** Render an integer as a title-cased English word for 0..20, or as
 *  digits for 21+. Negative values fall through to digits. */
export function countAsWord(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 20 || !Number.isInteger(n)) {
    return String(n);
  }
  return NUMBER_WORDS_TITLE_CASE[n];
}

/** Same as countAsWord but lowercase ("ten" instead of "Ten") for
 *  mid-sentence use ("a portfolio of ten markets"). */
export function countAsLowerWord(n: number): string {
  const word = countAsWord(n);
  return word === String(n) ? word : word.toLowerCase();
}
