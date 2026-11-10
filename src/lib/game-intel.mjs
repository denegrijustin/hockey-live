// Game intelligence: short true facts about ONE game, each generated from named numbers (no narrative that the data cannot support).
// Pure and deterministic (no clock, no network). Items: {id, kind, phase:'pre'|'live'|'post', priority, text, detail, basis, link?}.
//
// basis: 'official'   = a value the NHL feed states directly (the current strength situation);
//        'derived'    = counted or computed by Iceboard from the play-by-play or the standings table (the arithmetic is in `detail`);
//        'historical' = season-to-date numbers from earlier games (special-teams ranks);
//        'projection' = what-if arithmetic on the pregame table (points at stake), not a forecast of the result.
//
// Definitions, inputs and limits (also docs/phase5-intel.md):
//  * Goal flow uses goal plays in regulation and overtime (shootout goals excluded). The running score is `play.score` (score after the goal,
//    official) when present, else the running count of goals by team. If the fallback count disagrees with the game's own score the flow is
//    reported as unavailable (an incomplete feed), never guessed.
//  * Lead change: a goal that puts the team that was behind ahead (a tie in between still counts as one change). Tie: a goal that makes the score
//    equal and non-zero. Comeback: the team that leads (live) or won (final) once trailed by N >= 2. Scoring run: >= 3 consecutive goals by one team.
//    Game-winning goal: the goal after which the winner's total first exceeds the loser's final regulation/OT total.
//  * Strength code `sit` "ABCD" = away goalie in net (1/0), away skaters, home skaters, home goalie. A power-play goal needs the scorer's goalie in,
//    the opponent's goalie in, and more scorer skaters than opponent skaters; anything else (empty net, equal strength) is never called a power-play goal.
//  * Penalties are counted from penalty plays with a positive duration, by the penalized team (`play.team`); minutes are the listed durations.
//    Power-play opportunities are NOT counted (coincident and offsetting penalties cannot be told apart from the feed).
//  * Standings impact: applyResult (model.mjs) on a copy of the pregame table (analysis.before[game.id]) with only this game applied; other games the same
//    day are not applied. Compared: gapToLine (status and points margin), conference points rank, clinchStatus (points arithmetic only, tiebreakers
//    ignored, shown as "computed from points"). Skipped when either team has played fewer than MIN_GP games or for non regular-season games.
import { applyResult, finished, pointsRank, scenario, signed } from "./model.mjs";
import { clinchStatus, gapToLine } from "./standings-view.mjs";
import { specialTeamsRank } from "./trends.mjs";
import { gameStatus } from "./game-status.mjs";

export const MIN_GP = 10;
export const RUN_MIN = 3;
export const COMEBACK_MIN = 2;
export const BLOWOUT_MIN = 4;
export const EDGE_MIN = 6; // rank points of net special-teams advantage before one side is named

export const BASIS_LABEL = { official: "Official", derived: "Derived", historical: "Historical", projection: "Projection" };
export const BASIS_HELP = {
  official: "Stated by the NHL feed.",
  derived: "Counted or computed by Iceboard from the play-by-play or the standings table; the numbers are shown.",
  historical: "Season-to-date results from earlier games.",
  projection: "What-if arithmetic on the pregame table, not a forecast of the result.",
};

