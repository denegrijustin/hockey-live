/**
 * The Game Center's live-data engine (Phase 5, docs/phase5-live-data.md). Framework-free: React reads it through
 * src/lib/use-game-feed.ts. ONE poller per game per tab (reference counted), ONE URL per game (`/api/game/:id`, no ?score= trick), and
 * across tabs ONE leader polls and broadcasts (src/lib/tab-leader.mjs).
 *
 * What it does, in order of a poll's life:
 *  1. Cadence comes from the game's phase (src/lib/game-state.mjs pollPlan): live 15 s, intermission 30 s, pregame 30 s within 30 min of puck
 *     drop else 60 s, final = one fetch then one recheck ~3 min later (corrections) then stop, called off = one fetch.
 *  2. A hidden tab polls nothing; when shown again it catches up ONCE (a single fetch, only if the data is older than the interval).
 *  3. Failures keep the last data, set `error`, and retry with exponential backoff and jitter (5 s doubling, capped at 60 s; "not
 *     published yet" (404) just keeps the normal cadence). `stale` turns on when the last good data is older than 2x the expected interval
 *     (never under 45 s), is never raised while the tab is hidden, and clears on the next good response.
 *  4. Every request carries an increasing sequence number (issue time in ms, forced to grow). Responses older than one already applied
 *     are dropped, whether they came from this tab's fetch or another tab's broadcast.
 *  5. The play list goes through event-store.reconcile: stable keys, hash-based `changed`, debounced `voided` goals, prefix rule.
 *     `feed` is the raw response patched with the reconciled plays/goals/shots so panes never see a goal flicker out for one poll.
 *
 * Snapshot (immutable, replaced on every change): {feed, plays, events, changes, lastGoalIds, score, phase, transition, stale, error,
 *   updatedAt, lastOkAt, failures, loading, leader}. `changes` = {seq, added, changed, removed, voided} of the last applied poll;
 *   `transition` = {from, to, seq} when that poll changed the game's phase (never on the first response).
 */
import { reconcile, emptyStore } from "./event-store.mjs";
import { phaseOf, pollPlan, staleAfter, transition as phaseTransition } from "./game-state.mjs";
import { joinLeaderChannel } from "./tab-leader.mjs";

export const BACKOFF_BASE_MS = 5000;
export const BACKOFF_CAP_MS = 60_000;
const FINAL_CHECKS = 2; // the first fetch of a finished game and one recheck

/** Backoff with jitter: 5 s, 10 s, 20 s, 40 s, 60 s..., each scaled by a random 0.5-1.0. */
export function backoffDelay(failures, random = Math.random) {
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(base * (0.5 + 0.5 * random()));
}

const goalsOf = (plays) => plays.filter((p) => p.type === "goal");
/** The raw feed with its play-derived lists replaced by the reconciled ones (only when they differ, so identity is kept otherwise). */
function patchFeed(raw, events) {
  if (!raw) return raw;
  const same = raw.plays?.length === events.length && raw.plays.every((p, i) => p === events[i] || p.id === events[i].id);
  if (same) return raw;
  return {
    ...raw,
    plays: events,
    goals: goalsOf(events),
    shots: events.filter((p) => ["goal", "shot-on-goal"].includes(p.type) && p.periodType !== "SO"),
  };
}

/**
 * createGamePoller(game, env?) -> {subscribe(listener) -> unsubscribe, getSnapshot(), setGame(game), retry()}
 * env (tests): fetch, now, setTimeout, clearTimeout, random, doc, joinChannel (replaces the BroadcastChannel election).
 */
