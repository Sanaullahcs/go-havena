import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logo = readFileSync(join(__dirname, "../public/havena-logo.png"));

const outputs = [
  { path: join(__dirname, "../public/favicon.png"), size: 32 },
  { path: join(__dirname, "../public/app-icon.png"), size: 180 },
  { path: join(__dirname, "../public/n-icon.png"), size: 48 },
  { path: join(__dirname, "../src/app/icon.png"), size: 32 },
  { path: join(__dirname, "../src/app/apple-icon.png"), size: 180 },
  { path: join(__dirname, "../../apps/mobile/assets/images/app-icon.png"), size: 1024 },
  { path: join(__dirname, "../../apps/mobile/assets/images/icon.png"), size: 1024 },
  { path: join(__dirname, "../../apps/mobile/assets/images/android-icon-foreground.png"), size: 1024 },
];

for (const { path, size } of outputs) {
  mkdirSync(dirname(path), { recursive: true });
  const png = await sharp(logo).ensureAlpha().resize(size, size).png({ force: true }).toBuffer();
  writeFileSync(path, png);
  console.log(`Wrote ${path} (${size}x${size})`);
}
