import { chromium } from "playwright-core";
(async () => {
  const OUT = process.argv[2]!;
  const b = await chromium.launch({ headless: true, channel: "chrome" });
  const p = await b.newPage({ viewport: { width: 1360, height: 1000 } });
  await p.goto("http://localhost:3000/dashboard", { timeout: 60000 }); await p.waitForTimeout(7000);
  await p.screenshot({ path: `${OUT}/dash-payouts.png`, fullPage: true });
  await p.click("button:has-text('Decisions')"); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/dash-decisions.png` });
  await b.close();
})();
