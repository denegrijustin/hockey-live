// The game recap: who created the better chances, how the expected goals built up, where each team shot from, the numbers side by side and the goals.
// Works from the live game feed (so it updates as the game is played) and, for a finished game MoneyPuck has, from MoneyPuck's own expected-goal values.
// Pure, so the card and the tests share it.
import { playMinute, pulseMinute } from "./pulse.mjs";

const NET = 89;
/** A shot worth at least this much expected goals (a one-in-five chance or better) is a high-chance shot. */
export const HIGH_XG = 0.2;
const ATTEMPT = { goal: "goal", "shot-on-goal": "sog", "missed-shot": "miss" };

/**
 * An estimate of the chance a shot is a goal from where it was taken: distance and angle only. Fitted to MoneyPuck's expected-goal values on this site's own
 * 3,367 shots (correlation 0.6 with theirs), so it is rougher than a model that also knows shot type, rebounds and rush chances. Used for live games.
 * @param {number} x feet along the rink, either end. @param {number} y feet across.
 */
export function estimateXg(x, y) {
  const dx = Math.max(NET - Math.abs(x), 0);
  const dist = Math.hypot(dx, y);
  const angle = Math.abs(Math.atan2(Math.abs(y), Math.max(dx, 1)));
  const z = -1.3956812 - 0.0602549 * dist + 0.2710695 * Math.log(dist + 1) - 1.1509083 * angle;
  return Math.min(0.9, (1.185 / (1 + Math.exp(-z))));
}

const clock = (t) => {
  const p = Math.floor(t / 1200) + 1;
  const regs = Math.min(3, p), over = p > 3;
  const into = over ? t - 3600 - (p - 4) * 300 : t - (p - 1) * 1200;
  const left = (over ? 300 : 1200) - into;
  void regs;
  return { period: p, label: `${p > 3 ? (p === 4 ? "OT" : `${p - 3}OT`) : ["1st", "2nd", "3rd"][p - 1]} ${String(Math.floor(into / 60)).padStart(2, "0")}:${String(Math.floor(into % 60)).padStart(2, "0")}`, left };
};

/** Every unblocked attempt, one shape whichever source it came from. */
export function attemptsOf(game, mp) {
  const out = [];
  if (mp?.shots?.length) {
    for (const s of mp.shots) {
      if (s.x == null || s.y == null || !s.team) continue;
      out.push({ team: s.team, home: s.team === game.home, xg: s.xg, goal: !!s.g, sog: !!(s.sog || s.g), x: s.x, y: s.y, t: s.t, player: s.by?.name ?? null, playerId: s.by?.id ?? null, gk: s.gk ?? null, en: !!s.en, period: s.p });
    }
    return { list: out, source: "moneypuck" };
  }
  const source = Array.isArray(game.plays) && game.plays.length ? game.plays : (game.shots ?? []);
  for (const p of source) {
    const kind = ATTEMPT[p.type];
    if (!kind || p.periodType === "SO" || p.x == null || p.y == null || !p.team) continue;
    const home = p.team === game.home;
    if (!home && p.team !== game.away) continue;
    const minute = playMinute(p, game.type);
    out.push({ team: p.team, home, xg: estimateXg(p.x, p.y), goal: kind === "goal", sog: kind !== "miss", x: Math.abs(p.x), y: p.y, t: minute == null ? 0 : minute * 60, player: p.player ?? null, playerId: null, gk: null, en: false, period: p.period });
  }
  return { list: out, source: "estimate" };
}

/** P(goals = k) for independent chances: the Poisson-binomial distribution, exactly. */
function goalsDistribution(ps) {
  let d = [1];
  for (const p of ps) {
    const next = new Array(d.length + 1).fill(0);
    for (let k = 0; k < d.length; k++) { next[k] += d[k] * (1 - p); next[k + 1] += d[k] * p; }
    d = next;
  }
  return d;
}

/** The chance each side deserved to win from the chances it created: every attempt replayed, a tie after that split evenly (overtime). */
export function deservedToWin(homeXg, awayXg) {
  const h = goalsDistribution(homeXg), a = goalsDistribution(awayXg);
  let home = 0, away = 0, tie = 0;
  for (let i = 0; i < h.length; i++) for (let j = 0; j < a.length; j++) { const p = h[i] * a[j]; if (i > j) home += p; else if (j > i) away += p; else tie += p; }
  return { home: home + tie / 2, away: away + tie / 2, tie };
}

