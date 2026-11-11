// Why a game is worth a look, as short true facts computed from verified data only (standings snapshot, schedule, the model's own pregame estimate).
// Pure and deterministic. Never claims goalies, injuries, lineups, comebacks, milestones or TV: none of that is in the data.
import { entryLine, finished, seasonSeriesBeforeGame } from "./model.mjs";
import { teamRanks } from "./ranks.mjs";
import { closeAndLate, periodOf, upsetBrewing, upsetWon } from "./watchability.mjs";

/** Thresholds, in one place so tests and copy agree. */
export const T = {
  minGp: 10, // standings insights need this many games played by both teams
  streak: 3, // win or loss streak length
  lineGap: 3, // points from the playoff line that counts as "on the bubble"
  last5: 8, // points of 10 in the last five games
  oddsLo: 20, oddsHi: 80, // simulated playoff chance (percent) worth stating
  dog: 0.4, // model win chance at or below this is an underdog
  even: [0.45, 0.55], // model win chance range called near coin-flip
};

/** Current run from the newest result back: {kind:'W'|'L'|null, n}. 'L' counts regulation and overtime losses (no win in the run). */
export function streakOf(results) {
  const list = Array.isArray(results) ? results : [];
  const last = list.at(-1);
  if (!last) return { kind: null, n: 0 };
  const kind = last.outcome === "W" ? "W" : "L";
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if ((list[i].outcome === "W") !== (kind === "W")) break;
    n++;
  }
  return { kind, n };
}

/** Whole days of rest before the game (0 = back-to-back), or null when the team's previous finished game is not in allGames. */
export function restDays(allGames, game, teamId) {
  const previous = (allGames ?? []).filter((c) => finished(c) && c.start < game.start && (c.home === teamId || c.away === teamId)).at(-1);
  if (!previous) return null;
  return Math.max(0, Math.round((Date.parse(game.start) - Date.parse(previous.start)) / 86400000) - 1);
}

