// League Pulse: a few facts for Home, each derived from data the app already has and each stating its basis. Pure.
// There is no historical rank data, so nothing here claims "movement in the standings": streaks, last-10 form against the season,
// distance to the playoff cut line (a snapshot, not a change) and the playoff simulation's chances are all that is reported.
import { sideOf, teamGames } from "./team-schedule.mjs";
import { streakOf } from "./team-summary.mjs";
import { gapToLine } from "./standings-view.mjs";

const MAX_ROWS = 4;
const MIN_STREAK = 4; // games in a row before a streak is worth a line
const MIN_FORM_EDGE = 0.15; // last-10 points % above/below the season's, as a fraction
const pct3 = (v) => v.toFixed(3).replace(/^0/, "");

/** The finished regular-season games of every team, oldest first, from that team's side. */
function countedByTeam(games, teams) {
  const out = new Map();
  for (const t of teams) {
    const items = teamGames(games, t.id).filter((g) => g.type === 2).map((g) => sideOf(g, t.id)).filter((i) => i.status === "final" && i.result);
    out.set(t.id, items);
  }
  return out;
}

/**
 * @param {Record<string, any> | null} table standings by team id ({gp, pts, ...})
 * @param {{id: string, conference?: string, division?: string}[]} teams
 * @param {any[]} games the season's games
 * @param {Record<string, {chance: number}> | null} [sim] playoff chances by team id (chancesForCards)
 * @returns {{key: string, kind: string, teams: string[], text: string, basis: string}[]} at most four rows, most notable first
 */
export function buildPulse(table, teams, games, sim = null) {
  if (!table || !teams?.length) return [];
  const rows = [];
  const counted = countedByTeam(games ?? [], teams);

  // 1. The longest active winning streak, and the longest losing one.
  const streaks = teams.map((t) => ({ id: t.id, s: streakOf(counted.get(t.id) ?? []) })).filter((x) => x.s && x.s.count >= MIN_STREAK);
  const pick = (type) => streaks.filter((x) => x.s.type === type).sort((a, b) => b.s.count - a.s.count || a.id.localeCompare(b.id))[0];
  const hot = pick("W"), cold = pick("L") ?? pick("OTL");
  if (hot) rows.push({ key: `streak:${hot.id}`, kind: "streak", teams: [hot.id], text: `${hot.id} has won ${hot.s.count} in a row`, basis: "Active streak, regular-season games" });
  if (cold) rows.push({ key: `streak:${cold.id}`, kind: "streak", teams: [cold.id], text: `${cold.id} has lost ${cold.s.count} in a row${cold.s.type === "OTL" ? " (overtime or shootout)" : ""}`, basis: "Active streak, regular-season games" });

  // 2. The biggest gap between the last 10 games and the whole season, in points percentage.
  const form = [];
  for (const t of teams) {
    const items = counted.get(t.id) ?? [], row = table[t.id];
    if (items.length < 10 || !row || !(row.gp > 0)) continue;
    const last = items.slice(-10);
    const lastPts = last.reduce((s, i) => s + (i.result === "W" ? 2 : i.result === "OTL" ? 1 : 0), 0);
    const season = row.pts / (2 * row.gp), recent = lastPts / 20;
    const w = last.filter((i) => i.result === "W").length, otl = last.filter((i) => i.result === "OTL").length;
    form.push({ id: t.id, delta: recent - season, season, recent, rec: `${w}-${10 - w - otl}-${otl}` });
  }
  form.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.id.localeCompare(b.id));
  const f = form.find((x) => Math.abs(x.delta) >= MIN_FORM_EDGE && !rows.some((r) => r.teams[0] === x.id));
  if (f) rows.push({ key: `form:${f.id}`, kind: "form", teams: [f.id], text: `${f.id} is ${f.rec} in its last 10 (${pct3(f.recent)} points pct) against ${pct3(f.season)} for the season`, basis: "Last 10 games vs season points percentage" });

  // 3. The closest call at the playoff cut line: the team just out, or the last one in, with the fewest points of margin.
  const bubble = teams.map((t) => ({ id: t.id, gap: gapToLine(table, t.id, teams) }))
    .filter((x) => x.gap && x.gap.ref && x.gap.pts != null && (x.gap.status === "out" || x.gap.status === "wc2"))
    .sort((a, b) => Math.abs(a.gap.pts) - Math.abs(b.gap.pts) || a.id.localeCompare(b.id))[0];
  if (bubble) {
    const n = Math.abs(bubble.gap.pts), unit = n === 1 ? "point" : "points";
    const text = bubble.gap.status === "out"
      ? (n === 0 ? `${bubble.id} is level on points with the last wild card (${bubble.gap.ref})` : `${bubble.id} is ${n} ${unit} behind the last wild card (${bubble.gap.ref})`)
      : (n === 0 ? `${bubble.id} holds the last wild card level on points with ${bubble.gap.ref}` : `${bubble.id} holds the last wild card ${n} ${unit} ahead of ${bubble.gap.ref}`);
    rows.push({ key: `bubble:${bubble.id}`, kind: "bubble", teams: [bubble.id], text, basis: "Points vs the wild-card line (computed from standings, not official)" });
  }

  // 4. Playoff-chance leaders from the simulation: the most likely teams that are not yet certain.
  if (sim) {
    const lead = teams.map((t) => ({ id: t.id, c: sim[t.id]?.chance })).filter((x) => typeof x.c === "number" && x.c < 100 && x.c > 0)
      .sort((a, b) => b.c - a.c || a.id.localeCompare(b.id)).slice(0, 2);
    if (lead.length) rows.push({ key: `sim:${lead[0].id}`, kind: "odds", teams: lead.map((x) => x.id), text: `Best playoff chances: ${lead.map((x) => `${x.id} ${Math.round(x.c)}%`).join(", ")}`, basis: "Playoff simulation, not a guarantee" });
  }
  return rows.slice(0, MAX_ROWS);
}
