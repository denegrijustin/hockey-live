// Team trends from games that are over. Pure and deterministic; every metric is {value, sample, label} and `value` is null (shown as "—") when the sample is too small.
//
// DEFINITIONS (also in docs/phase3-trends.md)
//  - Completed game: state OFF/FINAL, not postponed/cancelled (scheduleState PPD/CNCL), both scores present and different. Regular season and playoffs (type 2 and 3) count.
//    Upcoming, live, postponed and score-less games are never counted.
//  - Result from a team's side: W = more goals; OTL = fewer goals and the game ended in OT or SO; L = fewer goals in regulation. Points: W 2, OTL 1, L 0.
//  - formLast(results, n): the team's latest n results (n = 5 or 10), W-L-OTL, points, and the current streak ("W3" = three wins in a row, "L2" = two straight games
//    without a win, overtime losses included, matching insights.streakOf). Needs MIN_SAMPLE results, else value is null. If fewer than n exist the label says how many.
//  - goalDiffTrend(results): cumulative goals for minus against after each completed game, in play order; total and per-game average. Season to date.
//  - homeAwaySplit(games, teamId): record, points% and goal difference at home and on the road, from which side the team was on in each completed game.
//  - specialTeamsRank(snapshot, teamId): power-play % and penalty-kill % with league rank, ONLY from the league matchup snapshot (NHL team summary report). Omitted (null) when absent.
//  - matchupLens(a, b, table, games, opts): plain-language bullets, each carrying the numbers it is built from. Descriptive, never a prediction.
//  All values are descriptive of games already played; none is a forecast.

export const MIN_SAMPLE = 3;
const isDone = (g) => ["OFF", "FINAL"].includes(g?.state) && !["PPD", "CNCL"].includes(g?.scheduleState) && Number.isFinite(g?.homeScore) && Number.isFinite(g?.awayScore) && g.homeScore !== g.awayScore;
const cmp = (a, b) => String(a.start ?? "").localeCompare(String(b.start ?? "")) || a.id - b.id;
const metric = (value, sample, label) => ({ value, sample, label });
const pointsOf = (o) => (o === "W" ? 2 : o === "OTL" ? 1 : 0);

/** A team's completed games as results, in play order: {id,date,start,home,opp,gf,ga,outcome:'W'|'L'|'OTL',ot}. */
export function teamResults(games, teamId, types = [2, 3]) {
  return (Array.isArray(games) ? games : [])
    .filter((g) => types.includes(g.type) && (g.home === teamId || g.away === teamId) && isDone(g))
    .sort(cmp)
    .map((g) => {
      const home = g.home === teamId, gf = home ? g.homeScore : g.awayScore, ga = home ? g.awayScore : g.homeScore;
      const ot = g.end === "OT" || g.end === "SO";
      return { id: g.id, date: g.date, start: g.start, home, opp: home ? g.away : g.home, gf, ga, ot, outcome: gf > ga ? "W" : ot ? "OTL" : "L" };
    });
}

/** Current streak from the newest result back. W: consecutive wins. L: consecutive games without a win. */
export function streak(results) {
  const list = Array.isArray(results) ? results : [];
  const last = list.at(-1);
  if (!last) return { kind: null, n: 0 };
  const kind = last.outcome === "W" ? "W" : "L";
  let n = 0;
  for (let i = list.length - 1; i >= 0 && (list[i].outcome === "W") === (kind === "W"); i--) n++;
  return { kind, n };
}

/** Record over the latest n results. The streak is over the whole list, not just the window. */
export function formLast(results, n = 5) {
  const all = Array.isArray(results) ? results : [];
  const list = all.slice(-n);
  const label = `last ${list.length >= MIN_SAMPLE ? list.length : n}`;
  if (list.length < MIN_SAMPLE) return metric(null, list.length, label);
  const rec = { w: 0, l: 0, otl: 0 };
  for (const r of list) rec[r.outcome.toLowerCase()]++;
  const pts = list.reduce((s, r) => s + pointsOf(r.outcome), 0);
  return metric({ ...rec, gp: list.length, pts, ptsPossible: list.length * 2, chips: list.map((r) => r.outcome), streak: streak(all) }, list.length, label);
}

/** Cumulative goal difference after each completed game. */
export function goalDiffTrend(results) {
  const list = Array.isArray(results) ? results : [];
  if (list.length < MIN_SAMPLE) return metric(null, list.length, "season to date");
  let sum = 0;
  const series = list.map((r) => (sum += r.gf - r.ga));
  return metric({ series, total: sum, perGame: sum / list.length, gf: list.reduce((s, r) => s + r.gf, 0), ga: list.reduce((s, r) => s + r.ga, 0) }, list.length, "season to date");
}

const side = (list) => {
  const rec = { w: 0, l: 0, otl: 0 };
  for (const r of list) rec[r.outcome.toLowerCase()]++;
  const pts = list.reduce((s, r) => s + pointsOf(r.outcome), 0);
  return { ...rec, gp: list.length, pts, ptsPct: list.length ? pts / (list.length * 2) : null, gd: list.reduce((s, r) => s + r.gf - r.ga, 0) };
};
/** Home and away record from the games' own home/away fields (completed games only). */
export function homeAwaySplit(games, teamId) {
  const rs = teamResults(games, teamId);
  const home = side(rs.filter((r) => r.home)), away = side(rs.filter((r) => !r.home));
  return metric(rs.length < MIN_SAMPLE ? null : { home, away }, rs.length, "season to date");
}

