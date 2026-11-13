// The ice-resurfacing plan: ONE route and ONE timeline that place the Zamboni, point it, lower its blade and decide which ice is clean.
// Pure (no DOM, no clock): the renderer feeds it the seconds left on the countdown and draws what it returns, so the vehicle, the blade
// and the cleaned ice cannot drift apart. Units are feet on a 200 x 85 ft sheet: X along the rink, Y across it (0 = far boards, 85 = near boards).
//
// Route (all one connected, smooth path): in through the service gate in the near boards, west along the centre line (blade down), a small
// turn into the first lap of a spiral that works outward lap by lap (adjacent laps overlap by a few inches) around the rounded rectangle of
// the rink, ending on the near boards beside the gate, then out through the gate. Heading is the path's tangent, the blade is at the rear.

export const RINK = { w: 200, h: 85, corner: 28 };
export const BLADE = 8;                 // width of the resurfacing blade (ft)
export const BLADE_BACK = 9;            // blade trails the vehicle's reference point by this (ft)
export const VEHICLE = { len: 14.5, wid: 7 };
export const GATE_X = 181;              // centre of the service gate in the near boards
export const GATE_HALF = 6;
export const FINISH_LEFT = 45;          // cleaning is complete, and the machine starts to leave, with this many seconds left
export const ENTER_S = 18;              // drive in
export const INTERMISSION_S = 18 * 60;
export const PREGAME_S = 20 * 60;
export const DELAY_GRACE_S = 45 * 60;   // how long past the scheduled puck drop a game that has not started keeps its "ice ready" rink

const R_MIN = 3.9;
const D_OUT = BLADE / 2 - 0.1;          // blade lane centre inset from the boards on the outer lap
const D_IN = 34.7;                     // first lap: lane centres either side of the centre strip
const CENTRE_Y = RINK.h / 2;
const TURN = Math.PI / 180;

/** A point on the rounded rectangle inset by `d`, `phi` (0..1) of the way round starting at the near lane heading east (counter-clockwise on screen). */
function loopPoint(d, phi) {
  const x0 = d, x1 = RINK.w - d, y0 = d, y1 = RINK.h - d;
  // corner radius grows smoothly from the first lap's end curves to the rink's own corners, so neighbouring laps stay evenly spaced round every turn
  const rIn = (RINK.h - 2 * D_IN) / 2, rOut = RINK.corner - D_OUT;
  const r = Math.max(1, Math.min(rIn + ((D_IN - d) * (rOut - rIn)) / (D_IN - D_OUT), (y1 - y0) / 2, (x1 - x0) / 2));
  const lx = x1 - x0 - 2 * r, ly = y1 - y0 - 2 * r, arc = (Math.PI / 2) * r;
  const per = 2 * lx + 2 * ly + 4 * arc;
  let t = phi * per;
  const seg = [lx, arc, ly, arc, lx, arc, ly, arc];
  for (let i = 0; i < 8; i++) {
    if (t <= seg[i] || i === 7) {
      const f = seg[i] > 0 ? Math.min(1, t / seg[i]) : 0;
      switch (i) {
        case 0: return { x: x0 + r + f * lx, y: y1 };
        case 1: { const a = f * (Math.PI / 2); return { x: x1 - r + r * Math.sin(a), y: y1 - r + r * Math.cos(a) }; }
        case 2: return { x: x1, y: y1 - r - f * ly };
        case 3: { const a = f * (Math.PI / 2); return { x: x1 - r + r * Math.cos(a), y: y0 + r - r * Math.sin(a) }; }
        case 4: return { x: x1 - r - f * lx, y: y0 };
        case 5: { const a = f * (Math.PI / 2); return { x: x0 + r - r * Math.sin(a), y: y0 + r - r * Math.cos(a) }; }
        case 6: return { x: x0, y: y0 + r + f * ly };
        default: { const a = f * (Math.PI / 2); return { x: x0 + r - r * Math.cos(a), y: y1 - r + r * Math.sin(a) }; }
      }
    }
    t -= seg[i];
  }
  return { x: x0, y: y1 };
}

