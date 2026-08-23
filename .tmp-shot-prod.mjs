import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto("https://owllex.vercel.app/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "C:/Users/harsh/AppData/Local/Temp/claude/c--Users-harsh-OneDrive-project-startup-lexvert/621f7a58-8a5f-42a2-8c29-5ef70a3bd011/scratchpad/prod-home.png", fullPage: false });

await page.goto("https://owllex.vercel.app/sign-in", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "C:/Users/harsh/AppData/Local/Temp/claude/c--Users-harsh-OneDrive-project-startup-lexvert/621f7a58-8a5f-42a2-8c29-5ef70a3bd011/scratchpad/prod-signin.png", fullPage: false });

await browser.close();
console.log("DONE");
