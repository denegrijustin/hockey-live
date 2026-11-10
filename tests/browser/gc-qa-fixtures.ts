// Game Center QA fixtures for Playwright (Agent 8). Superset API of the poll-sequence builder: builder helpers + route helpers.
// Data is built from REAL recorded NHL responses (tests/fixtures/gc/real-*.json); mutations are labelled derived/replicated in raw._provenance.
// See docs/phase5-qa-fixtures.md. gc-fixtures.ts (Agent 2) may export the same concepts; this module also exports its likely names.
import type { Page, Route } from "@playwright/test";
import { SEASON } from "./qa-harness";
import * as B from "../fixtures/gc/builder.mjs";

export * from "../fixtures/gc/builder.mjs";
export type Raw = any;
/** Alias names so specs written against either builder keep working. */
export const buildPollSequence = B.pollSequence;
export const sliceAt = B.slice;
export const liveBody = (games: unknown[], date = new Date().toISOString().slice(0, 10)) => ({ updatedAt: new Date().toISOString(), date, games });

export const GAME_DIALOG = "dialog.game-dialog";

const etDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/**
 * Serves /api/game/:id from a sequence of raw responses: the Nth request gets step N (the last repeats). Returns a handle with the request log.
 * Does not touch /api/live; use openFromHome for the whole scoreboard + dialog setup.
 */
export async function serveGame(page: Page, steps: Raw | Raw[], opts: { status?: number } = {}) {
  const seq: Raw[] = Array.isArray(steps) ? steps : [steps];
  const log: { url: string; at: number; step: number }[] = [];
  let n = 0;
  const handle = {
    log,
    seq,
    get next() { return Math.min(n, seq.length - 1); },
    /** Force the next request to receive step `i`. */
    seek(i: number) { n = i; },
    get hits() { return log.length; },
  };
  await page.route("**/api/game/*", (route: Route) => {
    const i = Math.min(n++, seq.length - 1);
    log.push({ url: route.request().url(), at: Date.now(), step: i });
    if (opts.status && opts.status !== 200) return route.fulfill({ status: opts.status, json: { error: "mock" } });
    return route.fulfill({ json: B.feedOf(seq[i]) });
  });
  return handle;
}

/** Mocks the schedule: the season snapshot holds the rows as first served (live-only games are ignored by the app), /api/live serves `rows()` each time it is polled. */
export async function mockSchedule(page: Page, rows: (snapshot?: boolean) => any[], opts: { liveStatus?: number } = {}) {
  const day = etDay(new Date());
  const snapshot = { season: SEASON, updatedAt: new Date().toISOString(), source: "fixture", games: rows(true) };
  await page.route("**/api/live", (route) => (opts.liveStatus ? route.fulfill({ status: opts.liveStatus, body: "{}" }) : route.fulfill({ json: liveBody(rows(), day) })));
  await page.route(`**/api/season/${SEASON}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${SEASON}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/data/moneypuck/**/shots/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
}

/**
 * Whole setup for a spec: the real recorded game becomes "today's" row (state/period/clock from the raw envelope), the season snapshot holds that row,
 * /api/live serves it (or fails with `liveStatus`), the feed is served from `steps`, and the Game Center is opened by clicking the row.
 * `rowState` overrides the scoreboard row (e.g. {scheduleState:"PPD"}); `reload` is not needed.
 */
export async function openFromHome(page: Page, steps: Raw | Raw[], opts: { rowState?: Record<string, unknown>; liveStatus?: number } = {}) {
  const seq: Raw[] = Array.isArray(steps) ? steps : [steps];
  const first = seq[0];
  const day = etDay(new Date());
  const finished = ["OFF", "FINAL"].includes(first.gameState);
  const row = B.gameOf(first, { date: day, start: new Date(Date.now() - (finished ? 4 * 3600_000 : 3600_000)).toISOString(), ...opts.rowState });
  await mockSchedule(page, () => [row], { liveStatus: opts.liveStatus });
  const feed = await serveGame(page, seq);
  await page.goto("/");
  await page.locator(`[data-game="${row.id}"] .sb-main`).click();
  const dialog = page.locator(GAME_DIALOG);
  await dialog.waitFor({ state: "visible" });
  return { dialog, feed, row };
}
