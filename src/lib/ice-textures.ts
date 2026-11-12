// The worn and the freshly resurfaced ice as 2D textures (drawn once per scene, then handed to the GPU): rink markings, the home team's logo at centre ice,
// skate scratches and snow on the worn surface, a smooth wet-looking surface for the clean one. Pure canvas 2D; the 3D scene mixes the two through a mask.
export type Look = { homeId: string; homeName: string; color: string; accent: string; seed: number; logo: HTMLImageElement | null; scouts: HTMLImageElement | null };

export const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rgba = (c: string, a = 1) => { const n = parseInt(String(c).replace("#", "").padEnd(6, "0").slice(0, 6), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
export const canvasOf = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

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

export function dirtyTexture(w: number, h: number, k: number, look: Look) {
  const c = canvasOf(w, h), ctx = c.getContext("2d")!, r = rng(look.seed * 7 + 11);
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#a3aeb8"); g.addColorStop(0.5, "#b1bbc4"); g.addColorStop(1, "#9fa9b3");
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

export function cleanTexture(w: number, h: number, k: number, look: Look) {
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

