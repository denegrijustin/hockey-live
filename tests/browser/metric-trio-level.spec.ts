import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/* The three card metrics (Win probability / Momentum / Deserve) sit on shared rows, so a two-line heading never pushes its bar out of line. */
const css = readFileSync("src/card-face.css", "utf8");
const metric = (h: string, bar: string, v: string) => `<div class="gcv-metric"><h5>${h}</h5><span class="${bar}"></span><b>${v}</b></div>`;

for (const width of [340, 390, 700, 1100]) {
  test(`metric bars and values line up at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.setContent(`<style>${css}</style><div style="width:${width - 40}px;margin:20px;--face-accent:#e0485a;--face-bg:#8f2430">
      <div class="gcv-trio">${metric("Win probability", "gcv-gradbar", "BOS 55%")}${metric("Momentum", "gcv-segbar", "BOS ▲")}${metric("Deserve", "gcv-gradbar alt", "BOS 51%")}</div></div>`);
    const tops = async (sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    const bars = await tops(".gcv-metric > span");
    const vals = await tops(".gcv-metric > b");
    expect(new Set(bars).size).toBe(1);
    expect(new Set(vals).size).toBe(1);
  });
}
