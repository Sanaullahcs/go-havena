const fs = require("fs");
const path = require("path");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "scripts") continue;
      walk(full, files);
    } else if (entry.name.endsWith(".jsx")) {
      files.push(full);
    }
  }
  return files;
}

const skipTopReplace = new Set([
  path.normalize("components/layout/app-safe-area.jsx"),
  path.normalize("app/screens/notice-detail/index.jsx"),
  path.normalize("components/invite/invite-qr-scanner.jsx"),
]);

let updated = 0;
for (const file of walk(path.join(__dirname, ".."))) {
  const rel = path.relative(path.join(__dirname, ".."), file);
  if (skipTopReplace.has(rel.replace(/\\/g, "/"))) continue;

  let content = fs.readFileSync(file, "utf8");
  const original = content;

  content = content.replace(
    /edges=\{\["top", "left", "right"\]\}/g,
    'edges={["left", "right"]}',
  );

  content = content.replace(
    /<SafeAreaView style=\{styles\.container\}>/g,
    '<SafeAreaView style={styles.container} edges={["left", "right"]}>',
  );

  content = content.replace(
    /<SafeAreaView style=\{styles\.screen\}>/g,
    '<SafeAreaView style={styles.screen} edges={["left", "right"]}>',
  );

  content = content.replace(
    /<SafeAreaView style=\{\{ flex: 1, backgroundColor: "#fff" \}\}>/g,
    '<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["left", "right"]}>',
  );

  content = content.replace(
    /<SafeAreaView style=\{propertyStyles\.screen\} edges=\{\["top", "left", "right"\]\}>/g,
    '<SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>',
  );

  content = content.replace(
    /<SafeAreaView style=\{\[styles\.container, styles\.centered\]\}>/g,
    '<SafeAreaView style={[styles.container, styles.centered]} edges={["left", "right"]}>',
  );

  if (content !== original) {
    fs.writeFileSync(file, content);
    updated += 1;
    console.log(rel);
  }
}

console.log(`Updated ${updated} files.`);
