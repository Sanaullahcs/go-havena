const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(raw) });
          } catch (e) {
            reject(new Error("Bad JSON: " + raw.slice(0, 200)));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function hideChrome(page) {
  return page.addStyleTag({
    content: `
      aside, header, nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay] { display: none !important; }
      main, .ml-60, [class*="ml-60"] { margin-left: 0 !important; }
    `,
  });
}

async function shotMain(page, outPath) {
  const main = page.locator("main").first();
  await main.waitFor({ state: "visible", timeout: 30000 });
  await main.screenshot({ path: outPath, type: "png" });
}

async function main() {
  const outDir = path.join(__dirname, "public", "marketing");
  fs.mkdirSync(outDir, { recursive: true });
  const heroPath = path.join(outDir, "dashboard-hero.png");
  const featuresPath = path.join(outDir, "dashboard-features.png");

  console.log("Requesting OTP...");
  const reqRes = await postJson("http://localhost:8000/api/v1/auth/otp/request", {
    email: "test.community.admin@havena.app",
    intent: "login",
    portal: "community_admin_dashboard",
  });
  if (reqRes.status >= 400) throw new Error("OTP request failed status=" + reqRes.status);

  console.log("Verifying OTP...");
  const verifyRes = await postJson("http://localhost:8000/api/v1/auth/otp/verify", {
    email: "test.community.admin@havena.app",
    code: "123456",
    intent: "login",
    portal: "community_admin_dashboard",
  });
  if (verifyRes.status >= 400) throw new Error("OTP verify failed status=" + verifyRes.status);

  const payload = verifyRes.json.data || verifyRes.json;
  const token = payload.token || payload.access_token || (payload.session && payload.session.token);
  const user = payload.user || payload.community_user || payload;
  if (!token) throw new Error("No token in verify response (keys: " + Object.keys(payload).join(",") + ")");

  console.log("Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto("http://localhost:3000/admin", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem("havena_community_token", token);
      localStorage.setItem("havena_community_user", JSON.stringify(user));
      sessionStorage.setItem("havena_web_portal", "community");
    },
    { token, user }
  );
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });

  await page.getByText(/Phoenix Tower|Member Growth/).first().waitFor({ timeout: 60000 });
  await hideChrome(page);
  await page.waitForTimeout(500);
  await shotMain(page, heroPath);
  console.log("Wrote", heroPath);

  await page.goto("http://localhost:3000/admin/notices", { waitUntil: "networkidle", timeout: 60000 });
  await page.getByText("Notices").first().waitFor({ timeout: 60000 });
  await hideChrome(page);
  await page.waitForTimeout(500);
  await shotMain(page, featuresPath);
  console.log("Wrote", featuresPath);

  await browser.close();

  for (const p of [heroPath, featuresPath]) {
    const stat = fs.statSync(p);
    // PNG IHDR: width/height at bytes 16-23
    const buf = fs.readFileSync(p);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    console.log(path.basename(p) + ": " + (stat.size / 1024).toFixed(1) + " KB, " + w + "x" + h);
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
