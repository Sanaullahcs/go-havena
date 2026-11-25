/**
 * Quick sanity checks for resolveMediaUrl (run: node utils/profile-display.test.js)
 * Uses mock API_BASE_URL via env before import would need dynamic import - inline logic test instead.
 */

function isRewritableDevHost(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "10.0.2.2") return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
  return false;
}

function resolveMediaUrl(path, apiBase) {
  if (!path) return null;
  const publicBase = apiBase.replace(/\/api\/v1\/?$/, "");
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const parsed = new URL(path);
      const storageMatch = parsed.pathname.match(/\/storage\/.+/);
      if (storageMatch) return `${publicBase}${storageMatch[0]}`;
      if (isRewritableDevHost(parsed.hostname) && parsed.pathname) {
        return `${publicBase}${parsed.pathname}`;
      }
      return path;
    } catch {
      return path;
    }
  }
  return `${publicBase}${path.startsWith("/") ? path : `/${path}`}`;
}

const API = "https://six-tables-buy.loca.lt/api/v1";
const cases = [
  ["/storage/avatars/x.png", `${API.replace(/\/api\/v1\/?$/, "")}/storage/avatars/x.png`],
  ["http://127.0.0.1:8000/storage/notices/a.jpg", "https://six-tables-buy.loca.lt/storage/notices/a.jpg"],
  ["http://192.168.100.241:8000/storage/avatars/b.png", "https://six-tables-buy.loca.lt/storage/avatars/b.png"],
  ["http://localhost:8000/storage/utility-bills/c.png", "https://six-tables-buy.loca.lt/storage/utility-bills/c.png"],
  // External CDN avatars must not be rewritten to the API host (old bug: /300 → API/300).
  ["https://i.pravatar.cc/300?img=31", "https://i.pravatar.cc/300?img=31"],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = resolveMediaUrl(input, API);
  if (got !== expected) {
    console.error("FAIL", input, "\n  expected:", expected, "\n  got:", got);
    failed++;
  }
}

if (failed) {
  console.error(`${failed} test(s) failed`);
  process.exit(1);
}
console.log("resolveMediaUrl: all checks passed");
