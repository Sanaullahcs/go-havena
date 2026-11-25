/**
 * Generates PDF from services-and-amenities-billing-use-cases.html
 * Usage: node docs/client/generate-billing-doc-pdf.mjs
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, "services-and-amenities-billing-use-cases.html");
const pdfPath = join(__dirname, "services-and-amenities-billing-use-cases.pdf");

async function main() {
  let puppeteer;
  try {
    const require = createRequire(import.meta.url);
    puppeteer = require("puppeteer");
  } catch {
    console.error(
      "Puppeteer is not installed. Run from repo root:\n  npm install --no-save puppeteer\n  node docs/client/generate-billing-doc-pdf.mjs",
    );
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, {
    waitUntil: "networkidle0",
  });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "18mm", right: "16mm", bottom: "20mm", left: "16mm" },
  });
  await browser.close();
  console.log(`PDF written: ${pdfPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
