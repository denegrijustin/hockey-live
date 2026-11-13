// Independent QA harness for the gauge / layout / close-button work (UI Agent 5).
// Selectors are deliberately stable ones: `.gauge`, `dialog.game-dialog`, `button[aria-label^="Close"]` (matches both the old
// "Close full game view" and the new "Close game details"), roles and aria-labels. No new class names are assumed.
import { readFileSync } from "node:fs";
import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { normalizeBoxscore } from "../../src/lib/normalize.mjs";
import { comparisonRows } from "../../src/lib/gc-stats.mjs";
import { openFromHome, REAL, withState, GAME_DIALOG } from "./gc-qa-fixtures";

export { REAL, withState, GAME_DIALOG, openFromHome };
export const WIDTHS = [320, 375, 430, 768, 1024, 1440, 1920] as const;
export const CLOSE = `${GAME_DIALOG} button[aria-label^="Close"]`;
export type GcState = "live" | "final" | "pregame";

const sample = JSON.parse(readFileSync("tests/fixtures/boxscore-sample.json", "utf8"));
/** The real CAR at VGK boxscore run through the real normalizer. `bare` = no right-rail team table (many numbers null). */
export const realBox = (bare = false) => JSON.parse(JSON.stringify(normalizeBoxscore(sample.boxscore, bare ? undefined : sample.rightRail)));
/** The comparison rows the app itself derives from a box (the pure helper under test is NOT re-implemented here). */
export const expectedRows = (box: unknown) => comparisonRows(box) as { key: string; label: string; away: number | null; home: number | null; awayText: string; homeText: string; percent: boolean; bar: boolean }[];

/**
 * Opens the Game Center from the home scoreboard on real recorded fixtures.
 * live = real live-game envelope, final = real regulation game (OFF), pregame = real game with scheduled state (FUT).
 * Also serves the boxscore sample so the Team Stats tab has gauge rows (the header teams come from the feed; the box is CAR at VGK).
 */
export async function openGameCenter(page: Page, state: GcState = "final", opts: { bare?: boolean; boxStatus?: number; boxDelay?: number } = {}) {
  await page.route(/\/api\/boxscore\/\d+$/, async (r) => {
    if (opts.boxDelay) await new Promise((ok) => setTimeout(ok, opts.boxDelay));
    return opts.boxStatus ? r.fulfill({ status: opts.boxStatus, body: "{}" }) : r.fulfill({ json: realBox(opts.bare) });
  });
  await page.route(/\/api\/player\/\d{7}/, (r) => r.fulfill({ status: 404, body: "{}" }));
  const raw = state === "live" ? withState(REAL.live(), "live") : state === "pregame" ? withState(REAL.reg(), "pre") : withState(REAL.reg(), "final");
  return openFromHome(page, raw);
}

export const openTab = (page: Page, name: string) => page.locator(GAME_DIALOG).getByRole("tab", { name }).click();

export type Waste = { label: string; w: number; h: number; parentW: number; ratio: number; top: number; left: number; rowMates: number };
/**
 * Per-gauge width / parent width and how many other gauges share the same row (bounding-box vertical overlap). `scope` is a locator or selector.
 * ratio ~1 on a wide parent means a dial stretched across a whole row.
 */
export async function gaugeWaste(page: Page, scope: Locator | string = GAME_DIALOG): Promise<Waste[]> {
  const loc = typeof scope === "string" ? page.locator(scope) : scope;
  return loc.evaluate((root) => {
    const figs = [...root.querySelectorAll<HTMLElement>(".gauge")].filter((f) => f.getClientRects().length > 0);
    const rects = figs.map((f) => f.getBoundingClientRect());
    return figs.map((f, i) => {
      const r = rects[i], p = f.parentElement!.getBoundingClientRect();
      const rowMates = rects.filter((o, j) => j !== i && Math.min(o.bottom, r.bottom) - Math.max(o.top, r.top) > Math.min(o.height, r.height) * 0.5).length;
      return { label: f.getAttribute("aria-label")?.split(":")[0] ?? "", w: Math.round(r.width), h: Math.round(r.height), parentW: Math.round(p.width), ratio: +(r.width / p.width).toFixed(2), top: Math.round(r.top), left: Math.round(r.left), rowMates };
    });
  });
}

