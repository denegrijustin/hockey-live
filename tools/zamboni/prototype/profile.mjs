// node tools/zamboni/prototype/profile.mjs  -> frame cost of the 3D scene on a desktop-sized and a phone-sized canvas (software GL here, so these are upper bounds)
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const configs = [
  { name: "desktop 1000x510 @1x, high", q: "w=1000&h=510&dpr=1&q=high", throttle: 1, vp: { width: 1100, height: 700 }, dpr: 1 },
  { name: "desktop 1000x510 @2x, high", q: "w=1000&h=510&dpr=2&q=high", throttle: 1, vp: { width: 1100, height: 700 }, dpr: 2 },
  { name: "phone 358x183 @3x(capped 1.5), low, CPU x4", q: "w=358&h=183&dpr=3&q=low", throttle: 4, vp: { width: 390, height: 844 }, dpr: 3 },
  { name: "phone 358x183 @3x(capped 1.5), high, CPU x4", q: "w=358&h=183&dpr=3&q=high", throttle: 4, vp: { width: 390, height: 844 }, dpr: 3 },
];
for (const c of configs) {
  const ctx = await browser.newContext({ viewport: c.vp, deviceScaleFactor: c.dpr });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`http://127.0.0.1:4999/index.html?${c.q}&v=9`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: c.throttle });
  const r = await page.evaluate(async () => {
    const ice = window.__ice, gl = ice.renderer.getContext(), px = new Uint8Array(4);
    const js = [], total = [];
    for (let i = 0; i < 60; i++) {
      const t = 14 + i * 0.25;
      const a = performance.now(); window.__frame(t); const b = performance.now();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const e = performance.now();
      js.push(b - a); total.push(e - a);
    }
    const med = (x) => x.slice().sort((p, q) => p - q)[Math.floor(x.length / 2)], p95 = (x) => x.slice().sort((p, q) => p - q)[Math.floor(x.length * 0.95)];
    const i = ice.renderer.info;
    return { jsMedian: med(js), jsP95: p95(js), totalMedian: med(total), totalP95: p95(total), calls: i.render.calls, tris: i.render.triangles, geoms: i.memory.geometries, textures: i.memory.textures, px: [ice.renderer.domElement.width, ice.renderer.domElement.height] };
  });
  console.log(c.name, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(1) : v]))));
  await ctx.close();
}
await browser.close();
