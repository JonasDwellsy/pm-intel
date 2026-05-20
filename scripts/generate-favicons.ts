// One-shot generator for the Dwellsy IQ favicon family.
//
// Source: public/dwellsy-iq-logo.png (1000×313, native brand asset).
// Strategy: crop the right-side "IQ" portion (the recognizable shorthand
// — the full wordmark is illegible at 16-32px favicon sizes), square it
// with whitespace padding, then emit every size modern browsers care
// about from that single source.
//
// IQ yellow region in the native PNG was profiled at sample time:
//   x: 724-950, y: 86-235 → 226×149 bbox, brand yellow #FCD131
// Cropped square anchored on the bbox center with generous padding so
// the IQ stays well inside the tile at 16×16. Native logo is 1000×313;
// the square crop has to fit inside that height, which caps the side
// length at ~290px before we start clipping the top/bottom.
//
// Run: npx tsx scripts/generate-favicons.ts
// Re-run after any logo asset refresh — outputs are written into
// src/app/ (App Router metadata-file convention; Next.js auto-emits the
// <link rel=icon> tags) and public/ (PWA-style sizes).

import sharp from "sharp";
import pngToIco from "png-to-ico";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const SRC = "public/dwellsy-iq-logo.png";

// Crop box for the IQ region. IQ bbox center is (837, 160). 260×260
// gives ~17px whitespace on each side of the IQ shape — enough breathing
// room that the mark reads as a centered icon rather than a clipped
// detail, while staying within the 313-tall source image.
const CROP = { left: 707, top: 30, width: 260, height: 260 };

async function main(): Promise<void> {
  // 1. Crop the IQ region from the source logo.
  const square = await sharp(SRC)
    .extract(CROP)
    .png()
    .toBuffer();

  // 2. Render each output size from the same square source.
  const sizes = [16, 32, 48, 180, 192, 256, 512];
  const buffers: Record<number, Buffer> = {};
  for (const size of sizes) {
    buffers[size] = await sharp(square)
      .resize(size, size, { fit: "contain", background: "#FFFFFF" })
      .png()
      .toBuffer();
    console.log(`  ✓ rendered ${size}×${size}`);
  }

  // 3. Pack the small sizes into a multi-resolution favicon.ico.
  // Browsers pick the right size at request time; 16/32 covers the tab
  // affordance, 48 covers the OS taskbar / pinned-tab cases.
  const icoBuffer = await pngToIco([
    buffers[16],
    buffers[32],
    buffers[48],
  ]);
  console.log(`  ✓ packed favicon.ico (16/32/48)`);

  // 4. Build icon.svg. Embeds the highest-fidelity raster (256×256) as
  // a base64 <image> inside a vector container so modern browsers can
  // pick the right pixel density at any DPR without retouching the
  // brand artwork. Pure-SVG paths would require tracing the stylized
  // Q-with-house glyph from the PNG — premature work; the embedded
  // raster reads correctly at every size the SVG <link> targets.
  const svgBase64 = buffers[256].toString("base64");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <title>Dwellsy IQ</title>
  <image href="data:image/png;base64,${svgBase64}" x="0" y="0" width="256" height="256"/>
</svg>
`;

  // 5. Write outputs.
  //   src/app/favicon.ico    — overwrites the create-next-app default
  //   src/app/icon.svg       — Next.js App Router auto-emits rel=icon
  //   src/app/icon.png       — raster fallback for the icon rel
  //   src/app/apple-icon.png — Next.js auto-emits rel=apple-touch-icon
  //   public/icon-192.png    — PWA app-icon-ish; referenced if/when a
  //                            manifest.json appears
  //   public/icon-512.png    — same; PWA splash-screen-ish
  await mkdir("src/app", { recursive: true });
  await writeFile("src/app/favicon.ico", icoBuffer);
  await writeFile("src/app/icon.svg", svg, "utf8");
  await writeFile("src/app/icon.png", buffers[256]);
  await writeFile("src/app/apple-icon.png", buffers[180]);
  await writeFile(join("public", "icon-192.png"), buffers[192]);
  await writeFile(join("public", "icon-512.png"), buffers[512]);

  console.log("\nFavicon family written:");
  console.log("  src/app/favicon.ico    (16/32/48 multi-res)");
  console.log("  src/app/icon.svg       (vector wrapper, 256×256 raster)");
  console.log("  src/app/icon.png       (256×256)");
  console.log("  src/app/apple-icon.png (180×180)");
  console.log("  public/icon-192.png    (192×192)");
  console.log("  public/icon-512.png    (512×512)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
