/**
 * Multi-view address rules (pure). `?multi=ID` or `?multi=ID,ID`: the games shown side by side. Ids are digits only, at most four, no repeats;
 * anything else is dropped so a bad link cannot reach the app.
 */
const DIGITS = /^\d{1,12}$/;
/** How many games the multi view shows at once. */
export const MAX_GAMES = 4;

/** The game ids the search string names (one to four), or null when there is no multi view. */
export function parseMulti(search) {
  let p;
  try { p = new URLSearchParams(search); } catch { return null; }
  const raw = p.get("multi");
  if (raw == null) return null;
  const ids = [];
  for (const part of raw.split(",")) if (DIGITS.test(part) && !ids.includes(Number(part))) ids.push(Number(part));
  return ids.length ? ids.slice(0, MAX_GAMES) : null;
}

/** The search string with the multi view set (or removed when null), every other parameter kept. The Game Center parameters are dropped: the multi view replaces it. */
export function withMulti(search, ids) {
  const p = new URLSearchParams(search);
  p.delete("multi"); p.delete("game"); p.delete("tab"); p.delete("event");
  const clean = (ids ?? []).filter((id) => DIGITS.test(String(id))).slice(0, MAX_GAMES);
  if (clean.length) p.set("multi", clean.join(","));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Is this page one pane of a multi view (`?embed=1`): it shows a single Game Center that cannot be closed from inside. */
export function isEmbedded(search) {
  try { return new URLSearchParams(search).get("embed") === "1"; } catch { return false; }
}
