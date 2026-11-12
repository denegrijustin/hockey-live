// node tools/zamboni/prototype/capture.mjs <outDir> <name> <query> <t0> <t1> <fps>
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, name, query, t0, t1, fps] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERROR", m.text()); });
page.on("pageerror", (e) => console.log("PAGE EXC", e.message));
await page.goto(`http://127.0.0.1:4999/tools/zamboni/prototype/index.html?${query}`.replace("/tools/zamboni/prototype/index.html", "/index.html"));
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const meta = await page.evaluate(() => window.__meta);
console.log("META", JSON.stringify(meta));
const canvas = page.locator("canvas");
let i = 0; const times = [];
for (let t = Number(t0); t <= Number(t1); t += 1 / Number(fps)) {
  const t_a = Date.now();
  const info = await page.evaluate((tt) => window.__frame(tt), t);
  await canvas.screenshot({ path: `${out}/${name}-${String(i).padStart(4, "0")}.png` });
  times.push(Date.now() - t_a);
  if (i % 20 === 0) console.log("frame", i, "t", t.toFixed(2), JSON.stringify(info));
  i++;
}
console.log("frames", i, "avg ms/frame incl screenshot", Math.round(times.reduce((a, b) => a + b, 0) / times.length));
await browser.close();