const STEP = 0.5; // ft between route samples
function arcPts(cx, cy, r, a0, a1) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / STEP)), out = [];
  for (let i = 1; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return out;
}
function linePts(from, to) {
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / STEP)), out = [];
  for (let i = 1; i <= n; i++) out.push({ x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
  return out;
}

let cached = null;
/** The whole route as dense samples {x, y, s} (s = distance along it) with the distances where each stage starts. Built once. */
export function route() {
  if (cached) return cached;
  const pts = [{ x: GATE_X, y: 112 }];
  const add = (list) => { for (const p of list) pts.push(p); };
  // 1. in through the gate heading north, then a left curve onto the centre line heading west
  const turnR = 20, ey = CENTRE_Y;
  add(linePts(pts[0], { x: GATE_X, y: ey + turnR }));
  add(arcPts(GATE_X - turnR, ey + turnR, turnR, 0, -Math.PI / 2));   // (181, ey+20) north -> (161, ey) west
  const enterEnd = pts.length - 1;
  // 2. the centre pass, blade down, west to the end of the first lap's reach
  const xw = 24;                                                     // far enough west that the trailing blade covers the strip to the end of the first lap
  add(linePts(pts.at(-1), { x: xw, y: ey }));
  // 3. a small left turn (half a blade across) onto the near lane of the first lap, heading east
  const r0 = (RINK.h - D_IN - ey) / 2;                    // = half the gap from the centre line to the near lane
  add(arcPts(xw, ey + r0, r0, -Math.PI / 2, -Math.PI * 1.5));
  add(linePts(pts.at(-1), loopPoint(D_IN, 0)));                       // along the near lane to where the first lap begins
  const cleanStart = enterEnd; // the blade is down from the end of the drive in (the centre pass is already ice to clean)
  // 4. the spiral, outward, lap by lap
  // a first lap round the centre strip, four laps that step outward by just under a blade width each, then a finishing lap round the boards that ends beside the gate
  const lapsFirst = 1, lapsIn = 4.5, lapsOut = 1.79, N = 600;          // samples per lap
  for (let i = 1; i <= Math.round((lapsFirst + lapsIn + lapsOut) * N); i++) {
    const u = i / N, w = u - lapsFirst;
    const d = w <= 0 ? D_IN : w < lapsIn ? D_IN - ((D_IN - D_OUT) * w) / lapsIn : D_OUT;
    add([loopPoint(d, u % 1)]);
  }
  const spiralEnd = pts.length - 1;
  // 5. out through the gate: a right turn from the near lane, then straight south
  const last = pts.at(-1), exitR = 9;
  add(arcPts(last.x, last.y + exitR, exitR, -Math.PI / 2, 0));
  add(linePts(pts.at(-1), { x: pts.at(-1).x, y: 140 }));
  // distances and a smooth tangent for every sample
  let s = 0;
  const out = pts.map((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); return { x: p.x, y: p.y, s }; });
  const idxAtX = (x, from) => { for (let i = from; i < out.length; i++) if (out[i].x <= x) return i; return from; };
  cached = { pts: out, length: s, enterEnd: out[enterEnd].s, cleanStart: out[cleanStart].s, spiralEnd: out[spiralEnd].s, idxAtX, count: out.length };
  return cached;
}

/**
 * The route is the path of the BLADE. At distance `s` the blade is at (bx, by) heading `heading` (radians, 0 = east, y down); the machine's
 * reference point (x, y) is BLADE_BACK ahead of it along that heading, so the rear overhang is what follows the route and the cleaned ice is
 * exactly the ground the blade covered. In a tight turn the machine swings round its blade.
 */
