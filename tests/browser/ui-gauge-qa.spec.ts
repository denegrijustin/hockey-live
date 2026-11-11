// Independent gauge QA (UI Agent 5). Written against stable selectors (.gauge, figcaption, aria-label) and behaviours, not new class names.
// Ungated tests are regression guards that must pass before AND after the gauge work; `gated` ones encode the new acceptance criteria
// and are fixme until the lead merges (run them with QA_AFTER=1).
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { openGameCenter, openTab, gaugeWaste, noOverflow, captionOverlaps, clippedCaptions, gaugeFingerprint, expectedRows, realBox, splitFingerprint, gated, NEEDS, WIDTHS, GAME_DIALOG, type GcState } from "./ui-qa-helpers";

const STATS = `${GAME_DIALOG} [data-testid=gc-team-stats]`;
const BASELINE = "tests/fixtures/ui-qa-gauges.baseline.json";
test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "each test sets its own viewport"); });
const size = (w: number) => ({ width: w, height: w < 700 ? 844 : 1000 });

// ---------- calculations unchanged ----------
test.describe("gauge calculations are unchanged", () => {
  test("Team Stats gauge labels equal the values the pure comparisonRows helper computes for the same box", async ({ page }) => {
    await page.setViewportSize(size(1440));
    await openGameCenter(page, "final");
    await openTab(page, "Team Stats");
    const rows = expectedRows(realBox()).filter((r) => r.bar);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const r of rows) {
      const g = page.locator(`${STATS} [data-testid=gc-gauge-${r.key}] [role=img]`);
      await expect(g).toHaveAttribute("aria-label", new RegExp(`^${r.label.replace(/[%]/g, "\\$&")}: [A-Z]{2,3} ${r.awayText.replace(/[%.]/g, "\\$&")}, [A-Z]{2,3} ${r.homeText.replace(/[%.]/g, "\\$&")}$`));
    }
    // The needle points at the share of the total: rotate((0.5 - share) * 180deg).
    for (const r of rows) {
      const share = r.away! / (r.away! + r.home!);
      const angle = await page.locator(`${STATS} [data-testid=gc-gauge-${r.key}] .gauge-needle`).evaluate((n) => { const m = new DOMMatrixReadOnly(getComputedStyle(n).transform); return (Math.atan2(m.b, m.a) * 180) / Math.PI; });
      expect(angle).toBeCloseTo((0.5 - share) * 180, 0);
    }
  });

  for (const state of ["final", "live", "pregame"] as GcState[]) {
    test(`${state}: every gauge label and leader flag matches the pre-change baseline (period and goalie rows: same numbers)`, async ({ page }) => {
      await page.setViewportSize(size(1440));
      await openGameCenter(page, state);
      await page.waitForTimeout(300);
      const got: Record<string, string[]> = { overview: await gaugeFingerprint(page) };
      await openTab(page, "Team Stats");
      await page.waitForTimeout(300);
      got.stats = await gaugeFingerprint(page);
      const all = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
      if (process.env.QA_RECORD) { all[state] = got; writeFileSync(BASELINE, JSON.stringify(all, null, 1) + "\n"); return; }
      expect(all[state], "baseline recorded on claude/phase2 (QA_RECORD=1)").toBeTruthy();
      // dial-based gauges stay byte-identical; period dials and goalie SV%/GAA became text-first rows: same numbers (labels equal), leader flag not required
      for (const pane of ["overview", "stats"]) {
        const a = splitFingerprint(got[pane]), b = splitFingerprint(all[state][pane]);
        expect(a.dials, `${pane} dials`).toEqual(b.dials);
        expect(a.rows, `${pane} period/goalie rows carry the baseline numbers`).toEqual(b.rows);
      }
    });
  }
});

