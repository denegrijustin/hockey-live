// Imperialism Map engine. Pure functions, no DOM and no JSON imports (Node-testable).
// Rules: week 0 = nearest-arena split. Each finished regular-season/playoff game (in start order):
// the loser's ENTIRE current land goes to the winner. A landless loser transfers nothing; a landless
// winner beating a land-holder takes all of that team's land. Only games between two teams in the layer count.

const R = 6371.0088;
const rad = Math.PI / 180;
const idOf = (t) => (typeof t === "string" ? t : t.id);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Great-circle (haversine) distance in km between [lon,lat] points. */
export function distanceKm(a, b) {
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest arena per cell (great-circle). Ties go to the smaller team id. Returns team ids. */
export function allocate(cells, teams, arenas) {
  const ids = teams.map(idOf).sort();
  const pts = ids.map((id) => {
    const a = arenas[id];
    if (!a) throw new Error(`No arena for team ${id}`);
    return [a.lon, a.lat];
  });
  return cells.map((c) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < ids.length; i++) {
      const d = distanceKm(c, pts[i]);
      if (d < bestD - 1e-9) { bestD = d; best = i; }
    }
    return ids[best];
  });
}

const layerKey = (layer) => {
  const s = String(layer ?? "full").toLowerCase();
  if (s === "e" || s === "east") return "E";
  if (s === "w" || s === "west") return "W";
  return "full";
};
export const LAYERS = [
  { id: "full", label: "Full NHL" },
  { id: "E", label: "East" },
  { id: "W", label: "West" },
];

const isFinished = (g) => g.state === "FINAL" || g.state === "OFF";
const dayNum = (iso) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
const mondayOf = (n) => n - ((n + 3) % 7); // epoch day 0 was a Thursday
const fmt = (n) => { const d = new Date(n * 86400000); return [MONTHS[d.getUTCMonth()], d.getUTCDate()]; };
export function weekLabel(mondayDay) {
  const [m1, d1] = fmt(mondayDay), [m2, d2] = fmt(mondayDay + 6);
  return m1 === m2 ? `${m1} ${d1}–${d2}` : `${m1} ${d1}–${m2} ${d2}`;
}

export function buildImperialism({ games, teams, arenas, cells, layer = "full" }) {
  const key = layerKey(layer);
  const inLayer = teams.filter((t) => key === "full" || (typeof t !== "string" && t.conference === key));
  if (key !== "full" && teams.some((t) => typeof t === "string")) throw new Error("Team objects with conference are required for East/West layers");
  const ids = inLayer.map(idOf).sort();
  const idx = new Map(ids.map((id, i) => [id, i]));
  const home = allocate(cells, ids, arenas);
  const owner = Uint8Array.from(home, (id) => idx.get(id));
  const land = ids.map(() => []);
  owner.forEach((o, c) => land[o].push(c));

  const counted = (games || [])
    .filter((g) => (g.type === 2 || g.type === 3) && isFinished(g) && idx.has(g.home) && idx.has(g.away)
      && g.homeScore != null && g.awayScore != null && g.homeScore !== g.awayScore)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id));

  const holdings = () => Object.fromEntries(ids.map((id, i) => [id, land[i].length]));
  const landless = () => ids.filter((_, i) => land[i].length === 0);
  const weeks = [{ n: 0, label: "Start", holdings: holdings(), landless: landless() }];
  const snapshots = [Uint8Array.from(owner)];
  const ledger = [];

  if (counted.length) {
    const first = mondayOf(dayNum(counted[0].date));
    let week = 0, lastWeekIdx = 0;
    const close = () => { weeks.push({ n: week, label: weekLabel(first + (week - 1) * 7), holdings: holdings(), landless: landless() }); snapshots.push(Uint8Array.from(owner)); };
    for (const g of counted) {
      const wk = Math.max(lastWeekIdx, Math.floor((mondayOf(dayNum(g.date)) - first) / 7) + 1);
      while (week < wk) { if (week > 0) close(); week++; }
      lastWeekIdx = wk;
      const homeWon = g.homeScore > g.awayScore;
      const winner = homeWon ? g.home : g.away, loser = homeWon ? g.away : g.home;
      const w = idx.get(winner), l = idx.get(loser);
      const moved = land[l];
      for (const c of moved) owner[c] = w;
      for (const c of moved) land[w].push(c);
      land[l] = [];
      const hi = Math.max(g.homeScore, g.awayScore), lo = Math.min(g.homeScore, g.awayScore);
      ledger.push({ week, game: g.id, date: g.date, winner, loser, score: `${hi}-${lo}`, end: g.end ?? null, transferred: moved.slice().sort((a, b) => a - b) });
    }
    close();
  }
  return { layer: key, teams: ids, home, ledger, weeks, current: Array.from(owner, (o) => ids[o]), snapshots };
}

const clampWeek = (r, week) => Math.max(0, Math.min(r.weeks.length - 1, week | 0));
/** Owner team id per cell at the end of the given week (0 = start). */
export function ownersAt(r, week) {
  const s = r.snapshots[clampWeek(r, week)];
  return Array.from(s, (o) => r.teams[o]);
}
/** Same as ownersAt but as indices into r.teams (cheap; for renderers). */
export function ownerIndicesAt(r, week) {
  return r.snapshots[clampWeek(r, week)];
}

const pathIndex = new WeakMap();
/** Chronological history of a cell up to `week`: [{week:0,type:"home",owner}, {week,type:"conquest",game,date,winner,loser,owner,score}] */
export function conquestPath(r, cell, week = Infinity) {
  let byCell = pathIndex.get(r);
  if (!byCell) {
    byCell = new Map();
    r.ledger.forEach((e, i) => { for (const c of e.transferred) { let a = byCell.get(c); if (!a) byCell.set(c, (a = [])); a.push(i); } });
    pathIndex.set(r, byCell);
  }
  const out = [{ week: 0, type: "home", owner: r.home[cell] }];
  for (const i of byCell.get(cell) ?? []) {
    const e = r.ledger[i];
    if (e.week > week) break;
    out.push({ week: e.week, type: "conquest", game: e.game, date: e.date, winner: e.winner, loser: e.loser, owner: e.winner, score: e.score });
  }
  return out;
}

/** Adjacency lists (cell index -> neighbour indices) from a d3-delaunay Delaunay's triangles/halfedges. */
export function adjacencyFromDelaunay(delaunay, n) {
  const adj = Array.from({ length: n }, () => new Set());
  const { triangles } = delaunay;
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
    adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
  }
  return adj.map((s) => [...s]);
}

/** Largest contiguous component of `cells` (indices) under `adj`; returns the index list. */
export function largestComponent(cellList, adj) {
  const set = new Set(cellList), seen = new Set();
  let best = [];
  for (const s of cellList) {
    if (seen.has(s)) continue;
    const comp = [], stack = [s];
    seen.add(s);
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      for (const n of adj[c]) if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
    if (comp.length > best.length) best = comp;
  }
  return best;
}