const ord = (n) => { const t = n % 100; if (t >= 11 && t <= 13) return `${n}th`; return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`; };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const secs = (t) => { const m = /^(\d+):(\d{2})$/.exec(String(t ?? "")); return m ? +m[1] * 60 + +m[2] : null; };
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Which group of intel applies: 'pre' | 'live' | 'post' | null (postponed, canceled, suspended or unknown). */
export function intelPhase(game) {
  if (!game) return null;
  const k = gameStatus(game).kind;
  if (k === "upcoming") return "pre";
  if (k === "live" || k === "intermission") return "live";
  if (k === "final") return "post";
  return null;
}

/** NHL situation code "ABCD" -> {awayGoalie, awaySkaters, homeSkaters, homeGoalie} or null when it is not four digits. */
export function decodeSit(sit) {
  if (typeof sit !== "string" || !/^\d{4}$/.test(sit)) return null;
  const [ag, as, hs, hg] = [...sit].map(Number);
  return { awayGoalie: ag, awaySkaters: as, homeSkaters: hs, homeGoalie: hg };
}

/** Period label for a play: P1..P3, OT (regular season) or 1OT/2OT (playoffs), SO. */
export function periodLabel(play, game) {
  if (play.periodType === "SO") return "SO";
  if (play.periodType === "OT" || play.period > 3) return game?.type === 3 ? `${Math.max(1, play.period - 3)}OT` : "OT";
  return `P${play.period}`;
}
const at = (play, game) => `${periodLabel(play, game)} ${play.time ?? ""}`.trim();
/** Seconds of game time elapsed at a play (regular-season overtime is 5 minutes, playoff overtimes 20). */
function elapsed(play, game) {
  const s = secs(play.time);
  if (s == null) return null;
  const p = Math.max(1, play.period ?? 1);
  if (p <= 3) return (p - 1) * 1200 + s;
  return 3600 + (game?.type === 3 ? (p - 4) * 1200 : 0) + s;
}

/**
 * Regulation/overtime goals in feed order with the score after each: [{play, home, away, team, scorer, at, elapsed}].
 * Returns null when the score cannot be established (see header).
 */
export function goalSequence(plays, game) {
  const goals = (Array.isArray(plays) ? plays : []).filter((p) => p?.type === "goal" && p.periodType !== "SO")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  let home = 0, away = 0, fromFeed = true;
  const seq = goals.map((p) => {
    if (p.score && Number.isFinite(p.score.home) && Number.isFinite(p.score.away)) { home = p.score.home; away = p.score.away; }
    else { fromFeed = false; if (p.team === game?.home) home++; else away++; }
    return { play: p, home, away, team: p.team, scorer: p.player ?? null, at: at(p, game), elapsed: elapsed(p, game) };
  });
  if (!fromFeed && Number.isFinite(game?.homeScore) && Number.isFinite(game?.awayScore)) {
    const so = game.end === "SO" ? 1 : 0;
    const total = game.homeScore + game.awayScore - so;
    if (seq.length !== total && !(game.state === "LIVE" || game.state === "CRIT")) return null;
    if (seq.length > total) return null;
  }
  return seq;
}

function leaderOf(h, a) { return h > a ? "home" : a > h ? "away" : null; }
const sideOf = (game, team) => (team === game.home ? "home" : team === game.away ? "away" : null);

/**
 * Lead changes, ties, largest lead, comeback, first goal. Returns {leadChanges, ties, largest:{team,margin,seq}|null, comeback:{team,deficit,seq}|null, first, goals}
 * or null with no goals / no reliable score.
 */
export function leadChanges(plays, game) {
  const seq = goalSequence(plays, game);
  if (!seq || !seq.length) return null;
  let changes = 0, ties = 0, prevLeader = null, lastNonTie = null;
  let largest = null;
  const deficit = { home: 0, away: 0 }, deficitAt = { home: null, away: null };
  for (const s of seq) {
    const lead = leaderOf(s.home, s.away);
    if (lead === null) { if (s.home > 0) ties++; }
    else if (lastNonTie && lead !== lastNonTie) changes++;
    if (lead) lastNonTie = lead;
    prevLeader = lead;
    const margin = Math.abs(s.home - s.away);
    if (lead && (!largest || margin > largest.margin)) largest = { team: lead === "home" ? game.home : game.away, margin, seq: s };
    for (const side of ["home", "away"]) {
      const d = side === "home" ? s.away - s.home : s.home - s.away;
      if (d > deficit[side]) { deficit[side] = d; deficitAt[side] = s; }
    }
  }
  const last = seq.at(-1);
  const finalLeader = leaderOf(last.home, last.away);
  // Comeback: the team now ahead (live) or that won (final) after trailing by COMEBACK_MIN or more. A tied live game is a comeback for a team that was down.
  let comeback = null;
  const sides = finalLeader ? [finalLeader] : ["home", "away"];
  for (const side of sides) {
    if (deficit[side] >= COMEBACK_MIN && (!comeback || deficit[side] > comeback.deficit))
      comeback = { team: side === "home" ? game.home : game.away, deficit: deficit[side], seq: deficitAt[side], tied: !finalLeader };
  }
  void prevLeader;
  return { leadChanges: changes, ties, largest, comeback, first: seq[0], goals: seq.length, seq };
}

/** Unanswered runs of RUN_MIN or more goals: [{team, count, from, to, seconds|null, score:{from,to}}], longest first. */
export function scoringRuns(plays, game, min = RUN_MIN) {
  const seq = goalSequence(plays, game);
  if (!seq || !seq.length) return [];
  const runs = [];
  let cur = null;
  for (const s of seq) {
    if (cur && cur.team === s.team) { cur.count++; cur.last = s; }
    else { if (cur) runs.push(cur); cur = { team: s.team, count: 1, first: s, last: s }; }
  }
  if (cur) runs.push(cur);
  return runs.filter((r) => r.count >= min).map((r) => ({
    team: r.team, count: r.count, from: r.first.at, to: r.last.at,
    seconds: r.first.elapsed != null && r.last.elapsed != null ? Math.max(0, r.last.elapsed - r.first.elapsed) : null,
    score: { from: `${r.first.away}-${r.first.home}`, to: `${r.last.away}-${r.last.home}` },
  })).sort((a, b) => b.count - a.count || (a.from < b.from ? -1 : 1));
}

/** Goals with strength from the `sit` code: {pp:{TEAM:n}, sh:{TEAM:n}, en:{TEAM:n}, known:number} (known = goals whose code decoded). */
export function goalStrength(plays, game) {
  const out = { pp: {}, sh: {}, en: {}, known: 0 };
  for (const p of Array.isArray(plays) ? plays : []) {
    if (p?.type !== "goal" || p.periodType === "SO") continue;
    const s = decodeSit(p.sit);
    if (!s) continue;
    const side = sideOf(game, p.team);
    if (!side) continue;
    out.known++;
    const own = side === "home" ? { g: s.homeGoalie, k: s.homeSkaters } : { g: s.awayGoalie, k: s.awaySkaters };
    const opp = side === "home" ? { g: s.awayGoalie, k: s.awaySkaters } : { g: s.homeGoalie, k: s.homeSkaters };
    if (opp.g === 0 && own.g === 1) { out.en[p.team] = (out.en[p.team] ?? 0) + 1; continue; }
    if (own.g !== 1 || opp.g !== 1) continue;
    if (own.k > opp.k) out.pp[p.team] = (out.pp[p.team] ?? 0) + 1;
    else if (own.k < opp.k) out.sh[p.team] = (out.sh[p.team] ?? 0) + 1;
  }
  return out;
}

/** Penalties by team: {TEAM:{count, minutes}} from plays with a positive duration. */
export function penaltyCounts(plays) {
  const out = {};
  for (const p of Array.isArray(plays) ? plays : []) {
    if (p?.type !== "penalty" || !p.team || !(p.duration > 0)) continue;
    const e = (out[p.team] ??= { count: 0, minutes: 0 });
    e.count++; e.minutes += p.duration;
  }
  return out;
}

const mk = (phase, id, kind, priority, text, detail, basis, link) => ({ id, kind, phase, priority, text, detail, basis, ...(link ? { link } : {}) });
const nameOf = (teams, id) => (teams ?? []).find((t) => t.id === id)?.short ?? id;

/** Flow items for a live or final game: first goal, lead changes and ties, largest lead, comeback, scoring runs, game-winning goal, margin. */
export function flowItems(plays, game, teams, phase) {
  const f = leadChanges(plays, game);
  if (!f) return [];
  const n = (id) => nameOf(teams, id), out = [];
  const add = (...a) => out.push(mk(phase, ...a));
  const sc = (s) => `${s.away}-${s.home}`;
  const first = f.first;
  const firstName = first.scorer ? `${first.scorer} (${n(first.team)})` : n(first.team);
  add("first-goal", "flow", 50, `${n(first.team)} scored first`, `${firstName} at ${first.at}; ${n(game.away)}-${n(game.home)} ${sc(first)}.`, "derived", { team: first.team });
  if (f.leadChanges + f.ties > 0)
    add("lead-changes", "flow", 62, `${plural(f.leadChanges, "lead change")}, tied ${plural(f.ties, "time")}`, `Counted from ${plural(f.goals, "goal")} in regulation and overtime (running score ${f.seq.map(sc).join(", ")}).`, "derived");
  if (f.largest && f.largest.margin >= 2)
    add("largest-lead", "flow", 55, `Largest lead: ${n(f.largest.team)} by ${f.largest.margin}`, `${sc(f.largest.seq)} (${n(game.away)}-${n(game.home)}) at ${f.largest.seq.at}.`, "derived", { team: f.largest.team });
  if (f.comeback) {
    const c = f.comeback;
    add("comeback", "flow", 90, `${n(c.team)} ${phase === "post" ? "won after trailing by" : c.tied ? "tied it after trailing by" : "lead after trailing by"} ${c.deficit}`, `Largest deficit ${c.deficit} goals, ${sc(c.seq)} (${n(game.away)}-${n(game.home)}) at ${c.seq.at}.`, "derived", { team: c.team });
  }
  for (const r of scoringRuns(plays, game).slice(0, 2)) {
    const span = r.seconds != null ? `, ${mmss(r.seconds)} of game time` : "";
    add(`run-${r.team}-${r.from.replace(/\W+/g, "")}`, "flow", 70, `${n(r.team)} scored ${r.count} unanswered`, `${r.from} to ${r.to}${span}; score went from ${r.score.from} to ${r.score.to} (${n(game.away)}-${n(game.home)}).`, "derived", { team: r.team });
  }
  if (phase === "post") {
    const hs = game.homeScore, as = game.awayScore;
    const so = game.end === "SO";
    const regOt = (hs ?? 0) + (as ?? 0) - (so ? 1 : 0);
    if (!so && Number.isFinite(hs) && Number.isFinite(as) && hs !== as && f.goals === regOt) {
      const winner = hs > as ? "home" : "away", wTeam = winner === "home" ? game.home : game.away;
      const loserFinal = winner === "home" ? as : hs;
      const gw = f.seq.find((s) => (winner === "home" ? s.home : s.away) > loserFinal && s.team === wTeam && (winner === "home" ? s.home : s.away) === loserFinal + 1);
      if (gw) add("game-winner", "flow", 58, `Game-winning goal: ${gw.scorer ?? n(gw.team)} (${n(gw.team)})`, `${gw.at}; goal number ${loserFinal + 1} for ${n(wTeam)}, one more than the loser's final total of ${loserFinal}.`, "derived", { team: gw.team });
      const margin = Math.abs(hs - as);
      if (margin === 1) add("one-goal", "flow", 60, "Decided by one goal", `Final ${as}-${hs} (${n(game.away)}-${n(game.home)}).`, "derived");
      else if (margin >= BLOWOUT_MIN) add("blowout", "flow", 60, `Decided by ${margin} goals`, `Final ${as}-${hs} (${n(game.away)}-${n(game.home)}).`, "derived");
    }
  }
  return out;
}

