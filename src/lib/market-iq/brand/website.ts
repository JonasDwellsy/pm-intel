export function normalizePublicWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function websiteForSuggestion(currentInput: string | undefined, savedWebsite: string | null | undefined) {
  return normalizePublicWebsite(currentInput === undefined ? savedWebsite ?? "" : currentInput);
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

export function extractWebsiteColors(source: string) {
  const colors = new Set<string>();
  for (const match of source.matchAll(/#[0-9a-f]{6}\b/gi)) colors.add(match[0].toLowerCase());
  for (const match of source.matchAll(/rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/gi)) {
    colors.add(rgbToHex(Number(match[1]), Number(match[2]), Number(match[3])));
  }
  return [...colors];
}

function colorStats(color: string) {
  const [red, green, blue] = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  return { brightness: (red * 299 + green * 587 + blue * 114) / 1000, saturation: max - min };
}

export function chooseWebsitePalette(colors: string[]) {
  const useful = colors.filter((color) => {
    const { brightness, saturation } = colorStats(color);
    return brightness > 24 && brightness < 238 && saturation > 18;
  });
  const primary = [...useful].sort((a, b) => colorStats(a).brightness - colorStats(b).brightness)[0] ?? "#183b56";
  const accent = [...useful]
    .filter((color) => color !== primary)
    .sort((a, b) => colorStats(b).saturation - colorStats(a).saturation)[0] ?? "#c46f35";
  return { primaryColor: primary, accentColor: accent };
}
