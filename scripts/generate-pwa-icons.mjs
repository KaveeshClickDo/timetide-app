import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const source = join(root, 'public', 'email-logo.png');
const outDir = join(root, 'public', 'icons');

mkdirSync(outDir, { recursive: true });

const sizes = [192, 384, 512];

// Regular icons — full size, no padding
for (const size of sizes) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon-${size}x${size}.png`));
  console.log(`Generated icon-${size}x${size}.png`);
}

// Apple touch icon (180x180) — full size, white background
await sharp(source)
  .resize(180, 180)
  .flatten({ background: { r: 255, g: 255, b: 255 } })
  .png()
  .toFile(join(outDir, 'apple-touch-icon.png'));
console.log('Generated apple-touch-icon.png');

// Maskable icons — logo scaled to 75% (safe zone), white background fills edges
// Android adaptive icons apply a shape mask; the safe zone is the central 80% circle.
const maskableSizes = [192, 512];

for (const size of maskableSizes) {
  const logoSize = Math.round(size * 0.75);
  const offset = Math.round((size - logoSize) / 2);

  const logoBuffer = await sharp(source)
    .resize(logoSize, logoSize)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logoBuffer, left: offset, top: offset }])
    .png()
    .toFile(join(outDir, `maskable-icon-${size}x${size}.png`));

  console.log(`Generated maskable-icon-${size}x${size}.png`);
}

console.log('Done! Icons generated in public/icons/');