/** Current special-teams situation (official, live only) plus penalties and power-play goals counted from the plays. */
export function powerPlayStatus(plays, situation, game, teams, { live = false } = {}) {
  const phase = live ? "live" : "post";
  const n = (id) => nameOf(teams, id), out = [];
  const add = (...a) => out.push(mk(phase, ...a));
  if (live && situation && (situation.homePowerPlay || situation.awayPowerPlay) && !(situation.homePowerPlay && situation.awayPowerPlay)) {
    const pp = situation.homePowerPlay ? game.home : game.away, pk = situation.homePowerPlay ? game.away : game.home;
    const [a, b] = situation.homePowerPlay ? [situation.home, situation.away] : [situation.away, situation.home];
    const strength = Number.isFinite(a) && Number.isFinite(b) ? `${a}-on-${b}` : null;
    const left = Number.isFinite(situation.seconds) && situation.seconds > 0 ? `; situation clock ${mmss(situation.seconds)}` : "";
    add("pp-now", "special", 95, `${n(pp)} on the power play${strength ? ` (${strength})` : ""}`, `${n(pk)} are shorthanded. The feed's current situation${left}.`, "official", { team: pp });
  }
  const pens = penaltyCounts(plays);
  const ids = [game.away, game.home].filter((id) => pens[id]);
  if (ids.length) {
    const part = (id) => `${n(id)} ${pens[id].count} (${pens[id].minutes} min)`;
    add("penalties", "special", 40, `Penalties: ${ids.map(part).join(", ")}`, `Counted from penalty plays with a listed duration; power-play opportunities are not counted.`, "derived");
  }
  const gs = goalStrength(plays, game);
  if (gs.known > 0) {
    const pp = [game.away, game.home].filter((id) => gs.pp[id]), sh = [game.away, game.home].filter((id) => gs.sh[id]), en = [game.away, game.home].filter((id) => gs.en[id]);
    const bits = [];
    if (pp.length) bits.push(`power-play goals ${pp.map((id) => `${n(id)} ${gs.pp[id]}`).join(", ")}`);
    if (sh.length) bits.push(`short-handed goals ${sh.map((id) => `${n(id)} ${gs.sh[id]}`).join(", ")}`);
    if (en.length) bits.push(`empty-net goals ${en.map((id) => `${n(id)} ${gs.en[id]}`).join(", ")}`);
    if (bits.length) add("pp-goals", "special", 45, bits.join("; ").replace(/^./, (c) => c.toUpperCase()), `From the strength code on ${plural(gs.known, "goal")} (skaters and goalies on the ice at the goal).`, "derived");
  }
  return out;
}

