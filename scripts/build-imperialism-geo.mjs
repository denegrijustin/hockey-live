// Generates public/data/imperialism/{cells,land}.json from world-atlas + us-atlas. Run once: node scripts/build-imperialism-geo.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { feature, merge } from "topojson-client";
import { topology } from "topojson-server";
import { presimplify, simplify, quantile, sphericalTriangleArea } from "topojson-simplify";
import { geoContains, geoDistance } from "d3-geo";

const require = createRequire(import.meta.url);
const load = (p) => JSON.parse(readFileSync(require.resolve(p), "utf8"));
const LAT_CAP = 56; // Edmonton is the northernmost arena (53.5°N); anything past ~56 is empty tundra that only makes the map tall
const OUT = new URL("../public/data/imperialism/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const world = load("world-atlas/countries-50m.json");
const us = load("us-atlas/states-10m.json");

// Canada, clipped to lat <= 60 (planar clip in lon/lat; Sutherland-Hodgman against one half-plane)
const clipRing = (ring) => {
  const out = [];
  const inside = (p) => p[1] <= LAT_CAP;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (LAT_CAP - a[1]) / (b[1] - a[1]);
      out.push([a[0] + t * (b[0] - a[0]), LAT_CAP]);
    }
  }
  if (out.length < 3) return null;
  out.push(out[0]);
  return out;
};
// d3-geo edges are great circles: densify long lon/lat edges so parallels (49N, 60N cap) stay on their parallel
const densify = (ring, max = 0.4) => {
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / max);
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    out.push(b);
  }
  return out;
};
const ringArea = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(s / 2); };
const clipPolygons = (geom) => {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const res = [];
  for (const poly of polys) {
    const outer = clipRing(densify(poly[0]));
    if (!outer || ringArea(outer) < 0.008) continue; // drop tiny specks (< ~80 km2) but keep e.g. the island of Montreal
    const holes = poly.slice(1).map((h) => clipRing(densify(h))).filter(Boolean);
    res.push([outer, ...holes]);
  }
  return { type: "MultiPolygon", coordinates: res };
};
const canadaF = feature(world, world.objects.countries).features.find((f) => f.properties.name === "Canada");
const canada = { type: "Feature", properties: { name: "Canada" }, geometry: clipPolygons(canadaF.geometry) };

// US contiguous: exclude AK(02), HI(15), territories (>56)
const states = feature(us, us.objects.states).features
  .filter((f) => { const id = +f.id; return id !== 2 && id !== 15 && id < 57 && f.properties.name !== "Puerto Rico"; })
  .map((f) => ({ type: "Feature", id: f.id, properties: { name: f.properties.name }, geometry: f.geometry }));
console.log("states:", states.length, "canada polygons:", canada.geometry.coordinates.length);

// ---- sample points on a regular lon/lat grid
const STEP_LAT = +process.env.STEP_LAT || 0.62, STEP_LON = +process.env.STEP_LON || 0.86;
const BOX = { w: -131, e: -52, s: 24.5, n: LAT_CAP };
const regions = [...states, canada];
const bbox = (f) => { let [w, s, e, n] = [180, 90, -180, -90]; const walk = (c) => typeof c[0] === "number" ? (w = Math.min(w, c[0]), e = Math.max(e, c[0]), s = Math.min(s, c[1]), n = Math.max(n, c[1])) : c.forEach(walk); walk(f.geometry.coordinates); return [w, s, e, n]; };
const boxes = regions.map(bbox);
const onLand = (lon, lat) => regions.some((f, i) => { const b = boxes[i]; return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3] && geoContains(f, [lon, lat]); });
const cells = [];
for (let lat = BOX.n - STEP_LAT / 2; lat > BOX.s; lat -= STEP_LAT) {
  const row = Math.round((BOX.n - lat) / STEP_LAT);
  for (let lon = BOX.w + (row % 2 ? STEP_LON / 2 : 0); lon < BOX.e; lon += STEP_LON) {
    const p = [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100];
    if (onLand(...p)) cells.push(p);
  }
}
writeFileSync(new URL("cells.json", OUT), JSON.stringify(cells));
console.log("cells:", cells.length);

// ---- arenas must lie in the map region (full-resolution polygons; coastal arenas get a distance report)
const arenas = JSON.parse(readFileSync(new URL("../src/lib/arenas.json", import.meta.url), "utf8"));
const teams = JSON.parse(readFileSync(new URL("../src/data/teams.json", import.meta.url), "utf8"));
let bad = 0;
for (const t of teams) {
  const a = arenas[t.id];
  if (!a) { console.error("missing arena", t.id); bad++; continue; }
  if (!onLand(a.lon, a.lat)) {
    const km = Math.min(...cells.map((c) => geoDistance(c, [a.lon, a.lat]) * 6371));
    console.warn(`  ${t.id} ${a.arena} not inside polygons (nearest sample ${km.toFixed(0)} km)`);
    if (km > 120) bad++;
  }
}
for (const id of Object.keys(arenas)) if (!teams.some((t) => t.id === id)) { console.error("unknown arena team", id); bad++; }
if (bad) { console.error("ARENA CHECK FAILED"); process.exit(1); }
console.log("arena check: all", teams.length, "arenas inside the map region");

// ---- land.json: simplified topology with country outline + state borders
const topo = topology({ states: { type: "FeatureCollection", features: states }, canada: { type: "FeatureCollection", features: [canada] } }, 1e5);
const pre = presimplify(topo, sphericalTriangleArea);
const s = simplify(pre, quantile(pre, +process.env.KEEP || 0.8));
writeFileSync(new URL("land.json", OUT), JSON.stringify(s));
console.log("land.json bytes:", JSON.stringify(s).length);