/** Power-play and penalty-kill rank, only when the league snapshot has them for this team. */
export function specialTeamsRank(snapshot, teamId) {
  const m = snapshot?.teams?.[teamId]?.metrics;
  const pick = (k) => (m?.[k] && Number.isFinite(m[k].value) && Number.isFinite(m[k].rank) ? { pct: m[k].value, rank: m[k].rank, pool: m[k].pool, tied: !!m[k].tied } : null);
  const pp = pick("powerPlayPct"), pk = pick("penaltyKillPct");
  if (!pp && !pk) return metric(null, 0, "season to date");
  return metric({ pp, pk }, snapshot.teams[teamId].gamesPlayed ?? 0, "season to date");
}

const fmtGd = (n) => (n > 0 ? `+${n}` : String(n));
const ord = (n) => { const t = n % 100; if (t >= 11 && t <= 13) return `${n}th`; return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`; };
const rec = (r) => `${r.w}-${r.l}-${r.otl}`;
const pct1 = (v) => `${(v * 100).toFixed(1)}%`;

/**
 * Plain-language bullets about two teams, each with the numbers it comes from. Bullets whose sample is too small are left out, so an early-season pair may return value null.
 * opts: {matchups: league snapshot, homeId: which of a/b is at home (enables the home/road bullet), names: {ID: short name}}.
 * Bullets: form (last 5), goal difference per game (standings), home/road record, special teams (snapshot only), season series (completed regular-season meetings).
 */
export function matchupLens(a, b, table, games, opts = {}) {
  const name = (id) => opts.names?.[id] ?? id;
  const bullets = [];
  const fa = formLast(teamResults(games, a), 5), fb = formLast(teamResults(games, b), 5);
  if (fa.value && fb.value)
    bullets.push({ id: "form", sample: `last ${Math.min(fa.sample, fb.sample)}`, text: `${name(a)} are ${rec(fa.value)} over their last ${fa.sample} games; ${name(b)} are ${rec(fb.value)} over their last ${fb.sample}.`, numbers: { [a]: fa.value.pts, [b]: fb.value.pts, unit: "points" } });
  const ta = table?.[a], tb = table?.[b];
  if (ta?.gp >= MIN_SAMPLE && tb?.gp >= MIN_SAMPLE && [ta.gf, ta.ga, tb.gf, tb.ga].every(Number.isFinite)) {
    const da = +((ta.gf - ta.ga) / ta.gp).toFixed(2), db = +((tb.gf - tb.ga) / tb.gp).toFixed(2);
    bullets.push({ id: "goal-diff", sample: "season to date", text: `Goal difference per game: ${name(a)} ${fmtGd(da)}, ${name(b)} ${fmtGd(db)}.`, numbers: { [a]: da, [b]: db, unit: "goals per game" } });
  }
  if (opts.homeId && [a, b].includes(opts.homeId)) {
    const homeId = opts.homeId, awayId = homeId === a ? b : a;
    const h = homeAwaySplit(games, homeId).value, w = homeAwaySplit(games, awayId).value;
    if (h?.home.gp >= MIN_SAMPLE && w?.away.gp >= MIN_SAMPLE)
      bullets.push({ id: "home-away", sample: "season to date", text: `${name(homeId)} are ${rec(h.home)} at home; ${name(awayId)} are ${rec(w.away)} on the road.`, numbers: { [homeId]: h.home.pts, [awayId]: w.away.pts, unit: "points" } });
  }
  const sa = specialTeamsRank(opts.matchups, a).value, sb = specialTeamsRank(opts.matchups, b).value;
  for (const [off, def, o, d] of [[a, b, sa?.pp, sb?.pk], [b, a, sb?.pp, sa?.pk]])
    if (o && d) bullets.push({ id: `st-${off}`, sample: "season to date", text: `${name(off)} power play is ${ord(o.rank)} of ${o.pool} (${pct1(o.pct)}); ${name(def)} penalty kill is ${ord(d.rank)} of ${d.pool} (${pct1(d.pct)}).`, numbers: { pp: o.pct, pk: d.pct, unit: "%" } });
  const meet = (Array.isArray(games) ? games : []).filter((g) => g.type === 2 && isDone(g) && ((g.home === a && g.away === b) || (g.home === b && g.away === a)));
  if (meet.length) {
    const wins = { [a]: 0, [b]: 0 };
    for (const g of meet) wins[g.homeScore > g.awayScore ? g.home : g.away]++;
    bullets.push({ id: "series", sample: `${meet.length} meeting${meet.length === 1 ? "" : "s"}`, text: wins[a] === wins[b] ? `Season series is tied ${wins[a]}-${wins[b]}.` : `${name(wins[a] > wins[b] ? a : b)} lead the season series ${Math.max(wins[a], wins[b])}-${Math.min(wins[a], wins[b])}.`, numbers: { [a]: wins[a], [b]: wins[b], unit: "wins" } });
  }
  return metric(bullets.length ? { bullets } : null, bullets.length, "from games played");
}
