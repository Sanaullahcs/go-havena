/**
 * Replaces react-native TextInput with LocaleTextInput across the mobile app.
 * Run once: node scripts/migrate-text-input.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, "..");
const localeInputPath = path.join(mobileRoot, "components", "ui", "locale-text-input.jsx");

const SKIP_FILES = new Set([
  localeInputPath,
  path.join(mobileRoot, "hooks", "use-input-locale.js"),
  path.join(mobileRoot, "scripts", "migrate-text-input.mjs"),
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".expo") continue;
      walk(full, out);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function relativeImport(fromFile) {
  let rel = path.relative(path.dirname(fromFile), localeInputPath);
  rel = rel.replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel.replace(/\.jsx$/, "");
}

function migrateFile(filePath) {
  if (SKIP_FILES.has(filePath)) return false;

  let source = fs.readFileSync(filePath, "utf8");
  if (!source.includes("TextInput")) return false;

  const importMatch = source.match(
    /import\s+\{([^}]+)\}\s+from\s+["']react-native["'];?/,
  );
  if (!importMatch || !importMatch[1].includes("TextInput")) return false;

  const names = importMatch[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!names.includes("TextInput")) return false;

  const nextNames = names.filter((name) => name !== "TextInput");
  const importLine = importMatch[0];
  const localeImport = `import LocaleTextInput from "${relativeImport(filePath)}";`;

  if (nextNames.length === 0) {
    source = source.replace(importLine, localeImport);
  } else {
    const nextImport = `import { ${nextNames.join(", ")} } from "react-native";`;
    source = source.replace(importLine, `${nextImport}\n${localeImport}`);
  }

  source = source.replace(/<TextInput(\s|>)/g, "<LocaleTextInput$1");
  source = source.replace(/<\/TextInput>/g, "</LocaleTextInput>");

  // Drop redundant useInputLocale when LocaleTextInput handles it.
  if (source.includes("useInputLocale")) {
    source = source.replace(
      /\nimport \{ useInputLocale \} from [^;]+;\n/,
      "\n",
    );
    source = source.replace(/\n\s*const inputLocale = useInputLocale\(\);\n/, "\n");
    source = source.replace(/\{\.\.\.inputLocale\}\s*/g, "");
    source = source.replace(/,\s*inputLocale\.style/g, "");
    source = source.replace(/\[inputLocale\.style,\s*/g, "[");
    source = source.replace(/,\s*inputLocale\.style\]/g, "]");
  }

  fs.writeFileSync(filePath, source, "utf8");
  return true;
}

const files = walk(mobileRoot);
let changed = 0;

for (const file of files) {
  if (migrateFile(file)) {
    changed += 1;
    console.log(`updated ${path.relative(mobileRoot, file)}`);
  }
}

console.log(`\nDone. Updated ${changed} file(s).`);