/** Horizontal overflow of the document (px), of the dialog, and any dialog element sticking out past the viewport edge. */
export async function noOverflow(page: Page) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth, d = document.querySelector("dialog.game-dialog");
    const out = d ? [...d.querySelectorAll<HTMLElement>("*")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > vw + 1 && !e.closest(".gc-tabs,.ds-rail,[role=tablist]")).slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}`) : [];
    return { page: document.documentElement.scrollWidth - vw, dialog: d ? d.scrollWidth - d.clientWidth : 0, out };
  });
  expect(r.page, "document scrolls sideways").toBeLessThanOrEqual(0);
  expect(r.dialog, "dialog scrolls sideways").toBeLessThanOrEqual(1);
  expect(r.out, "elements past the viewport edge").toEqual([]);
}

/** Number of visible close controls inside the Game Center dialog. Expect exactly one. */
export async function closeButtons(page: Page) {
  return page.locator(CLOSE).evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; }).length);
}

/** Scrolls the dialog (the scroll container) to each value and reports where the close control sits relative to the dialog's visible box. */
export async function pinned(page: Page, tops: number[] = [0, 300, 900, 100000]) {
  const out: { asked: number; scrollTop: number; dTop: number; dRight: number; w: number; h: number }[] = [];
  for (const t of tops) {
    await page.locator(GAME_DIALOG).evaluate((d, top) => { d.scrollTop = top; }, t);
    await page.waitForTimeout(80);
    const x = await page.evaluate((sel) => {
      const d = document.querySelector("dialog.game-dialog")!, b = document.querySelector(sel)!.getBoundingClientRect(), dr = d.getBoundingClientRect();
      return { scrollTop: Math.round(d.scrollTop), dTop: +(b.top - dr.top).toFixed(1), dRight: +(dr.right - b.right).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
    }, CLOSE);
    out.push({ asked: t, ...x });
  }
  return out;
}

/** Caption-overlap check (same measurement comparison.spec uses), with a wide fallback font on purpose. */
export async function captionOverlaps(page: Page) {
  await page.addStyleTag({ content: "dialog.game-dialog, dialog.game-dialog * { font-family: 'DejaVu Sans', Verdana, sans-serif !important; }" });
  await page.waitForTimeout(250);
  return page.locator(`${GAME_DIALOG} .gauge`).evaluateAll((figures) => {
    const hits: string[] = [];
    for (const f of figures) {
      const boxes = [...f.querySelectorAll(".vs-big, .vs-sub, .vs-label, .vs-tier, figcaption")].filter((e) => e.getClientRects().length > 0).map((e) => ({ t: e.textContent, r: e.getBoundingClientRect() }));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        if (a.width && b.width && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) hits.push(`${boxes[i].t} | ${boxes[j].t}`);
      }
    }
    return hits;
  });
}

/** Caption pieces that poke out of their own figure (clipped or spilling). */
export async function clippedCaptions(page: Page) {
  return page.locator(`${GAME_DIALOG} .gauge`).evaluateAll((figures) => figures.flatMap((f) => {
    const fr = f.getBoundingClientRect();
    return [...f.querySelectorAll(".vs *, figcaption *")].filter((e) => e.getClientRects().length).flatMap((e) => {
      const r = e.getBoundingClientRect();
      return r.left < fr.left - 1 || r.right > fr.right + 1 ? [`${e.textContent}`] : [];
    });
  }));
}

/** Hero (Overview) and Team Stats section metrics for the before/after report. */
export async function metrics(page: Page) {
  return page.evaluate(() => {
    const d = document.querySelector("dialog.game-dialog")!;
    const h = (sel: string) => { const e = d.querySelector(sel); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().height) : null; };
    const dials = [...d.querySelectorAll<HTMLElement>(".gauge")].filter((g) => g.getClientRects().length).map((g) => ({ w: Math.round(g.getBoundingClientRect().width), h: Math.round(g.getBoundingClientRect().height), lg: g.classList.contains("lg") }));
    return { hero: h(".gr-hero"), teamStats: h("[data-testid=gc-team-stats]"), gcsGauges: h(".gcs-gauges"), dials };
  });
}

/** Specs that cannot pass until the ui-gauge / ui-close branches are merged. Run them with QA_AFTER=1 after the lead merges. */
import { test } from "@playwright/test";
export const gated = (process.env.QA_AFTER ? test : test.fixme) as typeof test;
export const NEEDS = "needs ui-close/ui-gauge";

/** Every gauge's accessible label plus its leader flag, per pane: the fingerprint of the gauge calculations. */
export async function gaugeFingerprint(page: Page, scope: string = GAME_DIALOG) {
  return page.locator(`${scope} .gauge, ${scope} .gr-period, ${scope} .split-row`).evaluateAll((figs) => figs.filter((f) => f.getClientRects().length).map((f) => `${f.getAttribute("aria-label")}|${f.getAttribute("data-leader")}`).sort());
}

/** Labels the redesign moved from dials to text-first rows (`.gr-period`, goalie `.split-row`): their numbers must still equal the baseline, only the leader flag may go. */
export const REPLACED = /^(\d+(st|nd|rd|th|OT|SO)\w* period|Save percentage|Goals against average)\b|period:/;
export const splitFingerprint = (list: string[]) => ({
  dials: list.filter((e) => !REPLACED.test(e)),
  rows: list.filter((e) => REPLACED.test(e)).map((e) => e.replace(/\|[^|]*$/, "")).sort(),
});
