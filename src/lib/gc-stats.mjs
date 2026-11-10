// Game Center "Team Stats" and "Players" view-models. Pure, so the panes and the tests share them. Nothing here is a new metric.
//
// Labels (also in docs/phase5-stats.md, README and Methodology):
//  - Official: numbers the NHL publishes for the game (boxscore sog and player lines; right-rail team stats, shots and goals by period).
//  - Derived: counted by Iceboard from official data when the official table is missing (team hits/blocks/PIM/takeaways/giveaways summed from the
//    player lines; goals and shots by period counted from play-by-play goal and shot-on-goal events, shootout excluded). Each row says which.
//  - Points = goals + assists. Save % = saves / shots against, computed here (never the NHL's rounded value). A goalie who did not play is excluded.
//  - Two EXISTING indexes are reused only to ORDER notable performances, never displayed as a score and never changed:
//      * impact index (model.mjs skaterImpact / goalieImpact): a season/box-score index used on player pages and in the matchup tables;
//      * game score (last-night.mjs gameScore / nightsOf): the "Last night in the NHL" best-and-worst index.
//    They are different formulas on purpose; this file orders skaters by game score (what Last Night uses) and goalies by goalieImpact.
//  - Notable-performance THRESHOLDS are display filters on real stats, each card states the numbers that triggered it:
//      skater: 3+ points, hat trick (3+ goals), 6+ shots on goal; goalie: 25+ saves, shutout with 15+ shots against, save % >= .950 with 15+ shots against.
//    While a game is live only the top 1-2 cards show (partial games would otherwise flag everyone).
import { nightsOf } from "./last-night.mjs";
import { goalieImpact } from "./model.mjs";