/** How much of a goalie's goals saved above expected counts toward the deserved win: half, since one game is a small sample. */
export const GOALIE_WEIGHT = 0.5;

/**
 * Goaltending in this game, per side: the goals that side's goalie saved above expected, the expected goals of the on-target shots it faced (empty-net shots left
 * out) minus the goals it let in. Positive is a goalie stealing the game; negative is one letting in what he should have stopped.
 */
export function goaltending(list) {
  const side = (home) => {
    const faced = list.filter((a) => a.home !== home && a.sog && !a.en);
    return faced.reduce((sum, a) => sum + a.xg, 0) - faced.filter((a) => a.goal).length;
  };
  return { home: side(true), away: side(false) };
}

/** A side's attempts with the goalie facing them taken into account: each on-target shot's chance scales by how the goalie played (half credit), within reason. */
function withGoalie(attempts, saved) {
  const onTarget = attempts.filter((a) => a.sog && !a.en).reduce((sum, a) => sum + a.xg, 0);
  const factor = onTarget > 0.01 ? Math.min(1.5, Math.max(0.5, (onTarget - GOALIE_WEIGHT * saved) / onTarget)) : 1;
  return attempts.map((a) => (a.sog && !a.en ? Math.min(0.95, a.xg * factor) : a.xg));
}

/** What "deserve" means, in one sentence. */
export const DESERVE_EXPLAINED = "Deserve is the chance each team would win if every shot attempt in the game were replayed, each weighed by how likely it was to score (its expected goals). Goaltending counts: a goalie who saves more than the shots should have scored against (goals saved above expected) lowers the other side's chances, half credit, and one who lets in more raises them. It leaves the real score out, so a team can lead and still trail on the chances.";

/**
 * When the score and the chances disagree (a team ahead on the scoreboard with under 40% of the deserved win), the sentence that says why. Null when they agree, the
 * game is tied, or there is nothing to compare. `short` fits a card; `long` is for the recap.
 * @param {{ away: string, home: string, score: { away: number | null, home: number | null } | null, deserved: { away: number, home: number } | null, xg?: { away: number, home: number } | null, over?: boolean, goalie?: { away: number, home: number } | null }} o
 */
export function deserveNote({ away, home, score, deserved, xg = null, over = false, goalie = null }) {
  if (!deserved || !score || score.away == null || score.home == null || score.away === score.home) return null;
  const homeAhead = score.home > score.away;
  const lead = homeAhead ? home : away, trail = homeAhead ? away : home;
  const leadShare = homeAhead ? deserved.home : deserved.away;
  if (!(leadShare < 0.4)) return null;
  const lo = Math.min(score.home, score.away), hi = Math.max(score.home, score.away);
  const x = xg ? ` (xG ${(homeAhead ? xg.away : xg.home).toFixed(1)} to ${(homeAhead ? xg.home : xg.away).toFixed(1)})` : "";
  const g = goalie ? (homeAhead ? goalie.home : goalie.away) : null;
  const gk = g != null && Math.abs(g) >= 0.3 ? ` ${lead}'s goaltending is counted (${g > 0 ? "+" : "−"}${Math.abs(g).toFixed(1)} goals saved above expected).` : "";
  const short = `${lead} ${over ? "won" : "leads"} ${hi}–${lo}, but ${trail} created the better chances${x}.${gk}`;
  const long = `${short} ${trail} has ${over ? "earned" : "earned so far"} more of the game from its shots, while ${lead}'s goals have run ahead of the chances behind them: finishing and goaltending beyond what the shot quality says is likely. Deserve does not count the score.`;
  return { short, long };
}

const count = (game, label) => game.stats?.find((s) => s.label === label);

