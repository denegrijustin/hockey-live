import type { Page } from "@playwright/test";
import { normalizeGameFeed } from "../../src/lib/game-data.mjs";
import { rawGame, poll, envelope, deriveGoal, withPlays, dropPlay, rekeyPlay, orders, realGoals } from "../fixtures/poll-sequences.mjs";
import { mk, type FxGame } from "./fixtures-games";

/**
 * Game Center poll-sequence helpers (Phase 5; Agent 8 extends them). Used with page.route + page.clock.
 *
 * PROVENANCE. Every response is the REAL recorded NHL play-by-play tests/fixtures/raw-live-game.json (114 real events, one real game),
 * run through the real normalizeGameFeed. A "poll N" slices its plays by sortOrder (the NHL feed is append-only, so an earlier slice is
 * what the feed looked like earlier) and changes ONLY envelope fields for state (gameState, periodDescriptor, clock). Anything else is a
 * DERIVED transformation and is labelled in tests/fixtures/poll-sequences.mjs: `goal()` (a goal in the layout of a real goal event, with
 * players from the recorded roster), `without()` (a disallowed goal / correction), `rekeyed()` (same goal, new eventId).
 * Nothing here is app data: it is only served to a page under test.
 *
 * CLOCK. `GC_NOW` is one hour after the recorded game's puck drop. Install it with `page.clock.install({ time: GC_NOW })`: a later
 * clock makes the recorded game "live for more than 8 hours", which the app (correctly) reads as stale-live.
 *
 * API (small on purpose):
 *   raw()                      fresh deep copy of the recorded game
 *   at(fraction)               the sortOrder at that fraction of the game, for slicing
 *   step(state, {cut, score})  one poll body (raw NHL shape): the recorded game sliced up to `cut` with envelope `state`
 *                              (scheduled|pregame|live|intermission|ot|so|final|final-ot|final-so|postponed|suspended|cancelled)
 *   goal(afterOrder, {id, team, scores}) / without(rawBody, eventId) / rekeyed(rawBody, id, newId)   DERIVED
 *   row(kind, o)               the matching scoreboard row (Game) for the app's /api/live and season mocks
 *   installGameFeed(page, id)  routes `**\/api/game/<id>` and returns a controller: serve(rawBody) | fail(status|false) | hits | mark/since
 */
export const GC_RAW = rawGame();
export const GC_ID: number = GC_RAW.id;
export const GC_NOW = new Date(Date.parse(GC_RAW.startTimeUTC) + 3600_000);
export const raw = () => rawGame();
export { realGoals, envelope, withPlays };

const ORD = orders(GC_RAW);
export const at = (fraction: number): number => ORD[Math.floor((ORD.length - 1) * fraction)];

export type StepKind = "scheduled" | "pregame" | "live" | "intermission" | "ot" | "so" | "final" | "final-ot" | "final-so" | "postponed" | "suspended" | "cancelled";
/** One poll body in raw NHL shape. `cut` is the highest sortOrder included (default: all plays). `base` replaces the recorded game (use goal()/without() results). */
export function step(state: StepKind, o: { cut?: number; score?: { home: number; away: number }; base?: unknown } = {}) {
  return poll((o.base as typeof GC_RAW) ?? GC_RAW, { upToOrder: o.cut ?? Infinity, state, score: o.score ?? null });
}
/** DERIVED goal added after sortOrder `afterOrder` (see poll-sequences.mjs deriveGoal): returns a game body containing it. */
export function goal(afterOrder: number, o: { id: number; team?: "home" | "away"; scores: { home: number; away: number }; base?: unknown }) {
  const base = (o.base as typeof GC_RAW) ?? GC_RAW;
  return withPlays(base, deriveGoal(base, { eventId: o.id, afterOrder, team: o.team ?? "home", scores: o.scores }));
}
/** DERIVED: the body without one event (a disallowed goal removed by the NHL). */
export const without = (body: unknown, eventId: number) => dropPlay(body as typeof GC_RAW, eventId);
/** DERIVED: the same event under a new eventId. */
export const rekeyed = (body: unknown, eventId: number, newId: number) => rekeyPlay(body as typeof GC_RAW, eventId, newId);