/** Pregame: one short special-teams comparison (ranks from the league snapshot). The full bullets stay in the Matchup lens. */
export function specialTeamsEdge(snapshot, awayId, homeId, teams) {
  const a = specialTeamsRank(snapshot, awayId).value, h = specialTeamsRank(snapshot, homeId).value;
  if (!a?.pp || !a?.pk || !h?.pp || !h?.pk) return [];
  const n = (id) => nameOf(teams, id);
  const adv = (pp, pk) => pk.rank - pp.rank; // positive: the power play ranks better than the penalty kill it faces
  const aAdv = adv(a.pp, h.pk), hAdv = adv(h.pp, a.pk), net = aAdv - hAdv;
  const lead = Math.abs(net) >= EDGE_MIN ? (net > 0 ? awayId : homeId) : null;
  const text = lead ? `Special-teams edge: ${n(lead)}` : "Special teams look even";
  const detail = `Season ranks, power play / penalty kill: ${n(awayId)} ${ord(a.pp.rank)} / ${ord(a.pk.rank)}, ${n(homeId)} ${ord(h.pp.rank)} / ${ord(h.pk.rank)}. Net rank advantage ${n(awayId)} ${signed(net)} (power play rank vs the penalty kill it faces, each side). Details in the Matchup lens.`;
  return [mk("pre", "special-teams-edge", "special", 48, text, detail, "historical", { section: "matchup-lens", ...(lead ? { team: lead } : {}) })];
}

