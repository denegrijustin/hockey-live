/** NHL intermissions run 17 minutes. */
export const INTERMISSION_MS = 17 * 60_000;

/** "13:48" -> seconds, or null when the feed gave no usable clock. */
export function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export const clockText = (sec) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, "0")}`;

/**
 * Seconds left of an intermission. During an intermission the feed's clock is the time remaining, but it only refreshes every poll,
 * so the countdown runs from the last reading (`base` seconds, read at `at`). With no clock in the feed it counts 17 minutes from `seenAt`.
 */
export function intermissionLeft({ base, at, seenAt, now }) {
  if (base != null) return Math.max(0, base - (now - at) / 1000);
  return Math.max(0, (INTERMISSION_MS - (now - seenAt)) / 1000);
}

/** Six lengthwise passes, connected by tangent-continuous rounded U-turns. */
export function resurfacePath() {
  let d = "M30 10H170";
  const k = 0.55228475, r = 6.5;
  for (let i = 0; i < 5; i++) {
    const y = 10 + i * 13, x = i % 2 ? 30 : 170, side = i % 2 ? -1 : 1;
    d += `C${x + side * r * k} ${y} ${x + side * r} ${y + r * (1-k)} ${x + side * r} ${y+r}`;
    d += `C${x + side * r} ${y+r*(1+k)} ${x+side*r*k} ${y+2*r} ${x} ${y+2*r}H${i % 2 ? 170 : 30}`;
  }
  return d;
}

/** Sample once, then interpolate by travel time. Curvature slows turns smoothly;
 * straight sections retain constant speed. The paint follows the actual rear blade.
 * `pointAt` is supplied by SVG so this module remains usable in node tests. */
export function resurfacingMotion(pointAt, length, rear = 10) {
  const samples = [];
  const angleAt = (s) => {
    const a = pointAt(Math.max(0, s - 0.2)), b = pointAt(Math.min(length, s + 0.2));
    return Math.atan2(b.y-a.y, b.x-a.x);
  };
  const delta = (a, b) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
  let time = 0, paint = 0, heading = angleAt(0);
  const count = Math.ceil(length * 2);
  for (let i = 0; i <= count; i++) {
    const distance = length * i / count, p = pointAt(distance), angle = angleAt(distance);
    const bend = Math.abs(delta(angleAt(Math.min(length, distance+5)), angleAt(Math.max(0, distance-5))));
    if (i) time += length / count * (1 + 0.65 * Math.min(1, bend / 1.5));
    heading += delta(angle, heading);
    const bx = p.x - rear * Math.cos(angle), by = p.y - rear * Math.sin(angle);
    if (i) paint += Math.hypot(bx-samples[i-1].bx, by-samples[i-1].by);
    samples.push({ x: p.x, y: p.y, deg: heading*180/Math.PI, bx, by, time, paint });
  }
  return {
    trail: samples.map((p, i) => `${i ? "L" : "M"}${p.bx.toFixed(3)} ${p.by.toFixed(3)}`).join(""),
    at(progress) {
      const t = Math.min(1, Math.max(0, progress)) * time;
      let lo = 0, hi = samples.length-1;
      while (hi-lo > 1) { const mid = (lo+hi)>>1; if (samples[mid].time < t) lo=mid; else hi=mid; }
      const a=samples[lo], b=samples[hi], f=(t-a.time)/(b.time-a.time);
      return { x:a.x+(b.x-a.x)*f, y:a.y+(b.y-a.y)*f, deg:a.deg+(b.deg-a.deg)*f,
        fresh:100*(1-(a.paint+(b.paint-a.paint)*f)/paint) };
    },
  };
}

/** The Zamboni is off the ice, with the whole sheet fresh, when this many seconds are left. */
export const FINISH_S = 10;
/** It spends this long driving off through the gate, so the laps are done with FINISH_S + EXIT_S left. */
export const EXIT_S = 8;
/**
 * How far along its laps the Zamboni is (0 to 1) with `left` seconds of the intermission to go: it starts when the intermission does and
 * has finished the last lap with 18 seconds left.
 */
export function resurfaceProgress(left, total = INTERMISSION_MS / 1000) {
  const end = FINISH_S + EXIT_S;
  return Math.min(1, Math.max(0, 1 - (left - end) / (total - end)));
}
/** The Zamboni makes this many complete resurfacing passes of the ice in an intermission (the first lays the fresh ice, the rest go over it), each a few minutes long so it visibly moves. */
export const PASSES = 6;
/**
 * Where the Zamboni is on its current pass (0 to 1) and whether the fresh ice is already down (the first pass laid it).
 * Passes are evenly spaced so the last one ends as it heads for the gate, with FINISH_S + EXIT_S left.
 */
export function lapState(left, total = INTERMISSION_MS / 1000) {
  const end = FINISH_S + EXIT_S, pass = (total - end) / PASSES;
  const remaining = Math.max(0, left - end);
  if (remaining <= 0) return { progress: 1, laid: true };
  const elapsed = Math.max(0, total - end - remaining);
  const first = elapsed < pass;
  return { progress: first ? elapsed / pass : 1 - (remaining % pass) / pass, laid: !first };
}
/** How far through its drive off the ice (0 to 1): it leaves after the laps and is gone with 10 seconds left. */
export const exitProgress = (left) => Math.min(1, Math.max(0, (FINISH_S + EXIT_S - left) / EXIT_S));
/** The way off the ice: from the last lap's end to the gate in the left boards. */
export const EXIT_PATH = "M30 75C10 75 18 42.5 5 42.5H-18";
/** Where the Zamboni is, which way it faces and how much fresh ice lies behind it, `p` (0..1) of the way along its route between points `a` and `b`. */
export function zamboniPose(a, b, p) {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return { x: a.x, y: a.y, deg, fresh: Math.round(100 * (1 - p) * 100) / 100 };
}

const toRgb = (hex) => {
  const n = parseInt(String(hex).replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
const shade = (hex, t) => toHex(toRgb(hex).map((v) => (t >= 0 ? v + (255 - v) * t : v * (1 + t))));
const luma = (hex) => {
  const [r, g, b] = toRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
/** The Zamboni in the home team's colors: its color for the body (lifted if it is too dark to show against the ice), a deeper cab, and an edge and sign to match. */
export function zamboniColors(teamColor) {
  const base = /^#?[0-9a-f]{6}$/i.test(String(teamColor ?? "")) ? (String(teamColor).startsWith("#") ? teamColor : `#${teamColor}`) : "#e6ae2f";
  const body = luma(base) < 0.22 ? shade(base, 0.35) : base;
  return { body, cab: shade(body, -0.22), edge: shade(body, -0.55), sign: shade(base, -0.78), signText: luma(body) > 0.6 ? "#ffffff" : "#ffffff", accent: shade(body, 0.55) };
}
