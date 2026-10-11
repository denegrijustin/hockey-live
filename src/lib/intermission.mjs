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
 * The resurfacing route in a 200 x 85 rink: two laps of the boards, then a pass down the middle. Strips are `width` wide and the laps
 * are `width` apart so they just meet. Returns an SVG path with rounded corners.
 */
export function resurfacePath(width = 16, W = 200, H = 85) {
  const laps = 2;
  const parts = [];
  for (let i = 0; i < laps; i++) {
    const g = width / 2 + 1 + i * width;
    const x0 = g, y0 = g, x1 = W - g, y1 = H - g, r = Math.max(4, 18 - i * 6);
    parts.push(
      `${i ? "L" : "M"}${x0 + r} ${y0}H${x1 - r}Q${x1} ${y0} ${x1} ${y0 + r}V${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}H${x0 + r}Q${x0} ${y1} ${x0} ${y1 - r}V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}`,
    );
  }
  parts.push(`L${W * 0.14} ${H / 2}H${W * 0.86}`);
  return parts.join("");
}

/** One resurfacing pass takes this long, then it starts over. */
export const ROUTE_MS = 42_000;
/** Where the Zamboni is, which way it faces and how much fresh ice lies behind it, `p` (0..1) of the way along its route between points `a` and `b`. */
export function zamboniPose(a, b, p) {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return { x: a.x, y: a.y, deg, fresh: Math.round(100 * (1 - p) * 100) / 100 };
}