const SPOT = { in: "a division playoff spot", wc1: "the first wild card", wc2: "the second wild card", out: "a place outside the playoff line" };
const clone = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { ...v, results: [...(v.results ?? [])] }]));

/** Postgame: standings movement from applying the final to the pregame table. Regular-season finals only. */
export function standingsImpact(before, game, teams, allGames = []) {
  if (!before || !game || game.type !== 2 || !finished(game) || !Array.isArray(teams) || !teams.length) return [];
  if (game.homeScore == null || game.awayScore == null || game.homeScore === game.awayScore) return [];
  const ids = [game.away, game.home];
  if (ids.some((id) => !before[id] || before[id].gp < MIN_GP) || teams.some((t) => !before[t.id])) return [];
  const after = clone(before);
  applyResult(after, game);
  if (after[game.home].gp === before[game.home].gp) return [];
  // Games that are not in the pregame table (this game's day and later) still count as remaining for the "before" clinch math; the final applies to "after".
  const pend = (g) => (g.id === game.id || (g.date ?? "") >= (game.date ?? "")) ? { ...g, state: "FUT" } : g;
  const gBefore = (allGames ?? []).map(pend);
  const gAfter = (allGames ?? []).map((g) => (g.id === game.id ? g : pend(g)));
  let cb = null, ca = null;
  try { if (gBefore.length) { cb = clinchStatus(before, gBefore, teams); ca = clinchStatus(after, gAfter, teams); } } catch { cb = ca = null; }
  const out = [];
  const n = (id) => nameOf(teams, id);
  for (const id of ids) {
    const gb = gapToLine(before, id, teams), ga = gapToLine(after, id, teams);
    if (!gb || !ga) continue;
    const conf = teams.filter((t) => t.conference === teams.find((x) => x.id === id)?.conference).map((t) => t.id);
    const rb = pointsRank(before, id, conf), ra = pointsRank(after, id, conf);
    const moved = gb.status !== ga.status;
    const better = ["out", "wc2", "wc1", "in"].indexOf(ga.status) > ["out", "wc2", "wc1", "in"].indexOf(gb.status);
    const margin = !Number.isFinite(ga.pts) ? null : ga.pts === 0 ? "level on points with the line" : `${plural(Math.abs(ga.pts), "point")} ${ga.pts > 0 ? "above" : "below"} the line`;
    const tb = ga.status === "out" && ga.pts >= 0 ? " (behind on the ordering rules)" : "";
    const verb = moved ? (better ? "move into" : "drop to") : "stay in";
    const text = `${n(id)} ${verb} ${SPOT[ga.status]}${margin ? `: ${margin}${tb}` : ""}`;
    const refTxt = (g) => (g.ref && Number.isFinite(g.pts) ? `${signed(g.pts)} vs ${n(g.ref)}` : "no reference team");
    const detail = `Before ${SPOT[gb.status]} (${refTxt(gb)}), after ${SPOT[ga.status]} (${refTxt(ga)}). Conference points rank ${rb.tied ? "T-" : ""}${ord(rb.rank)} to ${ra.tied ? "T-" : ""}${ord(ra.rank)}; ${before[id].pts} to ${after[id].pts} points. Pregame table plus this result only.`;
    out.push(mk("post", `standings-${id}`, "standings", moved ? 88 : 52, text, detail, "derived", { team: id, section: "standings" }));
    if (cb && ca && ca[id].status && ca[id].status !== cb[id].status) {
      const clinched = ca[id].status === "clinched";
      out.push(mk("post", `clinch-${id}`, "standings", 92, `${n(id)} ${clinched ? "clinch a playoff spot" : "are eliminated from playoff contention"} (computed from points)`, `Points arithmetic only: ${after[id].pts} points now, maximum counts remaining games at 2 points each; tiebreakers are not applied and this is not an official clinch.`, "derived", { team: id, section: "standings" }));
    }
  }
  return out;
}

