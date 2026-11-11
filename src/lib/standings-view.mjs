/**
 * Pure standings helpers for the Standings view. Everything here is DERIVED from the table rebuilt
 * from completed regular-season games (model.mjs): there is no official standings feed, so nothing
 * here is an official clinch or seed. Null-safe: missing rows or empty histories yield null/neutral values.
 * Head-to-head and the NHL's remaining tiebreakers beyond ROW are NOT applied.
 */

const finishedState = (g) => g?.state === "OFF" || g?.state === "FINAL";
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Points percentage = pts / (2 * gp); null when no games are played. */
export const pointsPct = (row) => (row && row.gp > 0 ? row.pts / (2 * row.gp) : null);
/** Goal differential (null for a missing row). */
export const goalDiff = (row) => (row ? (row.gf ?? 0) - (row.ga ?? 0) : null);

/**
 * ROW per team (regulation + overtime wins, shootout wins excluded) computed from finished type-2 games.
 * @returns {Record<string, number>}
 */
export function rowByTeam(games, ids = []) {
  const out = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const g of games ?? []) {
    if (g.type !== 2 || !finishedState(g) || g.homeScore == null || g.awayScore == null || g.homeScore === g.awayScore) continue;
    if (g.end === "SO") continue;
    const w = g.homeScore > g.awayScore ? g.home : g.away;
    if (w in out) out[w] += 1;
  }
  return out;
}
/** Table copy where every row carries `row` (ROW) so compareStandings can use it. */
export function withRow(table, games) {
  const row = rowByTeam(games, Object.keys(table ?? {}));
  return Object.fromEntries(Object.entries(table ?? {}).map(([id, r]) => [id, { ...r, row: row[id] }]));
}

/**
 * NHL-style comparator for Array.sort (negative = a ranks ahead). Order: points percentage, regulation
 * wins (rw), ROW when BOTH rows carry a numeric `row` (otherwise skipped), goal differential, then name/id.
 * Head-to-head is not applied. A team with no games ranks by 0 percentage.
 */
export function compareStandings(a, b) {
  const d = (x, y) => (y ?? 0) - (x ?? 0);
  return (
    d(pointsPct(a), pointsPct(b)) ||
    d(a?.rw, b?.rw) ||
    (num(a?.row) != null && num(b?.row) != null ? d(a.row, b.row) : 0) ||
    d(goalDiff(a), goalDiff(b)) ||
    String(a?.name ?? a?.id ?? "").localeCompare(String(b?.name ?? b?.id ?? ""))
  );
}

/**
 * Current streak from a results array ([{outcome:'W'|'L'|'OT'}], oldest first): "W3", "L2", "OT1".
 * An overtime or shootout loss is labelled OT (same as the table's OT column) and a regulation loss L;
 * the two are different streak types. Returns null for an empty history.
 */
export function streak(results) {
  const rs = (results ?? []).filter((r) => r?.outcome);
  if (!rs.length) return null;
  const last = rs[rs.length - 1].outcome;
  let n = 0;
  for (let i = rs.length - 1; i >= 0 && rs[i].outcome === last; i--) n++;
  return { type: last, count: n, label: `${last}${n}` };
}
/** Record over the last n results as W-L-OTL (fewer than n if the history is short); null when empty. */
export function lastN(results, n = 10) {
  const rs = (results ?? []).filter((r) => r?.outcome).slice(-n);
  if (!rs.length) return null;
  const w = rs.filter((r) => r.outcome === "W").length, ot = rs.filter((r) => r.outcome === "OT").length;
  return { w, l: rs.length - w - ot, ot, games: rs.length, label: `${w}-${rs.length - w - ot}-${ot}` };
}
/** Games in hand = (reference games played) - (team's games played), min 0. ref defaults to the max gp in the table. */
export function gamesInHand(table, id, ref) {
  const row = table?.[id];
  if (!row) return null;
  const r = ref ?? Math.max(0, ...Object.values(table).map((x) => x?.gp ?? 0));
  return Math.max(0, r - row.gp);
}

const confTeams = (teams, code) => teams.filter((t) => t.conference === code);
/**
 * Playoff picture per conference using the NHL format: top 3 of each division, then the best two of the
 * rest of the conference (wild cards), ordered with compareStandings. Computed from points, not official.
 * @returns {Record<string, {divisions: Record<string, string[]>, wildCard: string[], out: string[]}>}
 */