export function poseOn(r, s) {
  const p = r.pts;
  const c = Math.max(0, Math.min(r.length, s));
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].s < c) lo = m; else hi = m; }
  const a = p[lo], b = p[hi], f = b.s > a.s ? (c - a.s) / (b.s - a.s) : 0;
  const bx = a.x + (b.x - a.x) * f, by = a.y + (b.y - a.y) * f;
  // heading from a window of the route around the point: smooth through every turn
  const i0 = Math.max(0, lo - 3), i1 = Math.min(p.length - 1, hi + 3);
  const heading = Math.atan2(p[i1].y - p[i0].y, p[i1].x - p[i0].x);
  return { x: bx + BLADE_BACK * Math.cos(heading), y: by + BLADE_BACK * Math.sin(heading), heading, bx, by };
}

export const poseAt = (s) => poseOn(route(), s);

/** The two ends of the blade (ground points) for a pose. */
export function bladeEnds(pose) {
  const nx = -Math.sin(pose.heading), ny = Math.cos(pose.heading), h = BLADE / 2;
  return [{ x: pose.bx + nx * h, y: pose.by + ny * h }, { x: pose.bx - nx * h, y: pose.by - ny * h }];
}

/** The ice the blade lays between distance `from` and `to` along the route, as quads {a0,a1,b1,b0} (blade then, blade now), in order. */
export function quadsOn(r, from, to, step = 0.75) {
  const out = [];
  let prev = bladeEnds(poseOn(r, from));
  for (let s = from + step; s < to + step; s += step) {
    const cur = bladeEnds(poseOn(r, Math.min(s, to)));
    out.push([prev[0], cur[0], cur[1], prev[1]]);
    prev = cur;
    if (s >= to) break;
  }
  return out;
}

export const sweptQuads = (from, to, step = 0.75) => quadsOn(route(), from, to, step);

/** A route object from a list of path pieces: {line:[x,y]} or {arc:[cx,cy,r,a0,a1]} starting at `start` (used by tests and prototypes; the real route is route()). */
export function buildPath(start, pieces) {
  const pts = [{ ...start }];
  for (const pc of pieces) {
    const last = pts.at(-1);
    if (pc.line) { const [x, y] = pc.line; for (const q of linePts(last, { x, y })) pts.push(q); }
    else { const [cx, cy, r, a0, a1] = pc.arc; for (const q of arcPts(cx, cy, r, a0, a1)) pts.push(q); }
  }
  let d = 0;
  const out = pts.map((p, i) => { if (i) d += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); return { x: p.x, y: p.y, s: d }; });
  return { pts: out, length: d };
}

// ---------------------------------------------------------------------------------------------------------------- timeline

/** Distance covered after `t` seconds of a stretch of length L and duration T that starts at speed v0 and ends at speed v1 (a cubic: no jump in speed). */
const hermite = (L, T, v0, v1, t) => {
  const m = T, a = (m * (v1 + v0) - 2 * L) / (m * m * m), b = (v1 - v0 - 3 * a * m * m) / (2 * m);
  const c = Math.max(0, Math.min(m, t));
  return a * c * c * c + b * c * c + v0 * c;
};

/**
 * The plan for an intermission (or the pregame ice preparation) of `total` seconds from its start to the moment play begins.
 * left = seconds still to go. Phases: wait (before it starts), enter, clean, exit, gone. Speeds are continuous at every boundary.
 */
