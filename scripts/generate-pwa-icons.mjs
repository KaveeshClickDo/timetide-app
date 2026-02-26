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

for (const size of sizes) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon-${size}x${size}.png`));
  console.log(`Generated icon-${size}x${size}.png`);
}

// Apple touch icon (180x180)
await sharp(source)
  .resize(180, 180)
  .png()
  .toFile(join(outDir, 'apple-touch-icon.png'));
console.log('Generated apple-touch-icon.png');

console.log('Done! Icons generated in public/icons/');
