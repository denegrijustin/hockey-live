// Prototype: one straight cleaning pass, one smooth turn, departure. Not part of the app bundle.
import { Ice3D, type Frame } from "../../../src/lib/ice3d";
import { buildPath, poseOn, quadsOn, BLADE } from "../../../src/lib/ice-plan.mjs";

const q = new URLSearchParams(location.search);
const W = Number(q.get("w") || 1000), Hh = Number(q.get("h") || 510), dpr = Number(q.get("dpr") || 1);
const canvas = document.getElementById("c") as HTMLCanvasElement;
canvas.style.width = `${W}px`; canvas.style.height = `${Hh}px`;

// the mini route, in the lower right of the sheet (feet): in from the gate, pass 1 west along y=60, a U-turn (radius 3.9) onto y=67.8, pass 2 east, then out through the gate
const r = 3.9, y1 = 60, y2 = y1 + 2 * r;
const route = buildPath({ x: 181, y: 112 }, [
  { line: [181, 82] }, { arc: [181 - 14, 82, 14, 0, -Math.PI / 2] }, { line: [150, y1] },       // gate -> onto the first pass heading west (blade up until x=167)
  { line: [112, y1] }, { arc: [112, y1 + r, r, -Math.PI / 2, -Math.PI * 1.5] },                  // pass 1, then the U-turn
  { line: [160, y2] }, { arc: [160, y2 + 9, 9, -Math.PI / 2, 0] }, { line: [169, 135] },         // pass 2 east, then a right turn toward the gate and out
]);
// cleaning starts where the first pass starts and ends where the second ends
const cleanFrom = route.pts.findIndex((p) => p.y <= y1 + 0.01 && p.x <= 168), cleanTo = route.pts.findIndex((p, i) => i > cleanFrom && p.y >= y2 - 0.01 && p.x >= 158);
const sFrom = route.pts[cleanFrom].s, sTo = route.pts[cleanTo].s;
const plan = { poseAt: (s: number) => poseOn(route, s), sweptQuads: (a: number, b: number, st?: number) => quadsOn(route, a, b, st), enterEnd: sFrom };

const look = { homeId: "TBL", homeName: "Tampa Bay Lightning", color: "#00205b", accent: "#f1b82c", seed: 7, logo: null as HTMLImageElement | null, scouts: null as HTMLImageElement | null };
const img = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

// speed profile along the route: eases in from the gate, steady working speed on the passes, eases down in the turn, picks up leaving
const vWork = Number(q.get("v") || 3.0);
const sAt = (t: number) => Math.min(route.length - 0.01, Math.max(0, t * vWork * (t < 2 ? 0.5 + 0.25 * t : 1)));

(async () => {
  look.logo = await img("/logos/retro/TBL.png"); look.scouts = await img("/logos/kc-scouts.png");
  const num = (k: string, d: number) => Number(q.get(k) ?? d);
  const ice = new Ice3D(canvas, look, plan, (q.get("q") as "high" | "low") || "high");
  await ice.init(q.get("model") || "/models/zamboni.glb");
  if (q.get("cy")) { ice.pose.pos = [100, num("cy", 105), num("cz", 228)]; ice.pose.look = [100, 0, num("lz", 34)]; ice.pose.shift = num("sh", 0.04); }
  ice.resize(W, Hh, dpr);
  ice.setLook(look);
  const cam = q.get("cam");
  const state = (t: number): Frame => {
    const s = sAt(t);
    const phase = s < sFrom ? "enter" : s <= sTo ? "clean" : "exit";
    const down = phase === "clean" ? 1 : phase === "exit" ? Math.max(0, 1 - (s - sTo) / 8) : Math.max(0, (s - (sFrom - 8)) / 8) * 0;
    return { phase, s, clean: Math.max(sFrom, Math.min(s, sTo)), bladeDown: down };
  };
  (window as unknown as Record<string, unknown>).__ice = ice;
  (window as unknown as Record<string, unknown>).__frame = (t: number) => {
    if (cam === "veh") { // a camera placed in the vehicle's own frame (x forward, y up, z to its right): ox,oy,oz from the vehicle centre, looking at lx,ly,lz
      const p = plan.poseAt(sAt(t)), c = Math.cos(p.heading), sn = Math.sin(p.heading);
      const at = (x: number, y: number, z: number) => [p.x + c * x - sn * z, y, p.y + sn * x + c * z] as const;
      const o = at(num("ox", -16), num("oy", 9), num("oz", 16)), l = at(num("lx", -4), num("ly", 3), num("lz", 0));
      ice.cam.position.set(...o); ice.cam.fov = num("fov", 30); ice.cam.updateProjectionMatrix(); ice.cam.lookAt(...l); ice.cam.clearViewOffset();
    }
    ice.render(state(t));
    return { s: sAt(t), phase: state(t).phase, cleaned: ice.cleanedDistance, stats: ice.stats };
  };
  (window as unknown as Record<string, unknown>).__meta = { length: route.length, sFrom, sTo, vWork, blade: BLADE };
  (window as unknown as Record<string, unknown>).__ready = true;
})();
