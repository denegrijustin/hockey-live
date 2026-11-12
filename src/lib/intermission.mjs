/** NHL intermissions run 18 minutes. */
export const INTERMISSION_MS = 18 * 60_000;

/** "13:48" -> seconds, or null when the feed gave no usable clock. */
export function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export const clockText = (sec) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, "0")}`;

/**
 * Seconds left of an intermission. During an intermission the feed's clock is the time remaining, but it only refreshes every poll,
 * so the countdown runs from the last reading (`base` seconds, read at `at`). With no clock in the feed it counts 18 minutes from `seenAt`.
 */
export function intermissionLeft({ base, at, seenAt, now }) {
  if (base != null) return Math.max(0, base - (now - at) / 1000);
  return Math.max(0, (INTERMISSION_MS - (now - seenAt)) / 1000);
}

/**
 * When this intermission was first seen, kept in storage so a reload doesn't restart the fallback clock. Safe with blocked or full storage
 * (counts from now), ignores a stored value that is junk, in the future or older than 3 h, and drops every stale `iceboard-int-*` key.
 */
export const SEEN_PREFIX = "iceboard-int-";
export const SEEN_TTL_MS = 3 * 3_600_000;
export function firstSeenAt(getStorage, key, now) {
  let store;
  try { store = getStorage(); } catch { return now; }
  if (!store) return now;
  let saved = 0;
  try {
    const stamp = Number(store.getItem(key));
    if (Number.isFinite(stamp) && stamp > 0 && stamp <= now && now - stamp < SEEN_TTL_MS) saved = stamp;
  } catch { /* unreadable */ }
  try {
    const stale = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(SEEN_PREFIX) && k !== key) {
        const stamp = Number(store.getItem(k));
        if (!(Number.isFinite(stamp) && stamp > 0 && stamp <= now && now - stamp < SEEN_TTL_MS)) stale.push(k);
      }
    }
    stale.forEach((k) => store.removeItem(k));
  } catch { /* pruning is best effort */ }
  if (saved) return saved;
  try { store.setItem(key, String(now)); } catch { /* full or blocked: count from this visit */ }
  return now;
}