/** Pregame stakes: what a win, overtime loss and regulation loss would do for each team, from model.scenario (points and distance from the line). */
export function stakesItems(before, game, teams) {
  if (!before || !game || game.type !== 2 || !Array.isArray(teams) || teams.length < 2) return [];
  const ids = [game.away, game.home];
  if (ids.some((id) => !before[id] || before[id].gp < MIN_GP) || teams.some((t) => !before[t.id])) return [];
  try {
    const n = (id) => nameOf(teams, id);
    const part = (id) => {
      const w = scenario(before, game, id, "win", teams), o = scenario(before, game, id, "otl", teams), l = scenario(before, game, id, "loss", teams);
      return { id, text: `${n(id)}: win ${w.points} pts (${signed(w.gap)} from the line), loss in overtime ${o.points} (${signed(o.gap)}), regulation loss ${l.points} (${signed(l.gap)})` };
    };
    const [a, h] = [part(game.away), part(game.home)];
    return [mk("pre", "stakes-scenarios", "stakes", 52, "Points at stake: what each result does to the playoff line", `${a.text}. ${h.text}. Arithmetic on the pregame table (${ids.map((id) => `${n(id)} ${before[id].pts} pts in ${before[id].gp} games`).join(", ")}).`, "projection", { section: "standings" })];
  } catch { return []; }
}

const sorted = (items) => items.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

/**
 * All items that apply to the game's phase. ctx: {plays, situation, teams, before, allGames, matchups, exclude: ids|Set of ids or kinds already shown elsewhere}.
 * Never emits season series, recent form or odds; `exclude` drops any id (or kind) the caller already shows (insights.mjs / the Matchup lens).
 */
export function buildIntel(game, ctx = {}) {
  const phase = intelPhase(game);
  if (!phase) return [];
  const { plays = [], situation = null, teams = [], before = null, allGames = [], matchups = null } = ctx;
  const ex = new Set(ctx.exclude ?? []);
  let items = [];
  if (phase === "pre" || phase === "live") {
    items.push(...specialTeamsEdge(matchups, game.away, game.home, teams), ...stakesItems(before, game, teams));
  }
  if (phase === "live") {
    items.push(...flowItems(plays, game, teams, "live"), ...powerPlayStatus(plays, situation, game, teams, { live: true }));
  }
  if (phase === "post") {
    items = [...flowItems(plays, game, teams, "post"), ...powerPlayStatus(plays, null, game, teams, { live: false }), ...standingsImpact(before, game, teams, allGames)];
  }
  return sorted(items.filter((i) => !ex.has(i.id) && !ex.has(i.kind)));
}
