// DERIVED fixtures for the Game intelligence tests: goal plays rebuilt from the real recorded MoneyPuck shot files (tests/fixtures/shots/*.json) and
// penalty plays from the real recorded NHL feed (tests/fixtures/raw-live-game.json). The shapes follow normalizeGameFeed; times are rebuilt from the
// seconds-in-game of each goal, strength codes from MoneyPuck's "XonY" label (shooting team skaters on opponent skaters; "other" with en=1 is an empty net).
// Nothing here is invented: every goal is a real goal in a real game. Labelled derived in the specs.
import { readFileSync } from "node:fs";

const json = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
export const shotFile = (id) => json(`./shots/${id}.json`);

export function derivedGame(id, extra = {}) {
  const d = shotFile(id);
  const goals = d.shots.filter((s) => s.g);
  const regot = goals.filter((s) => s.p <= 4);
  const hs = regot.filter((s) => s.team === d.home).length, as = regot.filter((s) => s.team === d.away).length;
  const ot = goals.some((s) => s.p === 4);
  return { id, season: d.seasonId, type: 2, date: "2026-10-12", start: "2026-10-12T23:00:00Z", state: "FINAL", scheduleState: "OK", home: d.home, away: d.away, homeScore: hs, awayScore: as, end: ot ? "OT" : "REG", period: ot ? 4 : 3, periodType: ot ? "OT" : "REG", ...extra };
}

export function derivedGoalPlays(id) {
  const d = shotFile(id);
  let home = 0, away = 0, order = 0;
  return d.shots.filter((s) => s.g).map((s) => {
    if (s.team === d.home) home++; else away++;
    const inPeriod = s.t - (s.p <= 3 ? (s.p - 1) * 1200 : 3600);
    const m = /^(\d)on(\d)$/.exec(s.sit ?? "");
    const own = m ? +m[1] : 5, opp = m ? +m[2] : s.en ? 6 : 5;
    const homeShoots = s.team === d.home;
    const sit = homeShoots ? `${s.en ? 0 : 1}${opp}${own}1` : `1${own}${opp}${s.en ? 0 : 1}`;
    return {
      id: 100 + order, order: ++order, period: s.p, periodType: s.p > 3 ? "OT" : "REG", time: `${String(Math.floor(inPeriod / 60)).padStart(2, "0")}:${String(inPeriod % 60).padStart(2, "0")}`,
      type: "goal", team: s.team, player: s.by?.name ?? null, pid: s.by?.id ?? null, sit,
      score: { home, away }, penalty: null, duration: null, x: s.x, y: s.y,
    };
  });
}

/** Real penalty plays (team, minutes) from the recorded feed, in the normalized shape. */
export function realPenaltyPlays() {
  const raw = json("./raw-live-game.json");
  const abbr = { [raw.homeTeam.id]: raw.homeTeam.abbrev, [raw.awayTeam.id]: raw.awayTeam.abbrev };
  return raw.plays.filter((p) => p.typeDescKey === "penalty").map((p) => ({
    id: p.eventId, order: p.sortOrder, period: p.periodDescriptor.number, periodType: p.periodDescriptor.periodType, time: p.timeInPeriod, type: "penalty",
    team: abbr[p.details.eventOwnerTeamId] ?? null, penalty: p.details.descKey, duration: p.details.duration ?? null, sit: p.situationCode,
  }));
}
export const rawLive = () => json("./raw-live-game.json");
