import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto("http://localhost:3000/sign-in", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "C:/Users/harsh/AppData/Local/Temp/claude/c--Users-harsh-OneDrive-project-startup-lexvert/621f7a58-8a5f-42a2-8c29-5ef70a3bd011/scratchpad/sign-in.png" });

console.log("CONSOLE_ERRORS:", JSON.stringify(errors, null, 2));

await browser.close();
