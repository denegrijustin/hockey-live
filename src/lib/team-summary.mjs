// A team's summary for its page. Pure: the page, the dialog and the tests share it.
//
// Definitions (all "Derived" unless noted):
// - Counted games: regular season (type 2), finished (state OFF or FINAL), with a score on both sides and not tied. Playoffs and preseason are ignored.
// - Record W-L-OTL: a win is more goals; an overtime or shootout loss (end OT/SO) is an OTL, any other loss an L. Points: W 2, OTL 1, L 0.
// - pointsPct = pts / (2 * gp). Goals per game = goals / gp. Home and away records use only counted home or away games.
// - Overall record, points, GF and GA come from the standings `table[id]` when it has games, else from the counted games.
// - lastN(n): the newest n counted games. Never padded: `short: true` (and `gp < n`) when the team has fewer.
// - Streak: consecutive counted games with the same outcome, newest first. W, L and OTL are three separate types (an OT loss neither extends nor
//   breaks a regulation-loss streak: it is its own type, as on the league's own pages). null when there are no counted games.
// - Form: the newest 5 outcomes, newest first (W, L or OTL).
// - Standing: division, conference and league rank from teamRanks (points percentage, then points, regulation wins, goal difference).
// - nextGame: the live game, else the first unfinished one in play order (regular season or playoffs); `restDays` = full days off since the last finished
//   game (date difference minus 1), null when there is no previous game; `daysAway` from `today` (null without it).
// - Special teams and shots come from the league matchup snapshot (season to date). A missing value is null (shown "—"), never 0; `asOf` and `gp` label them.
import { teamRanks } from "./ranks.mjs";
import { teamGames, sideOf } from "./team-schedule.mjs";
import { normName } from "./injuries.mjs";

const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function tally(items) {
  const r = { gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0 };
  for (const i of items) {
    r.gp++; r.gf += i.us; r.ga += i.them;
    if (i.result === "W") { r.w++; r.pts += 2; } else if (i.result === "OTL") { r.otl++; r.pts += 1; } else r.l++;
  }
  return { ...r, diff: r.gf - r.ga, pointsPct: r.gp ? r.pts / (2 * r.gp) : null };
}
function lastN(counted, n) {
  const w = counted.slice(-n);
  return { n, ...tally(w), short: w.length < n };
}
/** Consecutive same outcomes from the newest game back. */
export function streakOf(counted) {
  if (!counted.length) return null;
  const type = counted.at(-1).result;
  let count = 0;
  for (let k = counted.length - 1; k >= 0 && counted[k].result === type; k--) count++;
  return { type, count };
}

const metric = (m, key) => num(m?.metrics?.[key]?.value);
/** Season-to-date special teams and shot numbers for a team from the matchup snapshot (null when absent). */
export function specialTeams(matchups, teamId) {
  const m = matchups?.teams?.[teamId];
  if (!m) return null;
  return {
    asOf: matchups.updatedAt ?? null, gp: num(m.gamesPlayed), stale: !!matchups.stale,
    pp: metric(m, "powerPlayPct"), pk: metric(m, "penaltyKillPct"),
    shotsFor: metric(m, "shotsForPerGame"), shotsAgainst: metric(m, "shotsAgainstPerGame"),
    shootingPct: metric(m, "shootingPct"), savePct: metric(m, "savePct"),
  };
}

/** @returns {null | object} null when the team has no games played (table gp 0 and no counted games). */
export function teamSummary(teamId, { teams = [], table = null, games = [], matchups = null, today = null } = {}) {
  const items = teamGames(games, teamId).map((g) => sideOf(g, teamId));
  const counted = items.filter((i) => i.game.type === 2 && i.status === "final" && i.result);
  const t = table?.[teamId];
  const own = tally(counted);
  const useTable = !!(t && t.gp > 0);
  if (!useTable && !counted.length) return null;
  const gp = useTable ? t.gp : own.gp;
  const rec = useTable ? { w: t.w, l: t.l, otl: t.ot, pts: t.pts, gf: t.gf, ga: t.ga } : own;
  const ranks = teamRanks(table, teams)?.[teamId] ?? null;
  const live = items.find((i) => i.status === "live");
  const nextGame = live ?? items.find((i) => i.status === "upcoming") ?? null;
  const lastDone = items.filter((i) => i.status === "final").at(-1);
  const restDays = nextGame && lastDone ? Math.max(0, days(lastDone.date, nextGame.date) - 1) : null;
  return {
    teamId, gp,
    record: { w: rec.w, l: rec.l, otl: rec.otl, text: `${rec.w}–${rec.l}–${rec.otl}` },
    points: rec.pts, pointsPct: gp ? rec.pts / (2 * gp) : null,
    gf: rec.gf, ga: rec.ga, diff: rec.gf - rec.ga, gfPerGame: gp ? rec.gf / gp : null, gaPerGame: gp ? rec.ga / gp : null,
    home: tally(counted.filter((i) => i.home)), away: tally(counted.filter((i) => !i.home)),
    last5: lastN(counted, 5), last10: lastN(counted, 10),
    streak: streakOf(counted), form: counted.slice(-5).reverse().map((i) => i.result),
    standing: ranks && { division: ranks.division, divisionSize: ranks.divisionSize, conference: ranks.conference, conferenceSize: ranks.conferenceSize, league: ranks.league, leagueSize: ranks.leagueSize },
    nextGame: nextGame && { ...nextGame, restDays, daysAway: today && nextGame.date ? days(today, nextGame.date) : null },
    specialTeams: specialTeams(matchups, teamId),
  };
}

const group = (p) => (p === "D" ? "D" : p === "G" ? "G" : "F");
/**
 * The roster grouped F / D / G. Forwards are C, L, R (and W); skaters sort by time on ice, goalies by games played, then name.
 * `injury` comes only from the injury report (matched by normalized name): an absent player is `null` ("no injury reported"), never "healthy".
 */
export function groupRoster(players = [], injuries = []) {
  const byName = new Map();
  for (const i of injuries ?? []) byName.set(normName(i.name), i);
  const out = { F: [], D: [], G: [] };
  for (const p of players ?? []) {
    const inj = byName.get(normName(p.name)) ?? null;
    out[group(p.position)].push({ ...p, injury: inj ? { status: inj.status ?? null, label: inj.severity?.label ?? inj.status ?? "Injury report", kind: inj.kind ?? null, back: inj.back?.text ?? null } : null });
  }
  const name = (a, b) => String(a.name).localeCompare(String(b.name));
  const skater = (a, b) => (num(b.toi) ?? -1) - (num(a.toi) ?? -1) || (b.gp ?? 0) - (a.gp ?? 0) || name(a, b);
  out.F.sort(skater); out.D.sort(skater);
  out.G.sort((a, b) => (b.gp ?? 0) - (a.gp ?? 0) || name(a, b));
  return out;
}