/** @param {{ game: any, mp?: any }} o */
export function buildRecap({ game, mp = null }) {
  const { list, source } = attemptsOf(game, mp);
  const side = (home) => list.filter((a) => a.home === home);
  const sum = (arr) => arr.reduce((s, a) => s + a.xg, 0);
  const homeA = side(true), awayA = side(false);
  const xg = { home: sum(homeA), away: sum(awayA) };
  const gt = goaltending(list);
  const blocked = game.plays?.length ? { home: game.plays.filter((p) => p.type === "blocked-shot" && p.team === game.home).length, away: game.plays.filter((p) => p.type === "blocked-shot" && p.team === game.away).length } : null;
  const attempts = { home: homeA.length + (blocked?.home ?? 0), away: awayA.length + (blocked?.away ?? 0) };
  const sog = { home: game.homeShots ?? homeA.filter((a) => a.sog).length, away: game.awayShots ?? awayA.filter((a) => a.sog).length };
  const faceoffs = count(game, "faceoff"), hits = count(game, "hit");
  // A finished game spans its full length (at least three periods). A game still being played spans only what has been played so far, so the race
  // chart never shows periods that have not happened.
  const elapsed = ["LIVE", "CRIT"].includes(game.state) ? pulseMinute(game) : null;
  const lastShot = Math.max(0, ...list.map((a) => a.t));
  const end = elapsed != null ? Math.max(120, elapsed * 60, lastShot) : Math.max(3600, lastShot);
  const series = (arr) => {
    let cum = 0;
    const pts = [{ t: 0, v: 0 }];
    for (const a of [...arr].sort((p, q) => p.t - q.t)) { pts.push({ t: a.t, v: cum }); cum += a.xg; pts.push({ t: a.t, v: cum }); }
    pts.push({ t: end, v: cum });
    return pts;
  };
  const goals = list.filter((a) => a.goal).sort((p, q) => p.t - q.t).map((a, i) => ({ n: i + 1, ...a, when: clock(a.t).label }));
  const cumAt = (arr, t) => sum(arr.filter((a) => a.t <= t));
  const chances = list.filter((a) => a.xg >= HIGH_XG).sort((p, q) => p.t - q.t).map((a) => ({ t: a.t, home: a.home, goal: a.goal, xg: a.xg, v: cumAt(a.home ? homeA : awayA, a.t), player: a.player }));
  const marks = goals.map((g) => ({ n: g.n, home: g.home, t: g.t, v: cumAt(g.home ? homeA : awayA, g.t), name: g.player }));
  return {
    source, teams: { home: game.home, away: game.away }, attempts, sog, xg,
    xgPerAttempt: { home: attempts.home ? xg.home / attempts.home : null, away: attempts.away ? xg.away / attempts.away : null },
    faceoffs: faceoffs ? { home: faceoffs.home, away: faceoffs.away } : null, hits: hits ? { home: hits.home, away: hits.away } : null,
    goaltending: gt,
    deservedNoGoalie: deservedToWin(homeA.map((a) => a.xg), awayA.map((a) => a.xg)),
    deserved: deservedToWin(withGoalie(homeA, gt.away), withGoalie(awayA, gt.home)),
    series: { home: series(homeA), away: series(awayA), end }, marks, goals, list, chances,
    topChances: [...list].sort((p, q) => q.xg - p.xg).slice(0, 3),
    performers: source === "moneypuck" ? performers(list, game) : null,
  };
}

/** Three stars from MoneyPuck's shot list: skaters on goals and the chances they created, goalies on goals saved above expected. */
function performers(list, game) {
  const skaters = new Map(), goalies = new Map();
  for (const a of list) {
    if (a.playerId != null) {
      const s = skaters.get(a.playerId) ?? { id: a.playerId, name: a.player, team: a.team, goals: 0, xg: 0, shots: 0 };
      s.goals += a.goal ? 1 : 0; s.xg += a.xg; s.shots += 1; skaters.set(a.playerId, s);
    }
    if (a.gk && a.sog) {
      const g = goalies.get(a.gk.id) ?? { id: a.gk.id, name: a.gk.name, team: a.team === game.home ? game.away : game.home, faced: 0, ga: 0, xga: 0 };
      g.faced += 1; g.ga += a.goal ? 1 : 0; g.xga += a.xg; goalies.set(a.gk.id, g);
    }
  }
  const gl = [...goalies.values()].map((g) => ({ ...g, saves: g.faced - g.ga, svPct: g.faced ? (g.faced - g.ga) / g.faced : null, gsax: g.xga - g.ga })).sort((p, q) => q.faced - p.faced);
  // One goalie per team: the one who faced the most shots.
  const byTeam = new Map();
  for (const g of gl) if (!byTeam.has(g.team)) byTeam.set(g.team, g);
  const starters = [...byTeam.values()];
  const winner = game.homeScore > game.awayScore ? game.home : game.awayScore > game.homeScore ? game.away : null;
  const cand = [
    ...[...skaters.values()].map((s) => ({ kind: "skater", ...s, score: s.goals * 2 + s.xg + (s.team === winner ? 0.3 : 0) })),
    ...starters.map((g) => ({ kind: "goalie", ...g, score: g.gsax * 0.9 + (g.team === winner ? 0.5 : 0) })),
  ].sort((p, q) => q.score - p.score).slice(0, 3);
  return { stars: cand, goalies: starters };
}
