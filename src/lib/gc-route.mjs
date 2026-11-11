/**
 * Game Center address rules (pure). `?game=ID&tab=<overview|pbp|stats|players|intel>&event=<eventId>`.
 * Ids are digits only, the tab must be one of the five known ids; anything else is ignored so a bad link cannot reach the app.
 * An `event` without a `tab` lands on the Play-by-Play tab (that is where an event lives).
 */
export const GC_TABS = ["overview", "pbp", "stats", "players", "intel"];
const DIGITS = /^\d{1,12}$/;

/** The Game Center the search string names, or null. `tab` is null when not given (the pane then opens on Overview). */
export function parseGameRoute(search) {
  let p;
  try { p = new URLSearchParams(search); } catch { return null; }
  const id = p.get("game");
  if (!id || !DIGITS.test(id)) return null;
  const t = p.get("tab"), e = p.get("event");
  const event = e && DIGITS.test(e) ? Number(e) : null;
  const tab = t && GC_TABS.includes(t) ? t : event != null ? "pbp" : null;
  return { id: Number(id), tab, event };
}

/** The search string with the game route set (or removed when null), every other parameter kept. Overview is the default tab and is not written. */
export function withGameRoute(search, route) {
  const p = new URLSearchParams(search);
  p.delete("game"); p.delete("tab"); p.delete("event");
  if (route && DIGITS.test(String(route.id))) {
    p.set("game", String(route.id));
    if (route.tab && GC_TABS.includes(route.tab) && route.tab !== "overview") p.set("tab", route.tab);
    if (route.event != null && DIGITS.test(String(route.event))) p.set("event", String(route.event));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