export function createGamePoller(initialGame, env = {}) {
  const doFetch = env.fetch ?? ((...a) => fetch(...a));
  const now = env.now ?? (() => Date.now());
  const st = env.setTimeout ?? ((...a) => setTimeout(...a)), ct = env.clearTimeout ?? ((t) => clearTimeout(t));
  const random = env.random ?? Math.random;
  const doc = env.doc ?? (typeof document !== "undefined" ? document : null);
  const hidden = () => !!doc?.hidden;
  const join = env.joinChannel ?? ((name, handlers) => joinLeaderChannel(name, handlers, env));

  let game = initialGame;
  const url = () => `/api/game/${game.id}`;
  let store = emptyStore(game.id);
  let raw = null;
  let feed = null;
  let changes = null;
  let lastTransition = null;
  let lastInfo = null;
  let lastOkAt = 0, lastAttemptAt = 0, lastSeq = 0;
  let failures = 0, error = null, notFound = false;
  let finalChecks = 0;
  let catchingUp = false;
  let leader = false, channel = null;
  let timer = null, staleTimer = null, controller = null, inFlight = false;
  const listeners = new Set();
  let snapshot = null;

  const currentInfo = () => {
    const g = phaseOf(game, { now: now() });
    if (!feed) return g;
    const f = phaseOf(feed, { now: now() });
    // A finished game stays finished even if a lagging response still says live; otherwise the newest feed wins.
    return g.final && !f.final ? g : f;
  };
  const planNow = () => pollPlan(currentInfo(), feed ?? game, { now: now() });

  function isStale() {
    if (hidden() || catchingUp || !lastOkAt) return false;
    const limit = staleAfter(planNow().expected);
    return limit > 0 && now() - lastOkAt > limit;
  }

  function build() {
    const info = currentInfo();
    snapshot = {
      feed,
      plays: store.events,
      events: store.events,
      changes,
      lastGoalIds: changes ? changes.added.filter((x) => x.play.type === "goal").map((x) => x.key) : [],
      score: store.score,
      phase: info,
      transition: lastTransition,
      stale: info.stale || isStale(),
      error,
      updatedAt: raw?.updatedAt ?? null,
      lastOkAt: lastOkAt || null,
      failures,
      loading: !raw && !error,
      leader,
    };
  }
  function emit() {
    build();
    listeners.forEach((l) => l());
    armStale();
  }

  function armStale() {
    if (staleTimer) ct(staleTimer);
    staleTimer = null;
    if (!listeners.size || !lastOkAt || snapshot.stale) return;
    const limit = staleAfter(planNow().expected);
    if (limit <= 0) return;
    staleTimer = st(() => {
      staleTimer = null;
      if (isStale()) emit();
      else armStale();
    }, Math.max(1000, lastOkAt + limit - now() + 50));
  }

  /** ms until the next fetch (Infinity = no more polling for now). */
  function nextDelay() {
    const plan = planNow();
    if (failures > 0 && !notFound) return backoffDelay(failures, random);
    if (notFound) return plan.every ? Math.max(0, lastAttemptAt + plan.every - now()) : Infinity;
    if (!lastOkAt) return 0;
    if (plan.every) return Math.max(0, lastOkAt + plan.every - now());
    if (plan.recheck && finalChecks < FINAL_CHECKS) return Math.max(0, lastOkAt + Math.round(plan.recheck * (0.95 + 0.1 * random())) - now());
    return Infinity;
  }

  function schedule() {
    if (timer) ct(timer);
    timer = null;
    if (!listeners.size || !leader || hidden()) return;
    const delay = nextDelay();
    if (delay === Infinity) return;
    timer = st(() => {
      timer = null;
      void poll();
    }, delay);
  }

  /** Applies a response (ours or another tab's). Returns false when it was dropped. */
  function apply(json, seq) {
    if (!json || typeof json !== "object" || !Array.isArray(json.plays)) return false;
    const r = reconcile(store, json.plays, { seq, gameId: game.id });
    if (r.dropped === "out-of-order") return false;
    const before = lastInfo;
    store = r.store;
    raw = json;
    feed = patchFeed(json, r.events);
    changes = { seq, added: r.added, changed: r.changed, removed: r.removed, voided: r.voided };
    const info = currentInfo();
    const t = before ? phaseTransition(before, info) : null;
    lastTransition = t ? { ...t, seq } : null;
    lastInfo = info;
    finalChecks = info.final ? (before?.final ? Math.min(FINAL_CHECKS, finalChecks + 1) : 1) : 0;
    lastOkAt = now();
    failures = 0;
    notFound = false;
    error = null;
    return true;
  }

  async function poll() {
    if (inFlight || !listeners.size) return;
    inFlight = true;
    lastAttemptAt = now();
    const seq = (lastSeq = Math.max(lastSeq + 1, now()));
    controller = typeof AbortController === "function" ? new AbortController() : null;
    try {
      const res = await doFetch(url(), { cache: "no-store", signal: controller?.signal });
      if (res.status === 404) {
        notFound = true;
        error = "Play-by-play is not published for this game yet.";
      } else if (!res.ok) throw Error(String(res.status));
      else {
        const json = await res.json();
        if (!apply(json, seq)) {
          if (!json || !Array.isArray(json.plays)) throw Error("bad response");
        } else {
          channel?.post({ t: "feed", seq, feed: json });
        }
      }
    } catch {
      if (controller?.signal.aborted) {
        inFlight = false;
        return;
      }
      notFound = false;
      failures += 1;
      error = "Update unavailable — showing the last received data.";
    }
    inFlight = false;
    catchingUp = false;
    emit();
    schedule();
  }

  function onMessage(m) {
    if (!m) return;
    if (m.t === "feed" && Number.isFinite(m.seq)) {
      lastSeq = Math.max(lastSeq, m.seq);
      if (apply(m.feed, m.seq)) {
        emit();
        schedule();
      }
    } else if (m.t === "need" && leader && raw) channel?.post({ t: "feed", seq: store.seq ?? lastSeq, feed: raw });
  }
  function onLeader(v) {
    leader = v;
    if (v && hidden()) return;
    emit();
    schedule();
  }
  function onVisibility() {
    if (hidden()) {
      if (timer) ct(timer);
      timer = null;
      emit();
      return;
    }
    // Shown again: one catch-up fetch if the data is older than the interval (the leader election may also fire this).
    catchingUp = !!lastOkAt && leader && nextDelay() === 0;
    emit();
    schedule();
  }

  function start() {
    doc?.addEventListener?.("visibilitychange", onVisibility);
    channel = join(`iceboard-game-${game.id}`, { onLeader, onMessage });
    channel.post?.({ t: "need" });
    build();
    schedule();
  }
  function stop() {
    if (timer) ct(timer);
    if (staleTimer) ct(staleTimer);
    timer = staleTimer = null;
    controller?.abort();
    doc?.removeEventListener?.("visibilitychange", onVisibility);
    channel?.close?.();
    channel = null;
    leader = false;
  }

  build();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) stop();
      };
    },
    /** The scoreboard row changed (score, state, clock): the plan may change; never triggers a fetch by itself. */
    setGame(next) {
      if (next === game) return;
      game = next;
      if (listeners.size) {
        emit();
        schedule();
      } else build();
    },
    /** User retry: fetch now, whatever the schedule, leader or visibility. */
    retry() {
      failures = 0;
      notFound = false;
      void poll();
    },
  };
}

const registry = new Map();
/**
 * The shared poller for a game id (one per tab). release() when done; the poller stops with its last subscriber and is dropped
 * once nobody holds it.
 */
export function acquireGamePoller(game) {
  let entry = registry.get(game.id);
  if (!entry) {
    entry = { poller: createGamePoller(game), refs: 0 };
    registry.set(game.id, entry);
  }
  entry.refs += 1;
  entry.poller.setGame(game);
  let released = false;
  return {
    poller: entry.poller,
    release() {
      if (released) return;
      released = true;
      if (--entry.refs <= 0 && registry.get(game.id) === entry) registry.delete(game.id);
    },
  };
}