/** Points above (positive) or below (negative) the current playoff line, or null when it cannot be worked out. */
export function pointsFromLine(table, id, teams) {
  try {
    if (!table?.[id] || !teams?.length) return null;
    const line = entryLine(table, id, teams);
    return Number.isFinite(line) ? table[id].pts - line : null;
  } catch {
    return null;
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const last5Points = (results) => {
  const r = Array.isArray(results) ? results : [];
  return r.length >= 5 ? r.slice(-5).reduce((s, x) => s + (x.pts ?? 0), 0) : null;
};
const simChance = (sim, id) => {
  const v = sim?.[id]?.chance ?? sim?.teams?.[id]?.pPlayoffs;
  return Number.isFinite(v) ? Math.round(v) : null;
};
const byPriority = (x, y) => y.priority - x.priority || x.id.localeCompare(y.id);

/**
 * @param {any} game
 * @param {any} before standings snapshot before the game: table[teamId] = {gp,w,l,ot,pts,gf,ga,rw,results[]}
 * @param {any} table unused placeholder for the current table (kept for the contract; the pregame snapshot is what is true before the puck drops)
 * @param {{teams?:any[],allGames?:any[],ranks?:any,sim?:any,pregameHome?:number|null}} ctx
 * @returns {Array<{id:string,kind:'stakes'|'form'|'schedule'|'odds'|'live',priority:number,text:string,detail:string,link:{view:string,team?:string}}>}
 */
export function matchupInsights(game, before, table, ctx) {
  if (!game || !before) return [];
  const type = game.type;
  if (type !== 2 && type !== 3) return [];
  const teams = ctx?.teams ?? [];
  const allGames = ctx?.allGames ?? [];
  const home = teams.find((t) => t.id === game.home), away = teams.find((t) => t.id === game.away);
  const name = (id) => teams.find((t) => t.id === id)?.short ?? id;
  const out = [];
  const add = (id, kind, priority, text, detail, link) => out.push({ id, kind, priority, text, detail, link });
  const pregameHome = Number.isFinite(ctx?.pregameHome) ? ctx.pregameHome : null;

  // Live and final facts: true of the game itself.
  const cl = closeAndLate(game);
  const liveNow = game.state === "LIVE" || game.state === "CRIT";
  if (cl.both) add("live-close-late", "live", 100, cl.label, "A one-goal or tied game in the 3rd period or overtime.", { view: "games" });
  if (liveNow && game.periodType === "SO") add("live-so", "live", 98, "Shootout", "Regulation and overtime did not settle it.", { view: "games" });
  else if (liveNow && periodOf(game) >= 4 && !cl.both) add("live-ot", "live", 96, "In overtime", "The game is past regulation.", { view: "games" });
  const dog = upsetBrewing(game, pregameHome);
  if (dog) {
    const id = dog === "home" ? game.home : game.away, p = Math.round((dog === "home" ? pregameHome : 1 - pregameHome) * 100);
    const [a, b] = dog === "home" ? [game.homeScore, game.awayScore] : [game.awayScore, game.homeScore];
    add("live-upset", "live", 97, a === b ? `${name(id)} tied in overtime after a ${p}% pregame estimate` : `${name(id)} lead ${a}–${b} after a ${p}% pregame estimate`, "The model's pregame win chance for the team that is ahead (the underdog) was 40% or lower.", { view: "games" });
  }
  if (finished(game)) {
    const won = upsetWon(game, pregameHome);
    if (won != null) {
      const w = game.homeScore > game.awayScore ? game.home : game.away;
      add("final-upset", "live", 94, `${name(w)} won with a ${Math.round(won * 100)}% pregame estimate`, "The model's pregame win chance for the winner was 40% or lower.", { view: "games" });
    }
    if (game.end === "OT" || game.end === "SO") add("final-ot", "live", 70, game.end === "SO" ? "Decided in a shootout" : "Decided in overtime", "Tied after regulation.", { view: "games" });
  }

  // Playoffs: only facts already derivable from the games played in the series.
  if (type === 3) {
    const s = seasonSeriesBeforeGame(allGames, game);
    if (s.played > 0 && !finished(game)) {
      const lead = s.away === s.home ? null : s.away > s.home ? game.away : game.home;
      add("series", "schedule", 60, lead ? `${name(lead)} lead the series ${Math.max(s.away, s.home)}–${Math.min(s.away, s.home)}` : `Series tied ${s.away}–${s.home}`, "Wins in this playoff series before this game.", { view: "games" });
    }
    return out.sort(byPriority);
  }

  // Regular season, standings based.
  const a = before[game.away], h = before[game.home];
  const known = a && h && a.gp >= T.minGp && h.gp >= T.minGp && home && away;
  if (known) {
    const ranks = ctx?.ranks ?? teamRanks(before, teams);
    const ra = ranks?.[game.away], rh = ranks?.[game.home];
    if (home.division === away.division && ra && rh) {
      const apart = Math.abs(a.pts - h.pts);
      if (ra.division <= 2 && rh.division <= 2 && ra.division !== rh.division) {
        add("top-division", "stakes", 85, `1st meets 2nd in the ${home.division}`, `${name(game.away)} ${a.pts} pts, ${name(game.home)} ${h.pts} pts, ranked ${ra.division} and ${rh.division} in the division.`, { view: "standings" });
      } else {
        add("division", "stakes", 55, `${home.division} rivals, ${plural(apart, "point")} apart`, `${name(game.away)} ${a.pts} pts, ${name(game.home)} ${h.pts} pts.`, { view: "standings" });
      }
    }
    const ga = pointsFromLine(before, game.away, teams), gh = pointsFromLine(before, game.home, teams);
    const near = (g) => g != null && Math.abs(g) <= T.lineGap;
    const phrase = (id, g) => (g === 0 ? `${name(id)} sit on the playoff line` : `${name(id)} ${plural(Math.abs(g), "point")} ${g > 0 ? "above" : "below"} the playoff line`);
    if (near(ga) && near(gh)) add("line-both", "stakes", 80, `Both teams within ${T.lineGap} points of the playoff line`, `${phrase(game.away, ga)}; ${phrase(game.home, gh)}.`, { view: "odds" });
    else for (const [id, g] of [[game.away, ga], [game.home, gh]]) if (near(g)) add(`line-${id}`, "stakes", 75, phrase(id, g), "Points compared with the last playoff spot in the current standings.", { view: "odds", team: id });

    const sa = streakOf(a.results), sh = streakOf(h.results);
    const win = (s) => s.kind === "W" && s.n >= T.streak, lose = (s) => s.kind === "L" && s.n >= T.streak;
    if (win(sa) && win(sh)) add("streak-both", "form", 78, `Both teams are on win streaks: ${name(game.away)} ${sa.n}, ${name(game.home)} ${sh.n}`, "Consecutive wins in the latest games.", { view: "trends" });
    for (const [id, s, o] of [[game.away, sa, sh], [game.home, sh, sa]]) {
      if (win(s) && lose(o)) add("hot-slump", "form", 72, `${name(id)} (${s.n}-game win streak) face ${name(id === game.away ? game.home : game.away)} (${o.n}-game losing streak)`, "A losing streak counts regulation and overtime losses.", { view: "trends", team: id });
      else if (win(s) && !win(o)) add(`win-${id}`, "form", 65, `${name(id)} have won ${s.n} straight`, "Consecutive wins in the latest games.", { view: "trends", team: id });
      if (lose(s) && !win(o)) add(`lose-${id}`, "form", 62, `${name(id)} are trying to end a ${s.n}-game losing streak`, "Consecutive games without a win, overtime losses included.", { view: "trends", team: id });
    }
    for (const [id, r] of [[game.away, a.results], [game.home, h.results]]) {
      const p = last5Points(r);
      if (p != null && p >= T.last5) add(`last5-${id}`, "form", 58, `${name(id)} have ${p} of 10 points in their last 5`, "Points from the latest five games.", { view: "trends", team: id });
    }

    const ra0 = restDays(allGames, game, game.away), rh0 = restDays(allGames, game, game.home);
    if (ra0 === 0 && rh0 === 0) add("b2b-both", "schedule", 50, "Both teams are on a back-to-back", "Each played the previous night.", { view: "teamschedule" });
    else for (const [id, d] of [[game.away, ra0], [game.home, rh0]]) if (d === 0) add(`b2b-${id}`, "schedule", 50, `${name(id)} are on the second night of a back-to-back`, "Played the previous night.", { view: "teamschedule", team: id });

    const s = seasonSeriesBeforeGame(allGames, game);
    if (s.played === 0) add("series", "schedule", 20, "First meeting of the season", "No earlier finished games between these teams this season.", { view: "teamschedule", team: game.home });
    else {
      const lead = s.away === s.home ? null : s.away > s.home ? game.away : game.home;
      add("series", "schedule", 30, lead ? `${name(lead)} lead the season series ${Math.max(s.away, s.home)}–${Math.min(s.away, s.home)}` : `Season series tied ${s.away}–${s.home}`, "Wins in earlier meetings this season.", { view: "teamschedule", team: game.home });
    }

    for (const id of [game.away, game.home]) {
      const c = simChance(ctx?.sim, id);
      if (c != null && c >= T.oddsLo && c <= T.oddsHi) add(`odds-${id}`, "odds", 68, `${name(id)} playoff chance ${c}% in the season simulation`, "From the app's season simulation, not a guarantee.", { view: "odds", team: id });
    }

    if (pregameHome != null && !finished(game)) {
      const [lo, hi] = T.even;
      const pct = (p) => Math.round(p * 100);
      if (pregameHome >= lo && pregameHome <= hi) add("model-even", "odds", 35, `Model's pregame estimate is near a coin flip (${pct(1 - pregameHome)}–${pct(pregameHome)})`, "Away and home win chance from the model's pregame inputs.", { view: "games" });
      else if (pregameHome <= T.dog || pregameHome >= 1 - T.dog) {
        const dogId = pregameHome <= T.dog ? game.home : game.away;
        add("model-dog", "odds", 40, `Model's pregame estimate gives ${name(dogId)} ${pct(dogId === game.home ? pregameHome : 1 - pregameHome)}%`, "The model's pregame win chance for the underdog.", { view: "games" });
      }
    }
  }
  return out.sort(byPriority);
}