export function wildCardGroups(table, teams) {
  const out = {};
  const rank = (ids) => [...ids].sort((a, b) => compareStandings({ id: a, ...(table?.[a] ?? {}) }, { id: b, ...(table?.[b] ?? {}) }));
  for (const code of [...new Set((teams ?? []).map((t) => t.conference))]) {
    const ct = confTeams(teams, code), divisions = {}, auto = new Set();
    for (const d of [...new Set(ct.map((t) => t.division))].sort()) {
      const top = rank(ct.filter((t) => t.division === d).map((t) => t.id)).slice(0, 3);
      divisions[d] = top;
      top.forEach((id) => auto.add(id));
    }
    const rest = rank(ct.filter((t) => !auto.has(t.id)).map((t) => t.id));
    out[code] = { divisions, wildCard: rest.slice(0, 2), out: rest.slice(2) };
  }
  return out;
}

/**
 * Spot and margin versus the playoff cut line. status: 'in' (division top 3), 'wc1', 'wc2' or 'out'.
 * Margin: for a team IN, its lead over the best team outside (first team out); for a team OUT, its deficit
 * to the last wild card (WC2), a negative number. `pts` is the points margin, `pct` the points-percentage
 * margin in percentage points. Null for unknown team or missing data.
 */
export function gapToLine(table, id, teams) {
  const t = (teams ?? []).find((x) => x.id === id);
  if (!t || !table?.[id]) return null;
  const g = wildCardGroups(table, teams)[t.conference];
  const inIds = [...Object.values(g.divisions).flat(), ...g.wildCard];
  const status = g.wildCard[0] === id ? "wc1" : g.wildCard[1] === id ? "wc2" : inIds.includes(id) ? "in" : "out";
  const ref = status === "out" ? g.wildCard[1] : g.out[0];
  if (!ref || !table[ref]) return { status, ref: null, pts: null, pct: null };
  const pa = pointsPct(table[id]), pr = pointsPct(table[ref]);
  return {
    status,
    ref,
    pts: table[id].pts - table[ref].pts,
    pct: pa == null || pr == null ? null : (pa - pr) * 100,
  };
}

/**
 * COMPUTED clinch / elimination from points arithmetic only (tiebreakers NOT applied, ties count against
 * the team). Conservative: returns null when unsure. Only regular-season (type 2) games that are not finished
 * and not canceled count as remaining (postponed and suspended games still have to be played); with no schedule at all every status is null.
 * Clinched: at most 4 other conference teams can still reach the team's points (a team that misses
 * has 3 division teams and 2 wild cards ahead, so it needs at least 5), or at most 2 in its division.
 * Eliminated: at least 3 division teams are already strictly above its maximum and at least 2 more
 * non-top-3 teams in the conference are as well (counting, per division, the teams beyond the top 3).
 * @returns {Record<string, {status: 'clinched'|'eliminated'|null, basis: 'computed'}>}
 */
export function clinchStatus(table, games, teams) {
  const res = Object.fromEntries((teams ?? []).map((t) => [t.id, { status: null, basis: "computed" }]));
  const sched = (games ?? []).filter((g) => g.type === 2);
  if (!sched.length || !table || (teams ?? []).some((t) => !table[t.id])) return res;
  const remaining = Object.fromEntries(teams.map((t) => [t.id, 0]));
  for (const g of sched) {
    if (finishedState(g) || String(g.scheduleState ?? "").toUpperCase() === "CNCL") continue; // postponed/suspended games still have to be played, so they stay remaining (understating a team's maximum would claim a clinch or elimination too early)
    if (g.home in remaining) remaining[g.home]++;
    if (g.away in remaining) remaining[g.away]++;
  }
  const max = (id) => table[id].pts + 2 * remaining[id];
  for (const t of teams) {
    const conf = confTeams(teams, t.conference).filter((x) => x.id !== t.id);
    const own = conf.filter((x) => x.division === t.division);
    const pts = table[t.id].pts, mx = max(t.id);
    const reach = (list) => list.filter((x) => max(x.id) >= pts).length;
    if (reach(conf) <= 4 || reach(own) <= 2) { res[t.id].status = "clinched"; continue; }
    const above = (list) => list.filter((x) => table[x.id].pts > mx).length;
    const a = above(own);
    const others = [...new Set(conf.filter((x) => x.division !== t.division).map((x) => x.division))];
    const bonus = others.reduce((s, d) => s + Math.max(0, above(conf.filter((x) => x.division === d)) - 3), 0);
    if (a >= 3 && Math.max(0, a - 3) + bonus >= 2) res[t.id].status = "eliminated";
  }
  return res;
}
