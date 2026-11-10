/** Pure date-navigation rules shared by the day strip on Home and Games. `days` is the sorted list of days that have games. */
import { isDay, shiftDay } from "./dates.mjs";

/** The day to show when nobody picked one: today if it has games, else the next game day, else the last one. */
export function autoDay(days, today) {
  return days.includes(today) ? today : (days.find((d) => d > today) ?? days.at(-1) ?? today);
}
/** Is the day a real day inside the season's known range (first to last game day)? An empty list accepts any real day. */
export function inRange(days, day) {
  return isDay(day) && (!days.length || (day >= days[0] && day <= days.at(-1)));
}
/** The day shown: the person's pick, else a valid day from the address, else the automatic day. */
export function resolveDate({ picked, days, today, urlDate }) {
  if (picked && inRange(days, picked)) return picked;
  if (urlDate && inRange(days, urlDate)) return urlDate;
  return autoDay(days, today);
}
/** The nearest game day to a day (ties go later); the day itself when it has games. */
export function nearestDay(days, day) {
  if (!days.length) return day;
  let best = days[0];
  for (const d of days) if (Math.abs(Date.parse(d) - Date.parse(day)) <= Math.abs(Date.parse(best) - Date.parse(day))) best = d;
  return best;
}
/** n game days from a day (negative goes back), skipping days with no games, clamped to the first and last game day. A day with no games steps to the nearest game day in that direction. */
export function stepDay(days, date, n) {
  if (!days.length || !n) return date;
  const i = days.indexOf(date);
  if (i >= 0) return days[Math.min(days.length - 1, Math.max(0, i + n))];
  if (n > 0) {
    const after = days.filter((d) => d > date);
    return after.length ? after[Math.min(after.length, n) - 1] : date;
  }
  const before = days.filter((d) => d < date);
  return before.length ? before[Math.max(0, before.length + n)] : date;
}
/** A week from a day: the game day nearest to seven calendar days away, clamped to the range. */
export function stepWeek(days, date, n) {
  if (!days.length) return date;
  const target = shiftDay(date, 7 * n);
  const to = target < days[0] ? days[0] : target > days.at(-1) ? days.at(-1) : target;
  return nearestDay(days, to);
}
/** The address search string with the date set (or removed when null), every other parameter kept. */
export function withDateParam(search, date, key = "date") {
  const p = new URLSearchParams(search);
  if (date) p.set(key, date); else p.delete(key);
  const s = p.toString();
  return s ? `?${s}` : "";
}
/** Which views keep the date in their address. */
export const DATE_VIEWS = ["scoreboard", "games"];
/** The search string for a view: `?view=` for everything but Home, plus the date only where the date means something. */
export function searchFor(view, date) {
  const p = new URLSearchParams();
  if (view !== "scoreboard") p.set("view", view);
  if (date && DATE_VIEWS.includes(view) && isDay(date)) p.set("date", date);
  const s = p.toString();
  return s ? `?${s}` : "";
}
