import type { Page, Request } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

/** Shared game fixtures and API mocking for the Phase 2 Home specs. Specs call mockApis() before page.goto(). */
export const SEASON: number = manifest.current;

/** The Eastern hockey day `offset` days from now (or from `from`). */
export const etDay = (offset = 0, from: number = Date.now()) => new Date(from + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export type FxGame = {
  id: number; season: number; type: number; date: string; start: string; state: string; scheduleState: string; venue: string;
  home: string; away: string; homeScore: number | null; awayScore: number | null; end: string; broadcasts: string[]; round: number | null;
  period?: number | null; periodType?: string | null; clock?: string | null; intermission?: boolean; homeShots?: number | null; awayShots?: number | null;
};
type Opts = Partial<FxGame> & { offset?: number; time?: string; score?: [number, number] };

const base = (id: number, away: string, home: string, o: Opts): FxGame => {
  const { offset, time, score, ...rest } = o;
  const date = o.date ?? etDay(offset ?? 0);
  return {
    id, season: SEASON, type: 2, date, start: `${date}T${time ?? "23:00"}:00Z`, state: "FUT", scheduleState: "OK", venue: "Test Arena",
    home, away, homeScore: null, awayScore: null, end: "", broadcasts: [], round: null, ...(score ? { awayScore: score[0], homeScore: score[1] } : {}), ...rest,
  } as FxGame;
};
/** Game builders. `opts` may override any Game field; `offset` is days from today (Eastern), `time` is the UTC "HH:MM" puck drop, `score` is [away, home]. */
export const mk = {
  upcoming: (id: number, away: string, home: string, o: Opts = {}) => base(id, away, home, o),
  live: (id: number, away: string, home: string, o: Opts = {}) => base(id, away, home, { state: "LIVE", period: 2, periodType: "REG", clock: "12:31", score: [1, 1], start: new Date(Date.now() - 4800_000).toISOString(), ...o }),
  intermission: (id: number, away: string, home: string, o: Opts = {}) => mk.live(id, away, home, { period: 1, clock: "00:00", intermission: true, ...o }),
  final: (id: number, away: string, home: string, o: Opts = {}) => base(id, away, home, { state: "FINAL", end: "REG", score: [2, 3], time: "00:00", ...o }),
  ot: (id: number, away: string, home: string, o: Opts = {}) => mk.final(id, away, home, { end: "OT", score: [3, 2], ...o }),
  so: (id: number, away: string, home: string, o: Opts = {}) => mk.final(id, away, home, { end: "SO", score: [2, 3], ...o }),
  postponed: (id: number, away: string, home: string, o: Opts = {}) => base(id, away, home, { scheduleState: "PPD", ...o }),
};
/** Team names come from the bundled src/data/teams.json (never fetched), so a long name cannot be injected. Long-name specs use the longest real names at narrow widths. */
export const longName = { away: "CBJ", home: "VGK" } as const;

/** A season snapshot as /api/season/<id> and /data/seasons/<id>.json serve it. */
export const snapshot = (games: FxGame[], o: { season?: number; now?: Date | number } = {}) => ({
  season: o.season ?? SEASON, updatedAt: new Date(o.now ?? Date.now()).toISOString(), source: "test fixture", games,
});
/** The /api/live payload: the Eastern date and the day's games. */
export const liveFeed = (games: FxGame[], date = etDay(0)) => ({ updatedAt: new Date().toISOString(), date, games });

export type Mock = { games: FxGame[]; live?: FxGame[] | 503; season?: "fail" | "malformed"; gameDetail?: (id: number) => unknown };
export type Log = { url: string; path: string; t: number }[];

/**
 * Registers the app's API routes and returns the log of every request they saw (`count(log, "/api/live")`).
 * live: omitted or 503 -> /api/live returns 503; an array -> that live feed (change it later with `setLive`).
 * season: "fail" -> /api/season/<id> 500 (the app falls back to /data/seasons); "malformed" -> invalid JSON on BOTH the API and /data copy.
 */
export async function mockApis(page: Page, m: Mock) {
  const log: Log = [];
  const state = { live: m.live ?? (503 as FxGame[] | 503), games: m.games };
  const note = (r: Request) => { const u = new URL(r.url()); log.push({ url: r.url(), path: u.pathname, t: Date.now() }); };
  await page.route("**/api/live", (route) => {
    note(route.request());
    return state.live === 503 ? route.fulfill({ status: 503, body: "{}" }) : route.fulfill({ json: liveFeed(state.live) });
  });
  await page.route(`**/api/season/${SEASON}`, (route) => {
    note(route.request());
    if (m.season === "fail") return route.fulfill({ status: 500, body: "{}" });
    if (m.season === "malformed") return route.fulfill({ status: 200, contentType: "application/json", body: "{not json" });
    return route.fulfill({ json: snapshot(state.games) });
  });
  await page.route(`**/data/seasons/${SEASON}.json`, (route) => {
    note(route.request());
    if (m.season === "malformed") return route.fulfill({ status: 200, contentType: "application/json", body: "{not json" });
    return route.fulfill({ json: snapshot(state.games) });
  });
  await page.route("**/api/game/*", (route) => {
    note(route.request());
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    if (m.gameDetail) return route.fulfill({ json: m.gameDetail(id) });
    const g = state.games.find((x) => x.id === id);
    return route.fulfill({ json: { ...(g ?? {}), plays: [], shots: [], goals: [], stats: [] } });
  });
  for (const p of ["**/api/moneypuck/**", "**/api/injuries/**", "**/api/picks/**"]) {
    await page.route(p, (route) => { note(route.request()); return route.fulfill({ status: 404, body: "{}" }); });
  }
  await page.route("**/data/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  return { log, setLive: (l: FxGame[] | 503) => { state.live = l; }, setGames: (g: FxGame[]) => { state.games = g; } };
}
export const count = (log: Log, path: string | RegExp) => log.filter((r) => (typeof path === "string" ? r.path === path : path.test(r.path))).length;
/** Uncaught page errors and console errors (ignoring failed-resource noise from deliberate 404/503 mocks). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|status of (4|5)\d\d/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return errors;
}