export const DASH = "—";
export const THRESHOLDS = { points: 3, hatTrick: 3, shots: 6, saves: 25, shutoutShots: 15, svFlagShots: 15, svFlag: 0.95 };

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const nv = (v) => (isNum(v) ? v : 0);
/** "mm:ss" -> seconds; null when missing or malformed. */
export const toiSeconds = (toi) => {
  const m = /^(\d+):(\d{2})$/.exec(String(toi ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const fmtToi = (toi) => (toiSeconds(toi) == null ? DASH : String(toi));
export const fmtNum = (v) => (isNum(v) ? String(v) : DASH);
export const fmtSigned = (v) => (isNum(v) ? (v > 0 ? `+${v}` : String(v)) : DASH);
export const fmtPct1 = (v) => (isNum(v) ? `${v.toFixed(1)}%` : DASH);
/** Save percentage as ".917"; null when there were no shots against. */
export const savePct = (saves, sa) => (isNum(saves) && isNum(sa) && sa > 0 ? saves / sa : null);
export const fmtSv = (v) => (isNum(v) ? (v >= 1 ? "1.000" : v.toFixed(3).replace(/^0/, "")) : DASH);

/** Comparison rows for the team table. Away first (as on the scoreboard). `bar` rows suit a Gauge; the others are table rows. */
export function comparisonRows(box) {
  const t = box?.teams, src = box?.teamSource ?? {};
  const a = t?.away ?? {}, h = t?.home ?? {};
  const spec = [
    { key: "sog", label: "Shots on goal", bar: true },
    { key: "faceoffPct", label: "Faceoff %", bar: true, percent: true, text: (v) => (isNum(v) ? `${v}%` : DASH) },
    { key: "powerPlay", label: "Power play", bar: false, text: (v) => (v ? `${v.goals}/${v.opportunities}` : DASH), value: (v) => v?.goals ?? null },
    { key: "pim", label: "Penalty minutes", bar: false, lowerBetter: true },
    { key: "hits", label: "Hits", bar: true },
    { key: "blocks", label: "Blocked shots", bar: false },
    { key: "takeaways", label: "Takeaways", bar: false },
    { key: "giveaways", label: "Giveaways", bar: false, lowerBetter: true },
  ];
  return spec.map((s) => {
    const text = s.text ?? fmtNum, val = s.value ?? ((v) => v);
    const av = val(a[s.key] ?? null), hv = val(h[s.key] ?? null);
    const both = isNum(av) && isNum(hv);
    return {
      key: s.key, label: s.label, lowerBetter: !!s.lowerBetter, percent: !!s.percent,
      away: isNum(av) ? av : null, home: isNum(hv) ? hv : null,
      awayText: text(a[s.key] ?? null), homeText: text(h[s.key] ?? null),
      bar: !!s.bar && both && av + hv > 0,
      source: src[s.key] ?? null,
      leader: both && av !== hv ? ((av > hv) !== !!s.lowerBetter ? "away" : "home") : null,
    };
  });
}

const periodLabel = (n, type) => (type === "SO" ? "SO" : type === "OT" ? (n > 4 ? `${n - 3}OT` : "OT") : String(n));

/**
 * Goals and shots by period. Official from box.periods when present, else Derived from the play-by-play plays (goal + shot-on-goal, shootout excluded).
 * @returns {{ rows: {key:string,label:string,goals:{home:number|null,away:number|null}|null,shots:{home:number|null,away:number|null}|null}[], total:{goals:any,shots:any}, source: "official"|"derived"|null }}
 */
export function periodRows(box, plays, homeId, awayId) {
  let rows = null, source = null;
  if (box?.periods?.length) {
    rows = box.periods.map((p) => ({ key: `p${p.number}`, label: periodLabel(p.number, p.type), goals: p.goals, shots: p.shots }));
    source = "official";
  } else if (plays?.length) {
    const by = new Map();
    for (const p of plays) {
      if (p.periodType === "SO" || !["goal", "shot-on-goal"].includes(p.type) || (p.team !== homeId && p.team !== awayId)) continue;
      const side = p.team === homeId ? "home" : "away";
      if (!by.has(p.period)) by.set(p.period, { number: p.period, type: p.periodType, goals: { home: 0, away: 0 }, shots: { home: 0, away: 0 } });
      const r = by.get(p.period);
      r.shots[side] += 1;
      if (p.type === "goal") r.goals[side] += 1;
    }
    rows = [...by.values()].sort((x, y) => x.number - y.number).map((p) => ({ key: `p${p.number}`, label: periodLabel(p.number, p.type), goals: p.goals, shots: p.shots }));
    source = rows.length ? "derived" : null;
  }
  rows = rows ?? [];
  const sum = (k) => {
    const have = rows.filter((r) => r[k]);
    if (!have.length) return null;
    const add = (s) => have.reduce((x, r) => x + nv(r[k][s]), 0);
    return { home: add("home"), away: add("away") };
  };
  return { rows, total: { goals: sum("goals"), shots: sum("shots") }, source };
}

/** @param {any} p a box-score player line */
const skaterLine = (p) => {
  const g = isNum(p.goals) ? p.goals : null, a = isNum(p.assists) ? p.assists : null;
  return {
    id: p.id, name: p.name, team: p.team, number: p.number ?? null, headshot: p.headshot, position: p.position,
    goals: g, assists: a, points: g == null && a == null ? null : nv(g) + nv(a),
    shots: isNum(p.shots) ? p.shots : null, hits: isNum(p.hits) ? p.hits : null, blocks: isNum(p.blocks) ? p.blocks : null,
    pim: isNum(p.pim) ? p.pim : null, plusMinus: isNum(p.plusMinus) ? p.plusMinus : null,
    toi: toiSeconds(p.toi) == null ? null : p.toi, toiSec: toiSeconds(p.toi),
  };
};
const goalieLine = (p) => ({
  id: p.id, name: p.name, team: p.team, number: p.number ?? null, headshot: p.headshot, position: "G",
  saves: isNum(p.saves) ? p.saves : null, shotsAgainst: isNum(p.shotsAgainst) ? p.shotsAgainst : null, goalsAgainst: isNum(p.goalsAgainst) ? p.goalsAgainst : null,
  savePct: savePct(p.saves, p.shotsAgainst), toi: toiSeconds(p.toi) == null ? null : p.toi, toiSec: toiSeconds(p.toi),
});
/** A goalie played if he has ice time or faced a shot; a bench goalie ("00:00", 0 shots) is excluded. */
export const goaliePlayed = (p) => nv(toiSeconds(p.toi)) > 0 || nv(p.shotsAgainst) > 0;

export function skaterLines(box, team) {
  return (box?.players ?? []).filter((p) => p.team === team && p.position !== "G").map(skaterLine);
}
export function goalieLines(box, team) {
  return (box?.players ?? []).filter((p) => p.team === team && p.position === "G" && goaliePlayed(p)).map(goalieLine);
}

export const SKATER_COLS = [
  { key: "name", label: "Player", text: true }, { key: "goals", label: "G" }, { key: "assists", label: "A" }, { key: "points", label: "P" },
  { key: "shots", label: "SOG" }, { key: "hits", label: "Hits" }, { key: "blocks", label: "BLK" }, { key: "pim", label: "PIM" },
  { key: "plusMinus", label: "+/-" }, { key: "toiSec", label: "TOI" },
];
export const GOALIE_COLS = [
  { key: "name", label: "Goalie", text: true }, { key: "saves", label: "SV" }, { key: "shotsAgainst", label: "SA" }, { key: "goalsAgainst", label: "GA" },
  { key: "savePct", label: "SV%" }, { key: "toiSec", label: "TOI" },
];
/** Default order: skaters by points, then goals, then ice time; goalies by ice time. */
export const DEFAULT_SORT = { skaters: { key: "points", dir: "desc" }, goalies: { key: "toiSec", dir: "desc" } };

/** Stable sort by a column; missing values always last; ties by name. Returns a new array. */
export function sortLines(lines, key, dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return [...lines].sort((a, b) => {
    const x = a[key], y = b[key];
    const xm = x == null, ym = y == null;
    if (xm !== ym) return xm ? 1 : -1;
    if (!xm && x !== y) return typeof x === "string" ? sign * x.localeCompare(y) : sign * (x - y);
    if (key === "points" && a.goals !== b.goals) return -((a.goals ?? 0) - (b.goals ?? 0));
    return String(a.name).localeCompare(String(b.name));
  });
}

const pts = (g, a) => [g ? `${g}G` : "", a ? `${a}A` : ""].filter(Boolean).join(" ");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Notable performances: display filters on real stats, ordered by the existing indexes. Each card carries `text` with the real numbers that triggered it.
 * @param {{ live?: boolean }} [opt] live games show at most 2 cards.
 * @returns {{ id: string, playerId: number, name: string, team: string, number: number|null, headshot?: string, position: string, kind: string, text: string }[]}
 */
export function notablePerformances(box, { live = false } = {}) {
  const T = THRESHOLDS, out = [];
  const byId = new Map((box?.players ?? []).map((p) => [p.id, p]));
  const skRank = nightsOf(box ? [box] : [], { minToi: 0 });
  for (const n of skRank) {
    const p = byId.get(n.id);
    if (!p) continue;
    const g = nv(p.goals), a = nv(p.assists), s = nv(p.shots), total = g + a;
    const bits = [];
    if (g >= T.hatTrick) bits.push({ kind: "hat-trick", text: `Hat trick: ${plural(g, "goal")}${a ? `, ${plural(a, "assist")}` : ""}` });
    else if (total >= T.points) bits.push({ kind: "points", text: `${plural(total, "point")}: ${pts(g, a)}` });
    if (s >= T.shots) bits.push({ kind: "shots", text: `${s} shots on goal` });
    if (!bits.length) continue;
    out.push({ id: `${p.id}:skater`, playerId: p.id, name: p.name, team: p.team, number: p.number ?? null, headshot: p.headshot, position: p.position, kind: bits[0].kind, text: bits.map((b) => b.text).join("; "), rank: n.total });
  }
  const goalies = (box?.players ?? []).filter((p) => p.position === "G" && goaliePlayed(p));
  const gOut = [];
  for (const p of goalies) {
    const sv = nv(p.saves), sa = nv(p.shotsAgainst), ga = nv(p.goalsAgainst), pct = savePct(p.saves, p.shotsAgainst);
    const bits = [];
    if (sa >= T.shutoutShots && ga === 0 && isNum(p.goalsAgainst)) bits.push(`Shutout: ${sv} saves on ${sa} shots`);
    else if (sv >= T.saves) bits.push(`${sv} saves on ${sa} shots (${fmtSv(pct)})`);
    else if (pct != null && sa >= T.svFlagShots && pct >= T.svFlag) bits.push(`${fmtSv(pct)} save % (${sv} of ${sa})`);
    if (!bits.length) continue;
    gOut.push({ id: `${p.id}:goalie`, playerId: p.id, name: p.name, team: p.team, number: p.number ?? null, headshot: p.headshot, position: "G", kind: "goalie", text: bits[0], rank: goalieImpact(p) ?? -Infinity });
  }
  gOut.sort((x, y) => y.rank - x.rank || x.name.localeCompare(y.name));
  // Interleave: best skater and best goalie first so a goalie is not buried under skaters (and live games show the top two overall).
  const merged = [];
  for (let i = 0; i < Math.max(out.length, gOut.length); i++) { if (out[i]) merged.push(out[i]); if (gOut[i]) merged.push(gOut[i]); }
  const cards = merged.slice(0, live ? 2 : 6);
  return cards.map(({ rank, ...c }) => c);
}