/** The scoreboard row matching the recorded game (CAR home, FLA away), in the state `kind`. */
export function row(kind: StepKind | "live", o: Partial<FxGame> = {}): FxGame {
  const start = GC_RAW.startTimeUTC as string;
  const common = { id: GC_ID, away: GC_RAW.awayTeam.abbrev, home: GC_RAW.homeTeam.abbrev, start, date: start.slice(0, 10), venue: "Test Arena" } as Partial<FxGame>;
  const e = (x: Partial<FxGame>) => ({ ...common, ...x, ...o });
  switch (kind) {
    case "scheduled": case "pregame": return { ...mk.upcoming(GC_ID, common.away!, common.home!), ...e({ state: kind === "pregame" ? "PRE" : "FUT" }) } as FxGame;
    case "intermission": return { ...mk.intermission(GC_ID, common.away!, common.home!), ...e({ period: 1, intermission: true, clock: "11:32" }) } as FxGame;
    case "ot": return { ...mk.live(GC_ID, common.away!, common.home!), ...e({ period: 4, periodType: "OT", clock: "03:10" }) } as FxGame;
    case "so": return { ...mk.live(GC_ID, common.away!, common.home!), ...e({ period: 5, periodType: "SO", clock: null }) } as FxGame;
    case "final": return { ...mk.final(GC_ID, common.away!, common.home!), ...e({}) } as FxGame;
    case "final-ot": return { ...mk.ot(GC_ID, common.away!, common.home!), ...e({}) } as FxGame;
    case "final-so": return { ...mk.so(GC_ID, common.away!, common.home!), ...e({}) } as FxGame;
    case "postponed": case "suspended": case "cancelled": return { ...mk.postponed(GC_ID, common.away!, common.home!), ...e({ scheduleState: { postponed: "PPD", suspended: "SUSP", cancelled: "CNCL" }[kind] }) } as FxGame;
    default: return { ...mk.live(GC_ID, common.away!, common.home!), ...e({}) } as FxGame;
  }
}

/**
 * Routes `**\/api/game/<id>` (query ignored). serve(body) answers every request with that raw body (normalized like the worker does);
 * fail(500) answers with that status until fail(false); hits() counts requests; mark() + since() count from a point; urls lists the
 * exact URLs requested (so a spec can assert there is no `?score=`). Register it AFTER mockApis so it wins.
 */
export async function installGameFeed(page: Page, id: number = GC_ID, initial?: unknown) {
  let body: unknown = initial ?? step("live");
  let failing: number | false = false;
  let marked = 0;
  const urls: string[] = [];
  await page.route(new RegExp(`/api/game/${id}(\\?.*)?$`), (route) => {
    urls.push(route.request().url());
    if (failing) return route.fulfill({ status: failing, body: "{}" });
    return route.fulfill({ json: normalizeGameFeed(body as never) });
  });
  return {
    urls,
    serve: (b: unknown) => { body = b; },
    fail: (status: number | false) => { failing = status; },
    hits: () => urls.length,
    mark: () => { marked = urls.length; },
    since: () => urls.length - marked,
  };
}

/** Hidden-tab control: call BEFORE page.goto. Then `setHidden(page, true|false)` flips document.hidden and fires visibilitychange. */
export async function installVisibility(page: Page) {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    (window as unknown as { __setHidden: (v: boolean) => void }).__setHidden = (v) => { hidden = v; document.dispatchEvent(new Event("visibilitychange")); };
  });
}
export const setHidden = (page: Page, v: boolean) => page.evaluate((x) => (window as unknown as { __setHidden: (v: boolean) => void }).__setHidden(x), v);