// ---------- layout at every width ----------
for (const width of WIDTHS) {
  test.describe(`@${width}`, () => {
    for (const state of ["final", "live"] as GcState[]) {
      test(`${state}: no overflow, no overlapping or clipped captions, in Overview and Team Stats`, async ({ page }) => {
        await page.setViewportSize(size(width));
        await openGameCenter(page, state);
        await noOverflow(page);
        await openTab(page, "Team Stats");
        await expect(page.locator(`${STATS} .gauge`).first()).toBeVisible();
        await noOverflow(page);
        expect(await captionOverlaps(page)).toEqual([]);
        expect(await clippedCaptions(page)).toEqual([]);
      });
    }

    test("pregame: lone dials do not overflow", async ({ page }) => {
      await page.setViewportSize(size(width));
      await openGameCenter(page, "pregame");
      await noOverflow(page);
    });

    gated(`${NEEDS}: no compact gauge stretches across a row (Team Stats)`, async ({ page }) => {
      await page.setViewportSize(size(width));
      await openGameCenter(page, "final");
      await openTab(page, "Team Stats");
      const w = await gaugeWaste(page, STATS);
      expect(w.length).toBeGreaterThanOrEqual(3);
      for (const g of w) {
        expect(g.w, `${g.label} width`).toBeLessThanOrEqual(width <= 430 ? Math.min(width - 24, 230) : 230);
        expect(g.h, `${g.label} height`).toBeLessThanOrEqual(190);
      }
    });

    gated(`${NEEDS}: Team Stats gauges share rows where there is room (>=375) and stay shorter than one-per-row`, async ({ page }) => {
      test.skip(width < 375, "320 may stack");
      await page.setViewportSize(size(width));
      await openGameCenter(page, "final");
      await openTab(page, "Team Stats");
      const w = await gaugeWaste(page, STATS);
      expect(Math.max(...w.map((g) => g.rowMates)), "some gauge shares its row").toBeGreaterThanOrEqual(1);
      const section = await page.locator(`${STATS} .gcs-gauges`).evaluate((e) => e.getBoundingClientRect().height);
      expect(section, "gauge block height").toBeLessThan(width < 700 ? 620 : 260);
    });
  });
}

// ---------- hero / lone dials / mixed sizes ----------
gated(`${NEEDS}: a lone large dial (pregame projection, Overview) is proportional, not full width, at 390 and 1440`, async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize(size(width));
    await openGameCenter(page, "pregame");
    const w = await gaugeWaste(page);
    expect(w.length).toBeGreaterThanOrEqual(1);
    for (const g of w) { expect(g.w, `${g.label} @${width}`).toBeLessThanOrEqual(300); expect(g.h).toBeLessThanOrEqual(260); }
    await page.reload();
  }
});

gated(`${NEEDS}: hero dials are shorter at 390 (finished game recap hero <= 300px, live Overview hero <= 420px)`, async ({ page }) => {
  await page.setViewportSize(size(390));
  await openGameCenter(page, "final");
  const hero = await page.locator(`${GAME_DIALOG} .gr-hero`).first().evaluate((e) => e.getBoundingClientRect().height).catch(() => null);
  if (hero != null) expect(hero).toBeLessThanOrEqual(300);
  await page.reload();
  await openGameCenter(page, "live");
  const live = await page.locator(`${GAME_DIALOG} .gr-hero`).first().evaluate((e) => e.getBoundingClientRect().height).catch(() => null);
  if (live != null) expect(live).toBeLessThanOrEqual(420);
});

gated(`${NEEDS}: mixed sizes: same-size gauges in one pane have equal widths, large >= compact`, async ({ page }) => {
  await page.setViewportSize(size(1440));
  await openGameCenter(page, "final");
  await openTab(page, "Team Stats");
  const sizes = await page.locator(`${STATS} .gauge`).evaluateAll((f) => f.filter((e) => e.getClientRects().length).map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(2);
  await openTab(page, "Overview");
  const lg = await page.locator(`${GAME_DIALOG} .gauge.lg`).evaluateAll((f) => f.filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().width));
  const sm = await page.locator(`${GAME_DIALOG} .gauge:not(.lg)`).evaluateAll((f) => f.filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().width));
  if (lg.length && sm.length) expect(Math.min(...lg)).toBeGreaterThanOrEqual(Math.max(...sm) - 1);
});