export function stateAt(left, total = INTERMISSION_S) {
  const r = route();
  const T = Math.max(total, ENTER_S + FINISH_LEFT + 60);
  const tEnterEnd = T - ENTER_S, tCleanEnd = FINISH_LEFT;
  const cleanLen = r.spiralEnd - r.enterEnd, cleanTime = tEnterEnd - tCleanEnd;
  const v = cleanLen / cleanTime;                                   // the working speed, steady through every lap
  const exitLen = r.length - r.spiralEnd, vOut = 4.5;
  const exitWindow = exitLen / ((v + vOut) / 2);
  let phase, s;
  if (left > T) { phase = "wait"; s = 0; }
  else if (left > tEnterEnd) { phase = "enter"; s = hermite(r.enterEnd, ENTER_S, 0, v, T - left); }
  else if (left > tCleanEnd) { phase = "clean"; s = r.enterEnd + v * (tEnterEnd - left); }
  else if (left > tCleanEnd - exitWindow) { phase = "exit"; s = r.spiralEnd + hermite(exitLen, exitWindow, v, vOut, tCleanEnd - left); }
  else { phase = "gone"; s = r.length; }
  // how far the blade is lowered (0 up, 1 down): lowered at the start of the centre pass, raised over 1.5 s at the end of the cleaning
  const down = phase === "clean" ? Math.min(1, (tEnterEnd - left) / 1 + 0) : phase === "exit" ? Math.max(0, 1 - (FINISH_LEFT - left) / 1.5) : 0;
  return { phase, s: Math.min(s, r.length), speed: v, clean: Math.max(r.enterEnd, Math.min(s, r.spiralEnd)), bladeDown: down, cleanTotal: cleanLen, window: { tEnterEnd, tCleanEnd, exitWindow } };
}

/**
 * The countdown a viewer sees, made safe for animation: it never runs backwards (so cleaned ice stays clean), and a correction is absorbed
 * at no more than `rate` times real speed instead of jumping. `target` is the clock's own value, `prev` what was shown last frame.
 */
export function smoothLeft(prev, target, dt, rate = 3) {
  if (prev == null) return target;
  const natural = prev - dt;                                         // time passing normally
  const want = Math.min(natural, target);                            // never later than before
  if (want >= natural - 1e-6) return natural;                        // the clock is on time or behind: carry on at normal speed
  return Math.max(want, natural - (rate - 1) * dt);                  // the clock jumped ahead: catch up quickly but without a jump
}

/** Which intermission or ice preparation this is, so the plan resets only for a new one. */
export const sessionKey = (kind, gameId, period) => `${kind}:${gameId}:${period ?? 0}`;

// ---------------------------------------------------------------------------------------------------------------- camera
/** A fixed camera looking across the rink from the near side: ground (X, Y) and height Z in feet to canvas pixels, for a canvas `w` pixels wide. */
export function makeCamera(w, h) {
  const th = (36 * Math.PI) / 180, camH = 300, gNear = 325;
  const cos = Math.cos(th), sin = Math.sin(th);
  const zNear = gNear * cos + camH * sin;
  const F = ((w * 0.96) / RINK.w) * zNear;
  const cx = w / 2;
  const raw = (X, Y, Z) => {
    const g = gNear + (RINK.h - Y), vx = g, vz = Z - camH;
    const z = vx * cos - vz * sin, u = vx * sin + vz * cos;
    return { x: cx + (F * (X - RINK.w / 2)) / z, y: -(F * u) / z, z, k: F / z };
  };
  const top = raw(RINK.w / 2, 0, 7.5).y;                              // the top of the far glass sits near the top of the picture
  const oy = h * 0.2 - top;
  const project = (X, Y, Z = 0) => { const p = raw(X, Y, Z); return { x: p.x, y: p.y + oy, k: p.k, z: p.z }; };
  return { project, F, w, h };
}

/**
 * Is the ice-preparation window open for an upcoming game? From PREGAME_S before the scheduled puck drop until the feed says play has started
 * (a delayed start keeps the window open for up to 45 minutes past the scheduled time; a game still "not started" after that is a postponement or stale data, and a rink for it would only mislead). Postponed, canceled and finished games never qualify.
 */
export function icePrepActive(game, now = Date.now()) {
  if (!game || game.scheduleState && game.scheduleState !== "OK") return false;
  if (game.state !== "FUT" && game.state !== "PRE") return false;
  const start = Date.parse(game.start);
  if (!Number.isFinite(start)) return false;
  return start - now <= PREGAME_S * 1000 && now - start <= DELAY_GRACE_S * 1000;
}
