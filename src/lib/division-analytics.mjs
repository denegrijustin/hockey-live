// The Standings analytics table: for every team, the numbers that say how it is really playing next to where the standings have it, each with its rank among all
// the teams in the league, and (inside a division) the rank on 5v5 play against the standings position. Pure: it takes the standings table and MoneyPuck's team summary.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** A value's rank among the values (1 = best; equal values share a rank). `higher` says whether a bigger number is better. */
export function rankOf(value, values, higher = true) {
  if (!isNum(value)) return null;
  return 1 + values.filter((v) => isNum(v) && (higher ? v > value : v < value)).length;
}

/** The metrics, in the order the table shows them. `higher` is whether a bigger number is better; every one of these is. */
export const METRICS = [
  { key: "gd", label: "Goal diff a game", short: "GD/G", higher: true, tip: "Goal differential per game played, from the standings" },
  { key: "xg", label: "5v5 xG share", short: "5v5 xG", higher: true, tip: "Share of the expected goals at 5-on-5: expected goals for / (for + against). MoneyPuck" },
  { key: "goals", label: "5v5 goal share", short: "5v5 goals", higher: true, tip: "Share of the actual goals at 5-on-5: goals for / (for + against). MoneyPuck" },
  { key: "gsax", label: "GSAx", short: "GSAx", higher: true, tip: "Goals saved above expected, all situations: the goals the shots against should have been, minus the goals allowed. A season total. MoneyPuck" },
  { key: "special", label: "Special teams", short: "Special", higher: true, tip: "Net special-teams goals a game: goals for minus goals against on the power play and the penalty kill, per game. MoneyPuck" },
];

/** One row per team with each metric and its league rank (`ranks[key]`, of `pool` teams that have it). */
export function analyticsRows(teams, table, summary) {
  const rows = teams.map((t) => {
    const s = table?.[t.id], mp = summary?.teams?.[t.id];
    const gp = s?.gp ?? 0, f5 = mp?.["5on5"], all = mp?.all, pp = mp?.["5on4"], pk = mp?.["4on5"];
    const share = (a, b) => (isNum(a) && isNum(b) && a + b > 0 ? a / (a + b) : null);
    const mpGp = isNum(all?.gp) && all.gp > 0 ? all.gp : gp;
    const special = isNum(pp?.GF) && isNum(pp?.GA) && isNum(pk?.GF) && isNum(pk?.GA) && mpGp > 0 ? (pp.GF + pk.GF - pp.GA - pk.GA) / mpGp : null;
    return {
      id: t.id, name: t.name, division: t.division, gp, pts: s?.pts ?? 0, ptsPct: gp > 0 ? (s?.pts ?? 0) / (2 * gp) : null,
      gd: gp > 0 ? ((s?.gf ?? 0) - (s?.ga ?? 0)) / gp : null,
      xg: share(f5?.xGF, f5?.xGA), goals: share(f5?.GF, f5?.GA),
      gsax: isNum(all?.xGA) && isNum(all?.GA) ? all.xGA - all.GA : null,
      special,
      ranks: /** @type {Record<string, number | null>} */ ({}), pool: 0,
    };
  });
  for (const m of METRICS) {
    const vals = rows.map((r) => r[m.key]);
    for (const r of rows) r.ranks[m.key] = rankOf(r[m.key], vals, m.higher);
  }
  for (const r of rows) r.pool = rows.filter((x) => isNum(x.xg)).length;
  return rows;
}

/**
 * The teams of one division, each with its standings position (`pos`, by `order`, the standings comparator on team ids), its rank on 5v5 expected-goals share inside
 * the division (`xgRank`) and the change between them: positive when its 5v5 play ranks better than the standings do (an up arrow), negative when worse.
 */
export function divisionView(rows, division, order) {
  const list = rows.filter((r) => r.division === division);
  const byStandings = [...list].sort((a, b) => order(a.id, b.id));
  const out = list.map((r) => {
    const pos = 1 + byStandings.findIndex((x) => x.id === r.id);
    const xgRank = isNum(r.xg) ? 1 + list.filter((x) => isNum(x.xg) && x.xg > r.xg).length : null;
    return { ...r, pos, xgRank, change: xgRank == null ? null : pos - xgRank };
  });
  return out.sort((a, b) => a.pos - b.pos);
}

/** The columns a header can sort by, and which way is "best first". */
export const SORTS = {
  pos: { dir: "asc", get: (r) => r.pos },
  team: { dir: "asc", get: (r) => r.name },
  pts: { dir: "desc", get: (r) => r.pts },
  gd: { dir: "desc", get: (r) => r.gd },
  xg: { dir: "desc", get: (r) => r.xg },
  goals: { dir: "desc", get: (r) => r.goals },
  gsax: { dir: "desc", get: (r) => r.gsax },
  special: { dir: "desc", get: (r) => r.special },
  xgRank: { dir: "asc", get: (r) => r.xgRank },
};

/** Sort the rows by a column. `reverse` flips the best-first order. Teams with no value always go last; ties keep the standings order. */
export function sortRows(rows, key, reverse = false) {
  const spec = SORTS[key] ?? SORTS.pos;
  const sign = (spec.dir === "asc" ? 1 : -1) * (reverse ? -1 : 1);
  return [...rows].sort((a, b) => {
    const x = spec.get(a), y = spec.get(b);
    const nx = x == null || (typeof x === "number" && !Number.isFinite(x)), ny = y == null || (typeof y === "number" && !Number.isFinite(y));
    if (nx || ny) return nx === ny ? a.pos - b.pos : nx ? 1 : -1;
    const c = typeof x === "string" ? x.localeCompare(y) : x - y;
    return sign * c || a.pos - b.pos;
  });
}

const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const GOOD = [24, 152, 66], MID = [222, 232, 238], BAD = [190, 36, 44];
const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;

/**
 * The tile colours for a league rank: strong green for the best, fading through pale grey in the middle to strong red for the worst. `c1`/`c2` are the top and the bottom
 * of the tile's soft gradient, `fg` the text colour that reads on it.
 */
export function cellColors(rank, pool) {
  if (!isNum(rank) || !(pool > 1)) return { c1: "#2a3a52", c2: "#1d2b40", fg: "#e8f0f8", strength: 0 };
  const t = Math.min(1, Math.max(0, (rank - 1) / (pool - 1)));
  const k = Math.pow(Math.abs(t - 0.5) * 2, 0.85);
  const base = lerp(MID, t < 0.5 ? GOOD : BAD, k);
  return { c1: hex(lerp(base, [255, 255, 255], 0.1)), c2: hex(lerp(base, [0, 0, 0], 0.12)), fg: k >= 0.5 ? "#ffffff" : "#0b1626", strength: k };
}

/** "1st", "22nd", "13th". */
export function ordinal(n) {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
}

const sign = (v, d) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
/** Each metric's text in the table: "+1.20", "48.0%", "−0.6"; "—" when there is no value. */
export function formatMetric(key, v) {
  if (!isNum(v)) return "—";
  return key === "gd" || key === "special" ? sign(v, 2) : key === "gsax" ? sign(v, 1) : `${(v * 100).toFixed(1)}%`;
}
