// Canvas rendering for the intermission / pregame ice preparation. All geometry comes from ice-plan.mjs (one route, one timeline); this file only
// draws: the worn and the fresh ice (textures with the rink markings and the home logo), the cleaned area (a persistent canvas the blade paints
// into, quad by quad, exactly where the blade went), the arena, the boards, and the Zamboni itself as a small 3D model seen through the fixed camera.
import { BLADE, GATE_X, GATE_HALF, RINK, bladeEnds, makeCamera, poseAt, route, sweptQuads } from "./ice-plan.mjs";

type Pt = { x: number; y: number };
export type Look = { homeId: string; homeName: string; color: string; accent: string; seed: number; logo: HTMLImageElement | null; scouts: HTMLImageElement | null; homeLogo?: string };

const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hex = (c: string) => { const n = parseInt(String(c).replace("#", "").padEnd(6, "0").slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c: string, a = 1) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
const shade = (c: string, f: number) => { const [r, g, b] = hex(c).map((v) => Math.max(0, Math.min(255, Math.round(v * f)))); return `rgb(${r},${g},${b})`; };
const canvasOf = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

// ------------------------------------------------------------------------------------------------------------------ the ice textures
const RED = "#c8202f", BLUE = "#2150a8";

function markings(ctx: CanvasRenderingContext2D, k: number, crisp: boolean, look: Look) {
  ctx.save();
  ctx.scale(k, k);
  const a = crisp ? 1 : 0.8;
  const line = (x0: number, y0: number, x1: number, y1: number, w: number, c: string) => { ctx.strokeStyle = rgba(c, a); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  // centre red line with its white dashes, blue lines, goal lines
  line(100, 0, 100, 85, 1, RED);
  ctx.strokeStyle = rgba("#f4f7fa", a); ctx.lineWidth = 0.7; ctx.setLineDash([1.1, 1.1]); ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, 85); ctx.stroke(); ctx.setLineDash([]);
  line(75, 0, 75, 85, 1, BLUE); line(125, 0, 125, 85, 1, BLUE);
  line(11, 0, 11, 85, 0.35, RED); line(189, 0, 189, 85, 0.35, RED);
  // faceoff circles, hash marks, dots
  const circle = (x: number, y: number, r: number, c: string, w = 0.2) => { ctx.strokeStyle = rgba(c, a); ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); };
  const dot = (x: number, y: number, r: number, c: string) => { ctx.fillStyle = rgba(c, a); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  circle(100, 42.5, 15, BLUE, 0.35); dot(100, 42.5, 0.7, BLUE);
  for (const [x, y] of [[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5]]) {
    circle(x, y, 15, RED); dot(x, y, 1, RED);
    for (const dx of [-2.9, 2.9]) for (const dy of [-1, 1]) { line(x + dx, y + dy * 15, x + dx, y + dy * 17.2, 0.2, RED); }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { line(x + sx * 2, y + sy * 1.2, x + sx * 4.6, y + sy * 1.2, 0.2, RED); line(x + sx * 2, y + sy * 1.2, x + sx * 2, y + sy * 3.6, 0.2, RED); }
  }
  for (const [x, y] of [[80, 20.5], [80, 64.5], [120, 20.5], [120, 64.5]]) dot(x, y, 1, RED);
  // goal creases
  ctx.strokeStyle = rgba("#2a63c0", a); ctx.fillStyle = rgba("#7fb4e8", crisp ? 0.55 : 0.4); ctx.lineWidth = 0.25;
  for (const sx of [11, 189]) { ctx.beginPath(); ctx.arc(sx, 42.5, 6, sx < 100 ? -Math.PI / 2 : Math.PI / 2, sx < 100 ? Math.PI / 2 : -Math.PI / 2 + Math.PI * 2, false); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  // the home team's logo at centre ice, under whichever surface covers it
  if (look.logo && look.logo.complete && look.logo.naturalWidth) { ctx.globalAlpha = crisp ? 0.95 : 0.85; ctx.drawImage(look.logo, 100 - 12.5, 42.5 - 12.5, 25, 25); ctx.globalAlpha = 1; }
  ctx.restore();
}

function dirtyTexture(w: number, h: number, k: number, look: Look) {
  const c = canvasOf(w, h), ctx = c.getContext("2d")!, r = rng(look.seed * 7 + 11);
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#aeb9c3"); g.addColorStop(0.5, "#bcc6cf"); g.addColorStop(1, "#aab5bf");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // large dull and light patches
  for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, rad = (6 + r() * 22) * k, gr = ctx.createRadialGradient(x, y, 0, x, y, rad); const light = r() > 0.5; gr.addColorStop(0, light ? "rgba(235,242,248,0.16)" : "rgba(110,125,140,0.12)"); gr.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  markings(ctx, k, false, look);
  ctx.lineCap = "round";
  // long skate arcs and many fine scratches
  for (let i = 0; i < 260; i++) {
    const x = r() * w, y = r() * h, len = (14 + r() * 60) * k, a = r() * Math.PI, bend = (r() - 0.5) * len * 0.5;
    ctx.strokeStyle = r() > 0.25 ? `rgba(246,250,253,${0.1 + r() * 0.22})` : `rgba(80,98,118,${0.06 + r() * 0.1})`; ctx.lineWidth = Math.max(0.6, k * (0.08 + r() * 0.18));
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend, x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  for (let i = 0; i < Math.round(w * h * 0.0026); i++) {
    const x = r() * w, y = r() * h, len = (1.5 + r() * 7) * k, a = r() * Math.PI * 2;
    ctx.strokeStyle = r() > 0.2 ? `rgba(250,252,255,${0.1 + r() * 0.3})` : `rgba(70,88,108,${0.05 + r() * 0.1})`; ctx.lineWidth = Math.max(0.5, k * 0.07);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  // snow built up near the boards and round the faceoff spots
  const snow = (x: number, y: number, rad: number, a: number) => { const gr = ctx.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(252,253,255,${a})`); gr.addColorStop(1, "rgba(252,253,255,0)"); ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
  for (let i = 0; i < 90; i++) { const edge = r(); const x = (edge < 0.5 ? (r() < 0.5 ? 6 + r() * 188 : 3 + r() * 194) : 6 + r() * 188) * k, y = (edge < 0.5 ? (r() < 0.5 ? 2 + r() * 8 : 75 + r() * 8) : 4 + r() * 77) * k; snow(x, y, (1 + r() * 3.2) * k, 0.28 + r() * 0.3); }
  for (const [fx, fy] of [[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5], [100, 42.5], [80, 20.5], [120, 64.5]]) for (let i = 0; i < 14; i++) snow((fx + (r() - 0.5) * 20) * k, (fy + (r() - 0.5) * 18) * k, (0.8 + r() * 2.2) * k, 0.22 + r() * 0.22);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < Math.round(w * h * 0.0016); i++) { const s = Math.max(1, k * (0.06 + r() * 0.12)); ctx.fillRect(r() * w, r() * h, s, s); }
  return c;
}

function cleanTexture(w: number, h: number, k: number, look: Look) {
  const c = canvasOf(w, h), ctx = c.getContext("2d")!, r = rng(look.seed * 13 + 5);
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#e1eef7"); g.addColorStop(0.5, "#edf6fb"); g.addColorStop(1, "#d9e9f3");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  markings(ctx, k, true, look);
  // overhead lights reflecting off the wet surface: broad soft patches, a few brighter hot spots (wet, not mirror-like)
  for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, rx = (10 + r() * 26) * k, ry = rx * (0.18 + r() * 0.2); ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(255,255,255,${0.2 + r() * 0.18})`); gr.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = gr; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore(); }
  ctx.lineWidth = Math.max(0.6, k * 0.06);
  for (let i = 0; i < 90; i++) { const x = r() * w, y = r() * h, len = (20 + r() * 70) * k; ctx.strokeStyle = `rgba(190,215,232,${0.06 + r() * 0.08})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (r() - 0.5) * k * 1.2); ctx.stroke(); }
  return c;
}

// ------------------------------------------------------------------------------------------------------------------ boards (a rounded-rectangle perimeter)
function perimeter(): { a: Pt; b: Pt; n: Pt }[] {
  const R = RINK.corner, W = RINK.w, H = RINK.h, segs: { a: Pt; b: Pt; n: Pt }[] = [];
  const pts: Pt[] = [];
  const arc = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 10; i++) { const a = a0 + (i / 10) * (Math.PI / 2); pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }); } };
  arc(R, R, Math.PI); arc(W - R, R, -Math.PI / 2); arc(W - R, H - R, 0); arc(R, H - R, Math.PI / 2);
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; segs.push({ a, b, n: { x: dy / l, y: -dx / l } }); }
  return segs; // n points inward for a clockwise (on screen, y down) walk? checked below by sign
}

// ------------------------------------------------------------------------------------------------------------------ the Zamboni model
type V3 = [number, number, number];
type Face = { p: V3[]; c: string; shade?: number; decal?: (ctx: CanvasRenderingContext2D) => void; id?: string };

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: string, id = ""): Face[] => [
  { p: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c, id: id + "top" },
  { p: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], c, id: id + "front" },
  { p: [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], c, id: id + "back" },
  { p: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], c, id: id + "right" },
  { p: [[x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y0, z0]], c, id: id + "left" },
];
const wheel = (cx: number, cy: number, r: number, w: number, c: string): Face[] => {
  const out: Face[] = [], n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p = (a: number, y: number): V3 => [cx + r * Math.cos(a), cy + y, r + r * Math.sin(a)];
    out.push({ p: [p(a0, -w / 2), p(a1, -w / 2), p(a1, w / 2), p(a0, w / 2)], c, id: "tyre" });
  }
  out.push({ p: Array.from({ length: n }, (_, i): V3 => [cx + r * 0.62 * Math.cos((i / n) * Math.PI * 2), cy + w / 2 + 0.01, r + r * 0.62 * Math.sin((i / n) * Math.PI * 2)]), c: "#8d9aa6", id: "hub" });
  out.push({ p: Array.from({ length: n }, (_, i): V3 => [cx + r * 0.62 * Math.cos((i / n) * Math.PI * 2), cy - w / 2 - 0.01, r + r * 0.62 * Math.sin((i / n) * Math.PI * 2)]).reverse(), c: "#8d9aa6", id: "hub" });
  return out;
};

export type VehicleStyle = { body: string; stripe: string; stripe2: string; scouts: HTMLImageElement | null };

/** The vehicle's faces in its own frame: x forward, y to its right, z up (feet). `down` lowers (1) or raises (0) the resurfacing equipment. */
function vehicle(style: VehicleStyle, down: number): Face[] {
  const f: Face[] = [];
  const body = style.body, lift = (1 - down) * 1.1;
  // rear conditioner (the resurfacing unit) with its blade; hoses; wash-water bar
  f.push(...box(-7.2, -5.0, -4.0, 4.0, 0.35 + lift, 2.7 + lift, "#9aa6b1", "cond"));
  f.push(...box(-7.4, -7.2, -4.0, 4.0, 0.15 + lift, 0.9 + lift, "#d6dde4", "blade"));
  f.push(...box(-5.0, -4.5, -3.2, 3.2, 1.3 + lift * 0.5, 1.7 + lift * 0.5, "#b8651f", "hose"));
  // chassis, snow tank (taller, behind the operator), hood
  f.push(...box(-4.6, 6.6, -3.3, 3.3, 1.7, 3.5, shade(body, 0.82), "chassis"));
  f.push(...box(-4.7, 0.2, -3.45, 3.45, 3.5, 6.3, body, "tank"));
  f.push(...box(-4.5, 0.0, -3.0, 3.0, 6.3, 6.55, shade(body, 1.12), "lid"));
  f.push(...box(2.8, 7.0, -3.1, 3.1, 3.5, 5.0, body, "hood"));
  // front: grille, lamps, bumper
  f.push(...box(7.0, 7.45, -3.2, 3.2, 1.9, 2.9, "#2b3441", "bumper"));
  f.push(...box(7.0, 7.12, -2.7, -1.7, 3.6, 4.3, "#fff6cf", "lampL"), ...box(7.0, 7.12, 1.7, 2.7, 3.6, 4.3, "#fff6cf", "lampR"));
  // stripes along the sides (gold over red)
  f.push(...box(-4.72, 7.02, -3.5, 3.5, 3.65, 3.95, style.stripe, "stripe"));
  f.push(...box(-4.74, 7.04, -3.52, 3.52, 3.2, 3.5, style.stripe2, "stripe2"));
  // operator's seat, operator (jacket, head, cap), steering wheel and column
  f.push(...box(0.35, 1.5, -1.3, 1.3, 3.5, 4.9, "#22262e", "seat"));
  f.push(...box(0.5, 1.4, -1.2, 1.2, 4.9, 6.5, "#26334a", "torso"));
  f.push(...box(0.7, 1.35, -0.55, 0.55, 6.5, 7.15, "#e6b995", "head"));
  f.push(...box(0.65, 1.45, -0.62, 0.62, 7.0, 7.4, "#10203a", "cap"));
  f.push(...box(1.5, 2.9, -0.35, -0.2, 5.0, 5.35, "#26334a", "armL"), ...box(1.5, 2.9, 0.2, 0.35, 5.0, 5.35, "#26334a", "armR"));
  f.push(...box(2.5, 3.0, -1.0, 1.0, 4.9, 5.0, "#161a20", "wheel"));
  // wheels (drive wheels at the back, steering wheels in front)
  for (const [x, side] of [[-2.4, -1], [-2.4, 1], [4.9, -1], [4.9, 1]] as const) f.push(...wheel(x, side * 3.55, 1.7, 1.3, "#15181d"));
  // tail lamps
  f.push(...box(-4.72, -4.62, -2.6, -1.9, 2.0, 2.6, "#e03040", "tailL"), ...box(-4.72, -4.62, 1.9, 2.6, 2.0, 2.6, "#e03040", "tailR"));
  // beacon
  f.push(...box(-3.6, -3.0, -0.3, 0.3, 6.55, 7.1, "#ffb11f", "beacon"));
  return f;
}

// ------------------------------------------------------------------------------------------------------------------ the scene
export type FrameState = { phase: string; s: number; clean: number; bladeDown: number };

export class IceScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private look: Look;
  private cssW = 0; private dpr = 1; private W = 0; private H = 0;
  private cam!: ReturnType<typeof makeCamera>;
  private k = 6; private dirty!: HTMLCanvasElement; private fresh!: HTMLCanvasElement; private ice!: HTMLCanvasElement; private iceCtx!: CanvasRenderingContext2D;
  private bg!: HTMLCanvasElement; private fg!: HTMLCanvasElement; private iceScreen!: HTMLCanvasElement;
  private cleaned: number = route().enterEnd; private iceStale = true; private lastIce = 0;
  private design = 1200;

  constructor(canvas: HTMLCanvasElement, look: Look) { this.canvas = canvas; this.ctx = canvas.getContext("2d")!; this.look = look; }

  /** The picture's aspect ratio (height / width) for the fixed camera. */
  static aspect() { return IceScene.dims(1200).h / 1200; }
  private static dims(w: number) {
    const cam = makeCamera(w, 1);
    const topP = cam.project(RINK.w / 2, 0, 9).y, botP = cam.project(RINK.w / 2, 114, 0).y;
    const pad = w * 0.075;
    return { top: topP - pad, h: botP - topP + pad + w * 0.012 };
  }

  setLook(look: Look) { this.look = look; this.rebuildTextures(); this.iceStale = true; }
  /** Drops the cleaned ice and starts over: a new intermission. */
  reset() { this.cleaned = route().enterEnd; this.iceCtx?.drawImage(this.dirty, 0, 0); this.iceStale = true; }
  get cleanedDistance() { return this.cleaned; }

  resize(cssW: number, dpr: number) {
    const w = Math.max(240, Math.round(cssW));
    if (w === this.cssW && dpr === this.dpr) return;
    this.cssW = w; this.dpr = dpr;
    const d = IceScene.dims(w);
    this.W = Math.round(w * dpr); this.H = Math.round(d.h * dpr);
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.canvas.style.aspectRatio = `${w} / ${d.h}`;
    const base = makeCamera(w, 1);
    // shift so the top of the picture is the top of the arena
    const oy = -d.top;
    this.cam = { ...base, project: (X: number, Y: number, Z = 0) => { const p = base.project(X, Y, Z); return { ...p, y: p.y + oy }; } } as ReturnType<typeof makeCamera>;
    this.k = Math.max(3, Math.min(10, Math.round((this.W * 0.96) / RINK.w)));
    this.rebuildTextures();
    this.buildStatic();
    this.iceStale = true;
    this.cleanedAtBuild = this.cleaned;
  }
  private cleanedAtBuild = 0;

  private rebuildTextures() {
    if (!this.W) return;
    const w = RINK.w * this.k, h = RINK.h * this.k;
    this.dirty = dirtyTexture(w, h, this.k, this.look);
    this.fresh = cleanTexture(w, h, this.k, this.look);
    this.ice = canvasOf(w, h); this.iceCtx = this.ice.getContext("2d")!;
    this.iceCtx.drawImage(this.dirty, 0, 0);
    this.paintClean(route().enterEnd, this.cleaned, true);
    this.iceScreen = canvasOf(this.W, this.H);
  }

  /** The blade lays fresh ice from route distance `from` to `to`: the swept quads clip the fresh texture into the persistent ice canvas. */
  private paintClean(from: number, to: number, all = false) {
    if (to <= from && !all) return;
    const ctx = this.iceCtx, k = this.k, step = 0.75;
    const start = Math.max(route().enterEnd, from - step * 2);
    const quads = sweptQuads(start, to, step);
    if (!quads.length) return;
    ctx.save();
    ctx.beginPath();
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const q of quads) {
      q.forEach((p: Pt, i: number) => { const x = p.x * k, y = p.y * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); });
      ctx.closePath();
    }
    ctx.clip("nonzero");
    const bx = Math.max(0, Math.floor(minx) - 2), by = Math.max(0, Math.floor(miny) - 2), bw = Math.min(this.ice.width - bx, Math.ceil(maxx - minx) + 4), bh = Math.min(this.ice.height - by, Math.ceil(maxy - miny) + 4);
    if (bw > 0 && bh > 0) ctx.drawImage(this.fresh, bx, by, bw, bh, bx, by, bw, bh);
    ctx.restore();
  }

  // -------------------------------------------------------------------------------------------------- static layers
  private tracePerimeter(ctx: CanvasRenderingContext2D, z0: number, z1: number, wantInner: boolean, fill: (n: Pt, a: Pt, b: Pt) => string, gate = false) {
    const cam = this.cam, segs = perimeter(), cx = RINK.w / 2, cy = RINK.h + 325;
    const items = segs.map((s) => ({ s, d: Math.hypot((s.a.x + s.b.x) / 2 - cx, (s.a.y + s.b.y) / 2 - cy) })).sort((a, b) => b.d - a.d);
    for (const { s } of items) {
      const mx = (s.a.x + s.b.x) / 2;
      if (gate && Math.hypot(mx - GATE_X, (s.a.y + s.b.y) / 2 - (RINK.h - 1.5)) < GATE_HALF + 1.5) continue;
      // which side faces the camera: n is the outward normal (checked against the rink centre)
      const mid = { x: mx, y: (s.a.y + s.b.y) / 2 };
      const inward = { x: -s.n.x, y: -s.n.y };
      const toCam = { x: cx - mid.x, y: cy - mid.y };
      const innerVisible = inward.x * toCam.x + inward.y * toCam.y > 0;
      if (innerVisible !== wantInner) continue;
      const q = [cam.project(s.a.x, s.a.y, z0), cam.project(s.b.x, s.b.y, z0), cam.project(s.b.x, s.b.y, z1), cam.project(s.a.x, s.a.y, z1)];
      ctx.fillStyle = fill(wantInner ? inward : s.n, s.a, s.b);
      ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    }
  }

  private buildStatic() {
    const W = this.W, H = this.H, dpr = this.dpr, cam = this.cam, r = rng(this.look.seed * 3 + 1), look = this.look;
    const bg = canvasOf(W, H), c = bg.getContext("2d")!; c.scale(dpr, dpr);
    const w = this.cssW, h = H / dpr;
    // the arena: dark stands under a roof, with the crowd and the lights as tiny points
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#050a18"); g.addColorStop(0.35, "#0b1d44"); g.addColorStop(1, "#08122a");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const farY = cam.project(RINK.w / 2, 0, 0).y;
    for (let row = 0; row < 9; row++) { const y = farY - w * 0.17 + row * w * 0.015; c.fillStyle = `rgba(${20 + row * 3},${40 + row * 5},${90 + row * 7},0.28)`; c.fillRect(0, y, w, w * 0.0075); }
    for (let i = 0; i < 1500; i++) { const x = r() * w, y = r() * (farY - w * 0.02); const t = r(); c.fillStyle = t > 0.93 ? "rgba(255,230,160,0.9)" : t > 0.5 ? `rgba(${90 + r() * 60},${110 + r() * 60},${170 + r() * 70},0.55)` : "rgba(30,50,100,0.6)"; c.fillRect(x, y, Math.max(1, w * 0.0018), Math.max(1, w * 0.0026)); }
    for (let i = 0; i < 7; i++) { const x = (i + 0.5) * (w / 7), gr = c.createRadialGradient(x, 0, 0, x, 0, w * 0.2); gr.addColorStop(0, "rgba(255,244,214,0.35)"); gr.addColorStop(1, "rgba(255,244,214,0)"); c.fillStyle = gr; c.fillRect(x - w * 0.2, 0, w * 0.4, w * 0.2); }
    // the far boards and the end boards (inner faces), with the home team's name on them
    const teamC = look.color || "#1d428a";
    this.tracePerimeter(c, 0, 4, true, (n) => { const lit = 0.72 + 0.28 * Math.max(0, -n.y * 0.7 + 0.3 - Math.abs(n.x) * 0.3); return shade("#dfe6ee", lit); });
    this.tracePerimeter(c, 0, 0.55, true, () => "#e8b92d");
    this.tracePerimeter(c, 2.6, 3.55, true, (n) => shade(teamC, 0.8 + 0.2 * Math.max(0, -n.y)));
    const far = (z: number) => cam.project(RINK.w / 2, 0, z), farL = cam.project(RINK.corner, 0, 2.2), farR = cam.project(RINK.w - RINK.corner, 0, 2.2);
    const fz = far(2.2), size = Math.max(10, (farR.x - farL.x) * 0.058);
    c.save(); c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fff"; c.font = `italic 800 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    const label = look.homeName.toUpperCase();
    c.translate(fz.x, fz.y); c.shadowColor = "rgba(0,0,0,0.35)"; c.shadowBlur = size * 0.1; c.fillText(label, 0, 0); c.restore();
    for (const x of [48, 152]) { const p = cam.project(x, 0, 2.2), s = cam.project(x, 0, 3.4).y - cam.project(x, 0, 1.0).y; if (look.logo?.complete && look.logo.naturalWidth) c.drawImage(look.logo, p.x - Math.abs(s) / 2, p.y - Math.abs(s) / 2, Math.abs(s), Math.abs(s)); }
    // glass above the boards: pale, translucent, with stanchions
    this.tracePerimeter(c, 4, 8.2, true, () => "rgba(150,190,235,0.10)");
    c.strokeStyle = "rgba(205,225,245,0.30)"; c.lineWidth = Math.max(1, w * 0.0014);
    for (const s of perimeter()) { if (Math.round(s.a.x * 7 + s.a.y * 3) % 2) continue; const a = cam.project(s.a.x, s.a.y, 4), b = cam.project(s.a.x, s.a.y, 8.2); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    // the floor outside the near boards, with the dark rubber mat of the service gate
    const nearY = cam.project(RINK.w / 2, RINK.h, 0).y;
    const fl = c.createLinearGradient(0, nearY, 0, h); fl.addColorStop(0, "#2a2f38"); fl.addColorStop(1, "#14171d"); c.fillStyle = fl; c.fillRect(0, nearY, w, h - nearY);
    const m = [cam.project(GATE_X - 5.5, RINK.h, 0), cam.project(GATE_X + 5.5, RINK.h, 0), cam.project(GATE_X + 8, 125, 0), cam.project(GATE_X - 8, 125, 0)];
    c.fillStyle = "#0c0e12"; c.beginPath(); m.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill();
    this.bg = bg;

    // foreground: the near boards (their outer faces, with a gap for the gate) and the near glass, drawn over the machine while it is on the ice
    const fg = canvasOf(W, H), f = fg.getContext("2d")!; f.scale(dpr, dpr);
    this.tracePerimeter(f, 0, 4, false, (n) => shade("#6c7682", 0.75 + 0.25 * Math.max(0, n.y)), true);
    this.tracePerimeter(f, 2.6, 3.55, false, () => shade(teamC, 0.9), true);
    this.tracePerimeter(f, 0, 0.55, false, () => "#b8902a", true);
    this.tracePerimeter(f, 4, 4.35, false, () => "#9aa5b0", true);
    this.tracePerimeter(f, 4.35, 8.2, false, () => "rgba(170,205,240,0.10)", true);
    // the team name on the outer face of the near boards (a flat strip on the wall)
    const nl = cam.project(RINK.corner + 4, RINK.h, 1.7), nr = cam.project(GATE_X - GATE_HALF - 6, RINK.h, 1.7), ns = Math.max(8, (nr.x - nl.x) * 0.05);
    f.save(); f.textAlign = "center"; f.textBaseline = "middle"; f.fillStyle = "rgba(255,255,255,0.92)"; f.font = `italic 800 ${ns}px system-ui, "Segoe UI", Roboto, sans-serif`; f.fillText(look.homeName.toUpperCase(), (nl.x + nr.x) / 2, nl.y); f.restore();
    // gate frame
    const gl = cam.project(GATE_X - GATE_HALF, RINK.h, 0), gr2 = cam.project(GATE_X + GATE_HALF, RINK.h, 0), glt = cam.project(GATE_X - GATE_HALF, RINK.h, 4.2), grt = cam.project(GATE_X + GATE_HALF, RINK.h, 4.2);
    f.strokeStyle = "#cfd6de"; f.lineWidth = Math.max(2, w * 0.0035); f.beginPath(); f.moveTo(gl.x, gl.y); f.lineTo(glt.x, glt.y); f.moveTo(gr2.x, gr2.y); f.lineTo(grt.x, grt.y); f.stroke();
    this.fg = fg;
  }

  // -------------------------------------------------------------------------------------------------- the ice, projected through the camera
  private projectIce() {
    const ctx = this.iceScreen.getContext("2d")!, cam = this.cam, dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.W, this.H);
    ctx.save(); ctx.scale(dpr, dpr);
    const strips = Math.max(120, Math.min(400, Math.round(this.H / dpr / 1.5)));
    for (let i = 0; i < strips; i++) {
      const y0 = (i / strips) * RINK.h, y1 = ((i + 1) / strips) * RINK.h;
      // the width of the sheet at this depth: full width between the corner arcs, narrower inside them
      const inset = (y: number) => { const R = RINK.corner; const dy = y < R ? R - y : y > RINK.h - R ? y - (RINK.h - R) : 0; return dy > 0 ? R - Math.sqrt(Math.max(0, R * R - dy * dy)) : 0; };
      const ym = (y0 + y1) / 2, ins = inset(ym), xl = ins, xr = RINK.w - ins;
      const a = cam.project(xl, ym, 0), b = cam.project(xr, ym, 0), top = cam.project(100, y0, 0).y, bot = cam.project(100, y1, 0).y;
      const sx = xl * this.k, sw = (xr - xl) * this.k;
      if (sw <= 0) continue;
      ctx.drawImage(this.ice, sx, y0 * this.k, sw, Math.max(1, (y1 - y0) * this.k), a.x, top, b.x - a.x, bot - top + 0.8);
    }
    ctx.restore();
    this.iceStale = false;
  }

  // -------------------------------------------------------------------------------------------------- one frame
  render(state: FrameState, now = 0) {
    if (!this.cam) return;
    const ctx = this.ctx, dpr = this.dpr, cam = this.cam;
    // lay down the ice the blade has covered (never undone), refresh the projected picture at most ~12 times a second
    const target = Math.max(this.cleaned, state.clean);
    if (target > this.cleaned) { this.paintClean(this.cleaned, target); this.cleaned = target; this.iceStale = true; }
    if (this.iceStale && (now - this.lastIce > 80 || this.lastIce === 0)) { this.projectIce(); this.lastIce = now || 1; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.drawImage(this.bg, 0, 0);
    ctx.drawImage(this.iceScreen, 0, 0);
    ctx.save(); ctx.scale(dpr, dpr);
    const onIce = state.phase === "enter" || state.phase === "clean" || state.phase === "exit";
    const pose = poseAt(state.s);
    const outside = pose.y > RINK.h + 1.5;
    if (onIce) {
      if (state.phase === "clean" && state.bladeDown > 0.5) this.wetStrip(ctx, state.s);
      if (!outside) this.drawVehicle(ctx, pose, state.bladeDown);
    }
    ctx.restore();
    ctx.drawImage(this.fg, 0, 0);
    if (onIce && outside) { ctx.save(); ctx.scale(dpr, dpr); this.drawVehicle(ctx, pose, state.bladeDown); ctx.restore(); }
    // a faint vignette and a soft top light keep the picture from looking flat
    const g = ctx.createLinearGradient(0, 0, 0, this.H); g.addColorStop(0, "rgba(0,0,0,0.18)"); g.addColorStop(0.25, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
  }

  /** The film of wash water just behind the blade: a short, bright, quickly fading strip along the route. */
  private wetStrip(ctx: CanvasRenderingContext2D, s: number) {
    const cam = this.cam, len = 7, parts = 7;
    for (let i = 0; i < parts; i++) {
      const quads = sweptQuads(Math.max(0, s - len * ((i + 1) / parts)), Math.max(0, s - len * (i / parts)), 1);
      ctx.fillStyle = `rgba(235,246,255,${0.2 * (1 - i / parts)})`;
      ctx.beginPath();
      for (const q of quads) { q.forEach((p: Pt, j: number) => { const sp = cam.project(p.x, p.y, 0); if (j) ctx.lineTo(sp.x, sp.y); else ctx.moveTo(sp.x, sp.y); }); ctx.closePath(); }
      ctx.fill();
    }
  }

  private drawVehicle(ctx: CanvasRenderingContext2D, pose: { x: number; y: number; heading: number }, down: number) {
    const cam = this.cam, ca = Math.cos(pose.heading), sa = Math.sin(pose.heading);
    const style: VehicleStyle = { body: "#1c3d8f", stripe: "#f1b82c", stripe2: "#c8202f", scouts: this.look.scouts };
    const toWorld = (p: V3): V3 => [pose.x + ca * p[0] - sa * p[1], pose.y + sa * p[0] + ca * p[1], p[2]];
    const camPos = { x: RINK.w / 2, y: RINK.h + 325, z: 300 };
    const light = { x: -0.35, y: -0.45, z: 0.82 };
    // a restrained shadow: the footprint pressed slightly toward the light's far side
    const sh = [[-7.4, -4.3], [7.5, -3.6], [7.5, 3.6], [-7.4, 4.3]].map(([x, y]) => cam.project(toWorld([x + 0.5, y + 0.6, 0])[0], toWorld([x + 0.5, y + 0.6, 0])[1], 0));
    ctx.fillStyle = "rgba(20,35,55,0.28)"; ctx.beginPath(); sh.forEach((p: Pt, i: number) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    const faces = vehicle(style, down).map((fc) => {
      const w = fc.p.map(toWorld);
      // outward normal from the first three vertices, in world space
      const a = [w[1][0] - w[0][0], w[1][1] - w[0][1], w[1][2] - w[0][2]], b = [w[2][0] - w[1][0], w[2][1] - w[1][1], w[2][2] - w[1][2]];
      let n: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const l = Math.hypot(...n) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
      const cx = w.reduce((s, p) => s + p[0], 0) / w.length, cy = w.reduce((s, p) => s + p[1], 0) / w.length, cz = w.reduce((s, p) => s + p[2], 0) / w.length;
      const vis = n[0] * (camPos.x - cx) + n[1] * (camPos.y - cy) + n[2] * (camPos.z - cz);
      const depth = Math.hypot(camPos.x - cx, camPos.y - cy, camPos.z - cz);
      const lit = Math.max(0.55, Math.min(1.15, 0.7 + 0.45 * (n[0] * light.x + n[1] * light.y + n[2] * light.z)));
      return { fc, w, n, vis, depth, lit, id: fc.id };
    }).filter((f) => f.vis > 0 || f.id === "tyre" || f.id === "hub").sort((a, b) => b.depth - a.depth);
    for (const { fc, w, lit, n, id } of faces) {
      const q = w.map((p) => cam.project(p[0], p[1], p[2]));
      ctx.fillStyle = shade(fc.c.startsWith("#") ? fc.c : "#888", lit);
      ctx.strokeStyle = "rgba(8,14,28,0.35)"; ctx.lineWidth = Math.max(0.4, this.cssW * 0.0006);
      ctx.beginPath(); q.forEach((p: Pt, i: number) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
      if (id !== "tyre") ctx.stroke();
      // the signage: the KC Scouts logo and BRING HOCKEY TO KC, on the snow tank's sides and its back, and nowhere else
      if (id === "tankright" || id === "tankleft") this.sideSign(ctx, q, id === "tankleft");
      if (id === "tankback") this.rearSign(ctx, q);
      void n;
    }
  }

  /** Draws into the quad `q` (4 projected corners of a face: p0 p1 p2 p3 in face order) through an affine map, so text and logo stay crisp at any size. */
  private onFace(ctx: CanvasRenderingContext2D, q: Pt[], u0: Pt, u1: Pt, u3: Pt, wd: number, ht: number, draw: () => void) {
    void q;
    ctx.save();
    ctx.transform((u1.x - u0.x) / wd, (u1.y - u0.y) / wd, (u3.x - u0.x) / ht, (u3.y - u0.y) / ht, u0.x, u0.y);
    draw();
    ctx.restore();
  }
  private sideSign(ctx: CanvasRenderingContext2D, q: Pt[], flip: boolean) {
    // side faces (see box()): q[0] bottom, q[1] top (start edge), q[2] top (far edge); text runs from q[1] toward q[2] as seen from outside
    const wd = 100, ht = 36;
    this.onFace(ctx, q, q[1], q[2], q[0], wd, ht, () => {
      const scouts = this.look.scouts;
      ctx.fillStyle = "rgba(255,255,255,0.0)";
      const s = ht * 0.84, lx = 8;
      if (scouts?.complete && scouts.naturalWidth) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(lx + s / 2, ht / 2, s / 2 + 1.2, 0, Math.PI * 2); ctx.fill(); ctx.drawImage(scouts, lx, (ht - s) / 2, s, s); }
      ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "italic 900 11.5px system-ui, 'Segoe UI', Roboto, sans-serif";
      const x = lx + s + 7;
      ctx.fillText("BRING", x, ht * 0.26); ctx.fillText("HOCKEY", x, ht * 0.52); ctx.fillText("TO KC", x, ht * 0.78);
    });
    void flip;
  }
  private rearSign(ctx: CanvasRenderingContext2D, q: Pt[]) {
    // rear face corners: q[1] bottom-left, q[2] top-left, q[3] top-right (as seen from behind): origin top-left, x along the top edge, y down the left edge
    const wd = 80, ht = 30;
    this.onFace(ctx, q, q[2], q[3], q[1], wd, ht, () => {
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "italic 900 11px system-ui, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText("BRING", wd / 2, ht * 0.25); ctx.fillText("HOCKEY", wd / 2, ht * 0.52); ctx.fillText("TO KC", wd / 2, ht * 0.8);
    });
  }
}

export { bladeEnds, BLADE };
