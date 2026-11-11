/** Day helpers shared by the schedule screens. NHL games carry `date`, the Eastern "hockey day" (YYYY-MM-DD), and `start`, an ISO UTC time. */
const ET = "America/New_York";
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day in YYYY-MM-DD form? */
export function isDay(s) {
  const m = DAY.exec(String(s ?? ""));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
/** The Eastern date (YYYY-MM-DD) of a moment: a Date, an ISO string or milliseconds. Defaults to now. */
export function etDay(when = Date.now()) {
  return new Date(when).toLocaleDateString("en-CA", { timeZone: ET });
}
/** A day moved by n days (negative goes back). Pure calendar arithmetic, immune to time zones and DST. */
export function shiftDay(day, n) {
  const m = DAY.exec(day);
  if (!m) return day;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return d.toISOString().slice(0, 10);
}
/** Whole days from a to b (b - a). */
export function dayDiff(a, b) {
  const t = (s) => { const m = DAY.exec(s); return Date.UTC(+m[1], +m[2] - 1, +m[3]); };
  return Math.round((t(b) - t(a)) / 86400000);
}
/** "Today", "Tomorrow", "Yesterday", else a weekday and date, for a day relative to today. */
export function relativeDay(day, today = etDay()) {
  const diff = dayDiff(today, day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/* ---- Display formatters honouring the user's time zone / 12-24 h preference (Settings > Display) ---- */
let shared = { timeZone: "auto", hour12: "auto" };
/** The app-wide default for fmtTime/fmtDay/fmtDateTime, set by applyDisplay(). "auto" = the device's own zone / locale clock. */
export function setTimePrefs(p = {}) { shared = { timeZone: p.timeZone ?? "auto", hour12: p.hour12 ?? "auto" }; }
export const getTimePrefs = () => shared;
const zoneOf = (p) => (p.timeZone === "ET" ? ET : p.timeZone && p.timeZone !== "auto" ? p.timeZone : undefined);
const clockOf = (p) => (p.hour12 === "12" ? true : p.hour12 === "24" ? false : undefined);
function fmt(when, o, p) {
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return "";
  const prefs = p ?? shared, timeZone = zoneOf(prefs);
  try { return d.toLocaleString("en-US", { ...o, ...(timeZone ? { timeZone } : {}), ...(o.hour ? { hour12: clockOf(prefs) } : {}) }); }
  catch { return d.toLocaleString("en-US", o); }
}
/** "7:00 PM" (or "19:00" with the 24-hour setting) in the chosen zone; `withZone` appends the zone name. */
export const fmtTime = (when, { withZone = false } = {}, prefs) => fmt(when, { hour: "numeric", minute: "2-digit", ...(withZone ? { timeZoneName: "short" } : {}) }, prefs);
/** "Tue, Nov 10" in the chosen zone (`long` gives the weekday in full). */
export const fmtDay = (when, { long = false } = {}, prefs) => fmt(when, { weekday: long ? "long" : "short", month: "short", day: "numeric" }, prefs);
/** "Nov 10, 7:00 PM" in the chosen zone. */
export const fmtDateTime = (when, { withZone = false } = {}, prefs) => fmt(when, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(withZone ? { timeZoneName: "short" } : {}) }, prefs);