gated(`${NEEDS}: gauges sit beside the stats table on wide screens (not above a full-width gap)`, async ({ page }) => {
  await page.setViewportSize(size(1440));
  await openGameCenter(page, "final");
  await openTab(page, "Team Stats");
  const [g, t] = await page.evaluate((s) => {
    const r = (q: string) => document.querySelector(s + " " + q)!.getBoundingClientRect();
    return [r(".gcs-gauges"), r("table.gcs-cmp, [data-testid=gc-team-table]")].map((b) => ({ top: b.top, bottom: b.bottom, left: b.left, right: b.right }));
  }, STATS);
  expect(Math.min(g.bottom, t.bottom) - Math.max(g.top, t.top), "vertical overlap = side by side").toBeGreaterThan(40);
});

// ---------- robustness ----------
test("long labels wrap inside their dial and never escape it", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize(size(width));
    await openGameCenter(page, "final");
    await openTab(page, "Team Stats");
    await page.locator(`${STATS} .gauge .gauge-label, ${STATS} .gauge figcaption span:nth-child(2)`).first().evaluate((e) => { e.textContent = "Average shot distance on unblocked attempts at even strength, last ten games"; });
    await page.waitForTimeout(100);
    expect(await clippedCaptions(page)).toEqual([]);
    await noOverflow(page);
    await page.reload();
  }
});

test.describe("missing values", () => {
  const BAD = /NaN|undefined|Infinity|\[object/;
  for (const [name, opts] of [["bare box (right-rail team table missing: numbers null)", { bare: true }], ["boxscore 500", { boxStatus: 500 }]] as const) {
    test(`${name}: dashes or notice, no NaN, every drawn dial has valid paths`, async ({ page }) => {
      await page.setViewportSize(size(390));
      await openGameCenter(page, "final", opts);
      await openTab(page, "Team Stats");
      await page.waitForTimeout(500);
      expect(await page.locator(GAME_DIALOG).innerText()).not.toMatch(BAD);
      for (const d of await page.locator(`${GAME_DIALOG} .gauge path`).evaluateAll((p) => p.map((e) => e.getAttribute("d")))) expect(d).not.toMatch(/NaN|undefined/);
      if (opts.bare) await expect(page.locator(`${STATS} table.gcs-cmp, ${STATS} [data-testid=gc-team-table]`).first()).toContainText("—");
      await noOverflow(page);
    });
  }
});

test("loading state: a slow box score shows a status, no dials with fake numbers, then the dials arrive", async ({ page }) => {
  await page.setViewportSize(size(390));
  await openGameCenter(page, "final", { boxDelay: 1500 });
  await openTab(page, "Team Stats");
  await expect(page.locator(`${STATS} [role=status]`).first()).toContainText(/Loading/);
  expect(await page.locator(`${STATS} [data-testid^=gc-gauge-]`).count()).toBe(0);
  await expect(page.locator(`${STATS} [data-testid^=gc-gauge-]`).first()).toBeVisible({ timeout: 8000 });
  await noOverflow(page);
});

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme} theme: dial strokes and captions are visible against the background`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize(size(390));
    await openGameCenter(page, "final");
    await page.evaluate((s) => document.documentElement.setAttribute("data-theme", s), scheme); // harmless if the app ignores it
    await openTab(page, "Team Stats");
    const lum = (rgb: string) => { const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const c = await page.locator(`${STATS} .gauge`).first().evaluate((f) => {
      let bg = ""; for (let e: Element | null = f; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") { bg = b; break; } }
      return { bg, text: getComputedStyle(f.querySelector("figcaption i")!).color, away: getComputedStyle(f.querySelector(".gauge-away")!).stroke, home: getComputedStyle(f.querySelector(".gauge-home") ?? f.querySelector(".gauge-away")!).stroke };
    });
    const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    expect(c.bg).not.toBe("");
    expect(contrast(c.text, c.bg), "caption number contrast").toBeGreaterThan(4.5);
    expect(contrast(c.away, c.bg), "away arc vs background").toBeGreaterThan(1.5);
    expect(contrast(c.home, c.bg), "home arc vs background").toBeGreaterThan(1.5);
    await noOverflow(page);
  });
}
