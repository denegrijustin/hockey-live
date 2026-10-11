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

/**
 * The resurfacing route in a 200 x 85 rink: four laps of the boards, each one inside the last, so the whole sheet is done by the end.
 * Strips are `width` wide and the laps are `width` apart so they just meet. Returns an SVG path with rounded corners.
 */
export function resurfacePath(width = 10, W = 200, H = 85) {
  const laps = 4;
  const parts = [];
  for (let i = 0; i < laps; i++) {
    const g = width / 2 + 1 + i * width;
    const x0 = g, y0 = g, x1 = W - g, y1 = H - g, r = Math.max(4, 24 - i * 5);
    parts.push(
      `${i ? "L" : "M"}${x0 + r} ${y0}H${x1 - r}Q${x1} ${y0} ${x1} ${y0 + r}V${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}H${x0 + r}Q${x0} ${y1} ${x0} ${y1 - r}V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}`,
    );
  }
  return parts.join("");
}

/** The Zamboni finishes this many seconds before the intermission ends. */
export const FINISH_S = 10;
/**
 * How far along its route the Zamboni is (0 to 1) with `left` seconds of the intermission to go: it starts when the intermission does and
 * is done, with the whole sheet fresh, when 10 seconds are left.
 */
export function resurfaceProgress(left, total = INTERMISSION_MS / 1000) {
  return Math.min(1, Math.max(0, 1 - (left - FINISH_S) / (total - FINISH_S)));
}
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
