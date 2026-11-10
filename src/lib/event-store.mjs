/**
 * Event store and reconciliation (Phase 5, docs/phase5-live-data.md). Turns successive play-by-play polls of ONE game into a stable,
 * append-mostly list and a precise change log, so panes render by key, alerts fire once, and a lagging or reordered response
 * never makes the page flicker or lose a goal.
 *
 * reconcile(prevStore, plays, {seq, gameId}) -> {store, events, added[], changed[], removed[], voided[], score, dropped}
 *  - Events are the normalized plays of normalizeGameFeed. Key = NHL eventId (unique per game, NOT chronological); the public key of an
 *    item is `${gameId}:${eventId}` when gameId is given. Order = period, then `order` (sortOrder), then time, then id; events
 *    with no period/order/time sort last within their position and never throw.
 *  - Overlapping polls never duplicate: the same eventId is the same event. An unchanged event keeps its previous object, and the
 *    events array keeps its identity when nothing changed (React can skip the render).
 *  - `changed`: a content hash (FNV-1a over the key-sorted JSON of the whole play) differs, e.g. an assist added or the scorer or
 *    strength corrected. Item: {key, id, play, prev}.
 *  - Sequence guard: `seq` is a number that grows with every request issued. A response older than one already applied is dropped
 *    (`dropped: "out-of-order"`, store untouched). An empty play list never erases a store (`dropped: "empty"`).
 *  - Prefix rule: a response that is a strict prefix of the store (a lagging edge copy) never shrinks it. Only events whose `order`
 *    lies INSIDE the response's range count as missing; events beyond the response's last order are kept silently, goals included.
 *    A disallowed goal is therefore voided as soon as the feed has advanced past it (it always does: stoppage, faceoff...), after the debounce.
 *  - Debounce: an event absent from a response is only removed after VOID_AFTER (2) consecutive responses without it. A goal removed
 *    this way is `voided` (and also listed in `removed`); the store score then falls back to the last remaining goal's score.
 *    Other events removed this way are only in `removed`. Counting resets when the event reappears.
 *  - Fingerprint re-match: a goal that disappears and reappears under a NEW eventId with the same `period:time:team:pid` is the SAME goal.
 *    It is reported as `changed` ({reason: "rekeyed", from: oldId}), never as removed + added, so no duplicate alert. If it comes back
 *    after it was already voided it is `added` with {reinstated: true, from: oldId}.
 *  - score: {home, away} after the last non-shootout goal that carries `score`, {0, 0} when there are no goals, null if goals exist
 *    but none carry a score. It is derived from the retained goals so a voided goal lowers it consistently.
 * Limits: the store only knows what the feed shows; it cannot tell a disallowed goal from a feed glitch beyond the two-poll rule, and it
 * does not model reviews (the NHL feed has no review field).
 */

export const VOID_AFTER = 2;

export const emptyStore = (gameId = null) => ({ gameId, seq: null, entries: {}, events: [], score: { home: 0, away: 0 }, tombstones: {} });

/** Public key of an event: `${gameId}:${eventId}`. */
export const eventKey = (gameId, id) => `${gameId}:${id}`;

const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
};
/** 32-bit FNV-1a of the stable JSON of a play. Exported for tests. */
export function hashPlay(play) {
  const s = stable(play);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const num = (v) => (Number.isFinite(v) ? v : Infinity);
const idNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : Infinity);
/** period, then order, then time ("mm:ss"), then id. Missing values sort last. */
export function compareEvents(a, b) {
  return num(a.period) - num(b.period) || num(a.order) - num(b.order) || String(a.time ?? "~").localeCompare(String(b.time ?? "~")) || idNum(a.id) - idNum(b.id) || 0;
}
// Infinity - Infinity is NaN, which `||` treats as falsy: fine for equal missing values.

const isGoal = (p) => p?.type === "goal";
/** period:time:team:pid, the identity of a goal independent of its eventId. */
export const fingerprint = (p) => `${p.period}:${p.time}:${p.team}:${p.pid}`;

function scoreOf(events) {
  const goals = events.filter((p) => isGoal(p) && p.periodType !== "SO");
  if (!goals.length) return { home: 0, away: 0 };
  for (let i = goals.length - 1; i >= 0; i--) if (goals[i].score) return { home: goals[i].score.home, away: goals[i].score.away };
  return null;
}

