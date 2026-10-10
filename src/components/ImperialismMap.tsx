import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { Delaunay } from "d3-delaunay";
import { geoConicConformal, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import arenas from "../lib/arenas.json";
import { LAYERS, adjacencyFromDelaunay, buildImperialism, conquestPath, largestComponent, ownerIndicesAt } from "../lib/imperialism.mjs";
import type { Game, Team } from "../types";
import "./imperialism.css";

type Pt = [number, number];
type Geo = { cells: Pt[]; land: Topology };
type Layer = "full" | "E" | "W";
type Result = ReturnType<typeof buildImperialism>;

/* ---------- lazy runtime data (fetched, not bundled) ---------- */
let geoPromise: Promise<Geo> | null = null;
function loadGeo(): Promise<Geo> {
  if (!geoPromise) {
    const get = async (u: string) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`);
      return r.json();
    };
    geoPromise = Promise.all([get("/data/imperialism/cells.json"), get("/data/imperialism/land.json")])
      .then(([cells, land]) => ({ cells, land }) as Geo)
      .catch((e) => { geoPromise = null; throw e; });
  }
  return geoPromise;
}

/* ---------- geometry (projected once) ---------- */
const W = 960;
const PAD = 6;
const r1 = (s: string) => s.replace(/-?\d+\.\d+/g, (m) => String(Math.round(parseFloat(m) * 10) / 10));
function buildGeometry({ cells, land }: Geo) {
  const states = feature(land, land.objects.states as GeometryCollection);
  const canada = feature(land, land.objects.canada as GeometryCollection);
  const all = { type: "FeatureCollection" as const, features: [...states.features, ...canada.features] };
  const projection = geoConicConformal().parallels([33, 45]).rotate([96, 0]).center([0, 40]);
  projection.fitWidth(W - PAD * 2, all);
  const [tx, ty] = projection.translate();
  const probe = geoPath(projection).bounds(all);
  projection.translate([tx + PAD, ty + PAD - probe[0][1]]);
  const path = geoPath(projection);
  const b = path.bounds(all);
  const H = Math.ceil(b[1][1] + PAD);
  const points: Pt[] = cells.map((c) => (projection(c) ?? [0, 0]) as Pt);
  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([0, 0, W, H]);
  const cellD = points.map((_, i) => r1(voronoi.renderCell(i) as unknown as string));
  const adj: number[][] = points.map((_, i) => Array.from(delaunay.neighbors(i)));
  // contiguity graph: drop Delaunay edges that bridge wide water/gaps
  const lens: number[] = [];
  points.forEach((p, i) => adj[i].forEach((j) => { if (j > i) lens.push(Math.hypot(p[0] - points[j][0], p[1] - points[j][1])); }));
  lens.sort((a, c) => a - c);
  const lim = (lens[Math.floor(lens.length / 2)] || 10) * 2.2;
  const contig = points.map((p, i) => adj[i].filter((j) => Math.hypot(p[0] - points[j][0], p[1] - points[j][1]) <= lim));
  return {
    H, points, delaunay, cellD, adj, contig,
    landD: path(all) ?? "",
    stateLines: path(mesh(land, land.objects.states as GeometryCollection)) ?? "",
    canadaLines: path(mesh(land, land.objects.canada as GeometryCollection)) ?? "",
    center: delaunay.find(W / 2, (H * 0.55)),
    unproject: (i: number) => cells[i],
  };
}
type Geometry = ReturnType<typeof buildGeometry>;

/* ---------- helpers ---------- */
function lighten(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#65a6db";
  const n = parseInt(m[1], 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  }
  const L = Math.min(0.62, Math.max(l, 0.4)), S = Math.min(s, 0.85);
  const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs((h % 2) - 1)), mm = L - c / 2;
  [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + mm) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
const seasonLabel = (s: number) => `${String(s).slice(0, 4)}–${String(s).slice(6)}`;
const useReducedMotion = () => {
  const [v, setV] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const q = matchMedia("(prefers-reduced-motion: reduce)"), f = () => setV(q.matches);
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return v;
};

/* ---------- one land cell (memoised: only re-renders when owner/fill or tab stop changes) ---------- */
const Cell = memo(function Cell({ i, d, fill, tab, label }: { i: number; d: string; fill: string; tab: boolean; label: string }) {
  return <path d={d} fill={fill} stroke={fill} strokeWidth={0.7} strokeLinejoin="round" className="imp-cell" data-cell={i} data-testid={`imp-cell-${i}`} role="button" tabIndex={tab ? 0 : -1} aria-label={label} />;
});

/* ---------- main component ---------- */
export function ImperialismMap({ teams, games, season }: { teams: Team[]; games: Game[]; season: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const reduced = useReducedMotion();
  const [geo, setGeo] = useState<Geo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [layer, setLayer] = useState<Layer>("full");
  const [weekSel, setWeekSel] = useState<number | null>(null); // null = follow latest
  const [playing, setPlaying] = useState(false);
  const [logos, setLogos] = useState(true);
  const [texture, setTexture] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const [rover, setRover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastFocus = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    setErr(null);
    loadGeo().then((g) => live && setGeo(g), (e) => live && setErr(String(e?.message ?? e)));
    return () => { live = false; };
  }, [attempt]);

  const geom: Geometry | null = useMemo(() => (geo ? buildGeometry(geo) : null), [geo]);
  const result: Result | null = useMemo(
    () => (geo ? buildImperialism({ games, teams, arenas, cells: geo.cells, layer }) : null),
    [geo, games, teams, layer],
  );
  const byId = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const colorOf = useMemo(() => new Map(teams.map((t) => [t.id, lighten(t.cardColor || t.color)])), [teams]);

  const latest = result ? result.weeks.length - 1 : 0;
  const week = result ? Math.min(weekSel ?? latest, latest) : 0;
  const owners = useMemo(() => (result ? ownerIndicesAt(result, week) : null), [result, week]);

  // autoplay
  useEffect(() => {
    if (!playing || !result) return;
    const t = setInterval(() => {
      setWeekSel((w) => {
        const cur = Math.min(w ?? latest, latest);
        if (cur >= latest) { setPlaying(false); return null; }
        return cur + 1 >= latest ? null : cur + 1;
      });
    }, reduced ? 1200 : 650);
    return () => clearInterval(t);
  }, [playing, result, latest, reduced]);
  useEffect(() => { if (!playing) return; if (week >= latest) setPlaying(false); }, [playing, week, latest]);

  const goto = useCallback((w: number) => setWeekSel(w >= latest ? null : Math.max(0, w)), [latest]);
  const pickLayer = (l: Layer) => { setLayer(l); setWeekSel(null); setPlaying(false); setOpen(null); };
  const startPlay = () => { if (week >= latest) setWeekSel(0); setPlaying(true); };

  // per-cell fills, stable strings so memoised cells skip re-rendering
  const fillFor = useMemo(() => {
    if (!result) return [] as string[];
    return result.teams.map((id: string) => (texture ? `url(#${uid}-t-${id})` : colorOf.get(id) ?? "#456"));
  }, [result, texture, colorOf, uid]);
  const rawFill = useMemo(() => (result ? result.teams.map((id: string) => colorOf.get(id) ?? "#456") : []), [result, colorOf]);

  // boundaries between rulers, rebuilt per week (single path)
  const borderD = useMemo(() => {
    if (!geom || !owners) return "";
    let s = "";
    for (let i = 0; i < owners.length; i++) {
      const o = owners[i];
      for (const j of geom.adj[i]) if (owners[j] !== o) { s += geom.cellD[i]; break; }
    }
    return s;
  }, [geom, owners]);

  // logo placement: largest contiguous mass per team
  const logoMarks = useMemo(() => {
    if (!geom || !owners || !result || !logos) return [];
    const lands: number[][] = result.teams.map(() => []);
    for (let i = 0; i < owners.length; i++) lands[owners[i]].push(i);
    const out: { id: string; x: number; y: number; size: number }[] = [];
    lands.forEach((list, ti) => {
      if (!list.length) return;
      const comp = largestComponent(list, geom.contig) as number[];
      let cx = 0, cy = 0;
      for (const c of comp) { cx += geom.points[c][0]; cy += geom.points[c][1]; }
      cx /= comp.length; cy /= comp.length;
      const near = geom.delaunay.find(cx, cy);
      if (owners[near] !== ti || !comp.includes(near)) {
        let bd = Infinity;
        for (const c of comp) { const d = Math.hypot(geom.points[c][0] - cx, geom.points[c][1] - cy); if (d < bd) { bd = d; cx = geom.points[c][0]; cy = geom.points[c][1]; } }
      }
      out.push({ id: result.teams[ti], x: cx, y: cy, size: Math.max(18, Math.min(74, 12 + 2.6 * Math.sqrt(comp.length))) });
    });
    return out;
  }, [geom, owners, result, logos]);

  const roving = rover ?? geom?.center ?? 0;
  const labelFor = useCallback((i: number) => {
    const o = owners ? result?.teams[owners[i]] : "";
    return `Cell ${i}, ruled by ${o ?? "nobody"}`;
  }, [owners, result]);

  /* ----- interaction (delegated) ----- */
  const cellFrom = (t: EventTarget | null): number | null => {
    const v = (t as Element | null)?.getAttribute?.("data-cell");
    return v == null ? null : +v;
  };
  const openCell = (i: number) => { lastFocus.current = i; setRover(i); setOpen(i); };
  const onClick = (e: MouseEvent) => { const i = cellFrom(e.target); if (i != null) openCell(i); };
  const onKey = (e: KeyboardEvent) => {
    const i = cellFrom(e.target);
    if (i == null || !geom) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCell(i); return; }
    const dir: Record<string, Pt> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const v = dir[e.key];
    if (!v) return;
    e.preventDefault();
    let best = -1, bs = -Infinity;
    const p = geom.points[i];
    for (const j of geom.adj[i]) {
      const dx = geom.points[j][0] - p[0], dy = geom.points[j][1] - p[1], d = Math.hypot(dx, dy) || 1;
      const sc = (dx * v[0] + dy * v[1]) / d;
      if (sc > bs) { bs = sc; best = j; }
    }
    if (best >= 0 && bs > 0.3) {
      setRover(best);
      requestAnimationFrame(() => svgRef.current?.querySelector<SVGElement>(`[data-cell="${best}"]`)?.focus());
    }
  };
  const closeCard = useCallback(() => {
    setOpen(null);
    const i = lastFocus.current;
    if (i != null) requestAnimationFrame(() => svgRef.current?.querySelector<SVGElement>(`[data-cell="${i}"]`)?.focus());
  }, []);
  useEffect(() => {
    if (open == null) return;
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); closeCard(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, closeCard]);

  /* ----- derived UI data ----- */
  const wk = result?.weeks[week];
  const prev = week > 0 ? result?.weeks[week - 1] : undefined;
  const standings = useMemo(() => {
    if (!wk || !result) return { ranked: [] as { id: string; n: number; d: number }[], landless: [] as string[] };
    const ranked = result.teams
      .map((id: string) => ({ id, n: wk.holdings[id] as number, d: prev ? (wk.holdings[id] as number) - (prev.holdings[id] as number) : 0 }))
      .filter((r: { n: number }) => r.n > 0)
      .sort((a: { n: number; id: string }, b: { n: number; id: string }) => b.n - a.n || a.id.localeCompare(b.id));
    return { ranked, landless: wk.landless as string[] };
  }, [wk, prev, result]);
  const total = geo?.cells.length ?? 0;
  const gamesThisWeek = result && week > 0 ? result.ledger.filter((e: { week: number }) => e.week === week).length : 0;
  const name = (id: string) => byId.get(id)?.name ?? id;
  const logo = (id: string, cls = "imp-chip-logo") => <img className={cls} src={`/logos/${id}.svg`} alt="" width={20} height={20} loading="lazy" decoding="async" />;

  const path = open != null && result ? conquestPath(result, open, week) : [];

  return (
    <section className="imp-root" aria-labelledby={`${uid}-h`}>
      <div className="imp-head">
        <p className="imp-eyebrow">IMPERIALISM MAP</p>
        <h2 id={`${uid}-h`}>NHL conquest map</h2>
        <p className="imp-rules">Start from nearest-arena territories; each finished game hands the loser&apos;s entire land to the winner. {seasonLabel(season)}, regular season and playoffs.</p>
      </div>

      <div className="imp-controls">
        <div className="imp-seg" role="group" aria-label="League layer">
          {(LAYERS as { id: Layer; label: string }[]).map((l) => (
            <button key={l.id} type="button" aria-pressed={layer === l.id} onClick={() => pickLayer(l.id)}>{l.label}</button>
          ))}
        </div>
        <label className="imp-check"><input type="checkbox" checked={logos} onChange={(e) => setLogos(e.target.checked)} /> Team logos</label>
        <label className="imp-check"><input type="checkbox" checked={texture} onChange={(e) => setTexture(e.target.checked)} /> Logo texture</label>
        <div className="imp-zoom" role="group" aria-label="Map zoom">
          <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 1))}>&minus;</button>
          <span aria-hidden="true">{zoom}&times;</span>
          <button type="button" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, z + 1))}>+</button>
        </div>
      </div>

      {err && (
        <div className="imp-error" role="alert">
          Could not load the map data ({err}).
          <button type="button" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
        </div>
      )}
      {!err && !geom && <p className="imp-loading" role="status">Loading map&hellip;</p>}

      {geom && result && owners && (
        <>
          <div className="imp-timeline">
            <div className="imp-buttons">
              <button type="button" aria-label="Back to start" disabled={week === 0} onClick={() => { setPlaying(false); goto(0); }}>&#x23EE;</button>
              <button type="button" aria-label="Previous week" disabled={week === 0} onClick={() => { setPlaying(false); goto(week - 1); }}>&#x25C0;</button>
              <button type="button" className="imp-play" aria-label={playing ? "Pause" : "Play"} disabled={latest === 0} onClick={() => (playing ? setPlaying(false) : startPlay())}>{playing ? "⏸ Pause" : "▶ Play"}</button>
              <button type="button" aria-label="Next week" disabled={week >= latest} onClick={() => { setPlaying(false); goto(week + 1); }}>&#x25B6;</button>
              <button type="button" aria-label="Jump to latest week" disabled={week >= latest} onClick={() => { setPlaying(false); setWeekSel(null); }}>&#x23ED;</button>
            </div>
            <input
              className="imp-slider" data-testid="imp-slider" type="range" min={0} max={latest} step={1} value={week}
              disabled={latest === 0} aria-label="Week" aria-valuetext={wk?.label}
              onChange={(e) => { setPlaying(false); goto(+e.target.value); }}
            />
            <p className="imp-weeklabel" aria-live="polite">
              <strong>{week === 0 ? "Start" : `Week ${week}`}</strong> <span>{week === 0 ? "nearest-arena split" : wk?.label}</span>
              {week > 0 && <em>{gamesThisWeek} game{gamesThisWeek === 1 ? "" : "s"}</em>}
            </p>
          </div>
          <div className="imp-layout">
          <div className="imp-main">
          {latest === 0 && <p className="imp-note imp-empty">Results appear here as games are played.</p>}

          <div className={`imp-mapwrap${zoom > 1 ? " imp-zoomed" : ""}`} style={{ touchAction: zoom > 1 ? "pan-x pan-y" : "auto" }}>
            <svg
              ref={svgRef} className="imp-svg" data-testid="imp-map" viewBox={`0 0 ${W} ${geom.H}`}
              style={{ width: `${zoom * 100}%` }} role="group" aria-label={`Conquest map, ${wk?.label ?? "Start"}. Arrow keys move between cells, Enter opens details.`}
            >
              <defs>
                <clipPath id={`${uid}-clip`}><path d={geom.landD} /></clipPath>
                {texture && result.teams.map((id: string, ti: number) => (
                  <pattern key={id} id={`${uid}-t-${id}`} patternUnits="userSpaceOnUse" width={48} height={48}>
                    <rect width={48} height={48} fill={rawFill[ti]} />
                    <image href={`/logos/${id}.svg`} x={9} y={9} width={30} height={30} opacity={0.2} preserveAspectRatio="xMidYMid meet" />
                  </pattern>
                ))}
              </defs>
              <rect className="imp-sea" width={W} height={geom.H} />
              <g clipPath={`url(#${uid}-clip)`} onClick={onClick} onKeyDown={onKey} onFocus={(e) => { const i = cellFrom(e.target); if (i != null) setRover(i); }}>
                {geom.cellD.map((d: string, i: number) => (
                  <Cell key={i} i={i} d={d} fill={fillFor[owners[i]]} tab={i === roving} label={labelFor(i)} />
                ))}
                <path d={borderD} className="imp-owner-border" />
              </g>
              <path d={geom.stateLines} className="imp-lines" />
              <path d={geom.canadaLines} className="imp-outline" />
              {open != null && <path d={geom.cellD[open]} className="imp-selected" clipPath={`url(#${uid}-clip)`} />}
              {logoMarks.map((m) => (
                <g key={m.id} className="imp-logo" pointerEvents="none">
                  <circle cx={m.x} cy={m.y} r={m.size * 0.58} />
                  <image href={`/logos/${m.id}.svg`} x={m.x - m.size / 2} y={m.y - m.size / 2} width={m.size} height={m.size} preserveAspectRatio="xMidYMid meet" />
                </g>
              ))}
            </svg>
          </div>
          <p className="imp-note">Map covers the contiguous US and Canada south of about 56&deg;N. Alaska, Hawaii and the far north are left out. {total.toLocaleString()} land cells.</p>
          </div>

          <div className="imp-standings" data-testid="imp-standings">
            <h3>Top empires <span>{wk?.label ?? "Start"}</span></h3>
            <ol>
              {(showAll ? standings.ranked : standings.ranked.slice(0, 10)).map((r: { id: string; n: number; d: number }, k: number) => (
                <li key={r.id}>
                  <span className="imp-rank">{k + 1}</span>
                  <i className="imp-swatch" style={{ background: colorOf.get(r.id) }} />
                  {logo(r.id)}
                  <b title={name(r.id)}>{r.id}</b>
                  <span className="imp-bar"><i style={{ width: `${(r.n / total) * 100}%`, background: colorOf.get(r.id) }} /></span>
                  <span className="imp-count">{r.n}<small> {((r.n / total) * 100).toFixed(1)}%</small></span>
                  {r.d !== 0 && <em className={r.d > 0 ? "imp-up" : "imp-down"}>{r.d > 0 ? "+" : ""}{r.d}</em>}
                </li>
              ))}
            </ol>
            {standings.ranked.length > 10 && (
              <button type="button" className="imp-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show top 10" : `Show all (${standings.ranked.length})`}
              </button>
            )}
            <p className="imp-landless">
              <strong>Landless ({standings.landless.length}):</strong>{" "}
              {standings.landless.length ? standings.landless.join(", ") : "none"}
            </p>
          </div>
          </div>
        </>
      )}

      {open != null && geom && result && owners && (
        <div className="imp-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeCard(); }}>
          <div className="imp-card" role="dialog" aria-modal="true" aria-labelledby={`${uid}-card`} data-testid="imp-card">
            <button type="button" className="imp-close" autoFocus aria-label="Close" onClick={closeCard}>&times;</button>
            <h3 id={`${uid}-card`}>Cell {open}</h3>
            <p className="imp-coords">{geom.unproject(open)[1].toFixed(2)}&deg;N, {Math.abs(geom.unproject(open)[0]).toFixed(2)}&deg;W</p>
            <dl>
              <dt>Original home team</dt>
              <dd>{logo(result.home[open])} {name(result.home[open])} ({result.home[open]})</dd>
              <dt>Current ruler{week < latest ? ` (${week === 0 ? "Start" : "Week " + week})` : ""}</dt>
              <dd>{logo(result.teams[owners[open]])} {name(result.teams[owners[open]])} ({result.teams[owners[open]]})</dd>
            </dl>
            <h4>Conquest path</h4>
            <ol className="imp-path">
              {path.map((p: any, k: number) => (
                <li key={k}>
                  {p.type === "home"
                    ? <>Week 0: {p.owner} (home)</>
                    : <>Week {p.week}: {p.winner} beat {p.loser} &rarr; {p.owner} <small>{p.score}, {p.date}</small></>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
export default ImperialismMap;
