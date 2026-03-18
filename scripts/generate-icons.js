/**
 * Generate PWA placeholder icons for Nocturn
 *
 * Usage: node scripts/generate-icons.js
 *
 * Requires: npm install sharp (already in devDependencies via Next.js)
 *
 * Generates purple "N" icons at 192x192 and 512x512 for PWA manifest.
 * Replace these with real branded icons before production launch.
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const BRAND_PURPLE = "#7B2FF7";
const BG_COLOR = "#09090B";

const iconsDir = path.join(__dirname, "..", "public", "icons");

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

async function generateIcon(size, filename) {
  const fontSize = Math.round(size * 0.5);
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="${BG_COLOR}"/>
      <text
        x="50%"
        y="54%"
        font-family="sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="${BRAND_PURPLE}"
        text-anchor="middle"
        dominant-baseline="middle"
      >N</text>
    </svg>
  `;

  const outputPath = path.join(iconsDir, filename);
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  console.log(`Generated ${filename} (${size}x${size})`);
}

async function main() {
  try {
    await generateIcon(192, "icon-192.png");
    await generateIcon(512, "icon-512.png");
    console.log("\nPWA icons generated successfully in public/icons/");
    console.log(
      "Note: Replace these placeholders with real branded icons before launch."
    );
  } catch (err) {
    console.error("Error generating icons:", err.message);
    console.log(
      "\nFallback: Creating minimal placeholder files so the PWA manifest doesn't break."
    );

    // Create tiny 1x1 purple pixel PNGs as absolute fallback
    // This is a valid minimal PNG with a single purple pixel
    const minimalPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
      "base64"
    );

    fs.writeFileSync(path.join(iconsDir, "icon-192.png"), minimalPng);
    fs.writeFileSync(path.join(iconsDir, "icon-512.png"), minimalPng);
    console.log("Created minimal placeholder PNG files.");
  }
}

main();
