import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { chooseWebsitePalette, extractWebsiteColors, normalizePublicWebsite } from "./website";

function privateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
}

async function safeUrl(value: string) {
  const url = new URL(normalizePublicWebsite(value));
  if (url.protocol !== "https:") throw new Error("Use a public HTTPS website.");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error("That website address cannot be inspected.");
  return url;
}

export async function suggestWebsitePalette(value: string) {
  let url = await safeUrl(value);
  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    const response = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(7_000), headers: { "user-agent": "Dwellsy-Market-IQ-Brand-Setup/1.0" } });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = await safeUrl(new URL(response.headers.get("location")!, url).toString());
      continue;
    }
    if (!response.ok) throw new Error("We could not read that website.");
    const html = (await response.text()).slice(0, 1_000_000);
    const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)/i)?.[1];
    const stylesheetUrls = [...html.matchAll(/<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]+href=["']([^"']+)/gi)]
      .map((match) => new URL(match[1], url))
      .filter((stylesheet) => stylesheet.protocol === "https:" && stylesheet.hostname === url.hostname)
      .slice(0, 3);
    const stylesheets = await Promise.all(stylesheetUrls.map(async (stylesheet) => {
      try {
        await safeUrl(stylesheet.toString());
        const css = await fetch(stylesheet, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4_000), headers: { "user-agent": "Dwellsy-Market-IQ-Brand-Setup/1.0" } });
        return css.ok ? (await css.text()).slice(0, 500_000) : "";
      } catch {
        return "";
      }
    }));
    const colors = extractWebsiteColors([html, ...stylesheets].join("\n"));
    if (theme && /^#[0-9a-f]{6}$/i.test(theme)) colors.unshift(theme.toLowerCase());
    return { websiteUrl: url.toString(), ...chooseWebsitePalette(colors) };
  }
  throw new Error("That website redirected too many times.");
}
