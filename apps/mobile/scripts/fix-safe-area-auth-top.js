/** Screens without HeaderShell need the top safe-area edge. */
const AUTH_FLOW_FILES = [
  "app/screens/login/index.jsx",
  "app/screens/login/verify-phone/index.jsx",
  "app/screens/signup/index.jsx",
  "app/screens/verifyregistration/index.jsx",
  "app/screens/invite-code/index.jsx",
  "app/screens/roles/index.jsx",
  "app/screens/pending-community/index.jsx",
  "app/screens/pending-community-admin/index.jsx",
  "app/screens/complete-profile/index.jsx",
  "app/screens/request-for-community/index.jsx",
];

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let updated = 0;

for (const rel of AUTH_FLOW_FILES) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, "utf8");
  const next = content.replace(
    /edges=\{\["left", "right"\]\}/g,
    'edges={["top", "left", "right"]}',
  );
  if (next !== content) {
    fs.writeFileSync(file, next);
    updated += 1;
    console.log(rel);
  }
}

console.log(`Restored top inset on ${updated} auth/onboarding screens.`);