const NONE = (store, dropped) => ({ store, events: store.events, added: [], changed: [], removed: [], voided: [], score: store.score, dropped });

export function reconcile(prev, plays, { seq = null, gameId = prev?.gameId ?? null } = {}) {
  const base = prev ?? emptyStore(gameId);
  if (seq != null && base.seq != null && seq < base.seq) return NONE(base, "out-of-order");
  const incoming = new Map();
  for (const p of Array.isArray(plays) ? plays : []) if (p && p.id != null) incoming.set(String(p.id), p);
  if (!incoming.size && Object.keys(base.entries).length) return NONE(seq != null ? { ...base, seq } : base, "empty");

  const maxOrder = Math.max(-Infinity, ...[...incoming.values()].map((p) => p.order).filter(Number.isFinite));
  const entries = { ...base.entries };
  const tombstones = { ...base.tombstones };
  const key = (id) => (gameId != null ? eventKey(gameId, id) : String(id));
  const item = (id, play, extra = {}) => ({ key: key(id), id: play.id, play, ...extra });
  const added = [], changed = [], removed = [], voided = [];

  const newIds = [...incoming.keys()].filter((id) => !(id in base.entries));
  const goneIds = Object.keys(base.entries).filter((id) => !incoming.has(id));

  // Fingerprint re-match: a gone goal and a new goal with the same fingerprint are one goal under a new id.
  const rekeyed = new Set();
  const consumed = new Set();
  for (const oldId of goneIds) {
    const old = base.entries[oldId];
    if (!isGoal(old.play)) continue;
    const fp = fingerprint(old.play);
    const newId = newIds.find((id) => !consumed.has(id) && isGoal(incoming.get(id)) && fingerprint(incoming.get(id)) === fp);
    if (newId == null) continue;
    consumed.add(newId);
    rekeyed.add(oldId);
    const play = incoming.get(newId);
    delete entries[oldId];
    entries[newId] = { play, hash: hashPlay(play), fp, missing: 0 };
    changed.push(item(newId, play, { prev: old.play, reason: "rekeyed", from: old.play.id }));
  }

  for (const id of newIds) {
    if (consumed.has(id)) continue;
    const play = incoming.get(id);
    const fp = isGoal(play) ? fingerprint(play) : null;
    entries[id] = { play, hash: hashPlay(play), fp, missing: 0 };
    const tomb = fp && Object.keys(tombstones).find((t) => tombstones[t].fp === fp);
    if (tomb != null) {
      added.push(item(id, play, { reinstated: true, from: tombstones[tomb].play.id }));
      delete tombstones[tomb];
    } else added.push(item(id, play));
  }

  for (const [id, play] of incoming) {
    const old = base.entries[id];
    if (!old) continue;
    const hash = hashPlay(play);
    if (hash === old.hash) {
      if (old.missing) entries[id] = { ...old, missing: 0 };
      continue;
    }
    entries[id] = { play, hash, fp: isGoal(play) ? fingerprint(play) : null, missing: 0 };
    changed.push(item(id, play, { prev: old.play }));
  }

  for (const id of goneIds) {
    if (rekeyed.has(id)) continue;
    const old = base.entries[id];
    const goal = isGoal(old.play);
    // Prefix rule: an event beyond the response's last order is simply not published yet in this (lagging) copy, goals included.
    if (Number.isFinite(old.play.order) && old.play.order > maxOrder) continue;
    const missing = (old.missing ?? 0) + 1;
    if (missing < VOID_AFTER) {
      entries[id] = { ...old, missing };
      continue;
    }
    delete entries[id];
    removed.push(item(id, old.play));
    if (goal) {
      voided.push(item(id, old.play));
      tombstones[id] = { play: old.play, fp: old.fp };
    }
  }

  const structural = added.length || changed.length || removed.length;
  const events = structural
    ? Object.values(entries).map((e) => e.play).sort(compareEvents)
    : base.events;
  const score = structural ? scoreOf(events) : base.score;
  const store = { gameId, seq: seq ?? base.seq, entries, events, score, tombstones };
  return { store, events, added, changed, removed, voided, score, dropped: null };
}
