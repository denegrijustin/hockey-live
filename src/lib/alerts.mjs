/**
 * Game alerts (Stage A, in-app). Pure: no DOM, no global storage (a storage object is injected), so node tests cover everything.
 *
 * diffGames(prev, games, now) compares the previous snapshot with the live games and returns events with deterministic ids:
 *   `${id}:start`, `${id}:p${n}${type}:begin`, `${id}:p${n}${type}:end`, `${id}:final`, `${id}:${PPD|CNCL|SUSP}`.
 * Score changes are NOT alerted: the scoreboard feed only gives running totals every poll, which cannot say who scored or
 * whether a goal was later disallowed, so those events would not be reliable.
 * The first snapshot is a silent baseline (prev === null), stale-live games never alert, and a score that goes down is treated
 * as a feed glitch for that tick.
 */
import { isFreshLive, isLive } from "./game-data.mjs";

export const ALERTS_KEY = "iceboard-alerts-v1";
export const LOCK_KEY = "iceboard-alerts-lock";
export const SEEN_CAP = 300;
export const ITEM_CAP = 60;
export const TTL_MS = 3 * 24 * 3600_000;
/** More events than this in one tick (a tab coming back after a long time away) collapse into a single "N updates" item. */
export const COALESCE_OVER = 3;
const FINAL = ["OFF", "FINAL"];
const CALLED_OFF = ["PPD", "CNCL", "SUSP"];
const ORD = ["", "1st", "2nd", "3rd"];

const isFinal = (g) => FINAL.includes(g.state);
const sched = (g) => String(g.scheduleState ?? "OK").toUpperCase();
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Human label of a period: 1st, 2nd, 3rd, OT (playoffs: 2OT, 3OT...), SO. */
export function periodLabel(n, type) {
  if (type === "SO") return "shootout";
  if (type === "OT") return n <= 4 ? "overtime" : `${n - 3}OT`;
  return ORD[n] ?? `period ${n}`;
}
const periodTag = (n, type) => `${n}${type ?? "REG"}`;

/** The part of a game the diff cares about. */
const shape = (g, now) => ({
  state: g.state, schedule: sched(g), period: num(g.period), type: g.periodType ?? null, intermission: !!g.intermission,
  home: num(g.homeScore), away: num(g.awayScore), stale: isLive(g) && !isFreshLive(g, now), start: g.start ?? null,
});
/** Snapshot of a game list, keyed by game id: what the next diffGames call compares against. */
export const snapshot = (games, now = Date.now()) => new Map((games ?? []).map((g) => [g.id, shape(g, now)]));

const teamsOf = (g) => [g.away, g.home];
const score = (g) => (num(g.awayScore) !== null && num(g.homeScore) !== null ? `${g.away} ${g.awayScore}, ${g.home} ${g.homeScore}` : `${g.away} at ${g.home}`);
const matchup = (g) => `${g.away} at ${g.home}`;
const ev = (g, id, kind, title, body, now) => ({ id: `${g.id}:${id}`, kind, gameId: g.id, teams: teamsOf(g), title, body, at: now });

/**
 * Events between `prev` (a Map from snapshot(), or null for the first snapshot) and `games`.
 * Returns { events, next }: `next` is the snapshot to keep for the following call. A game missing from `prev` never alerts.
 */
export function diffGames(prev, games, now = Date.now()) {
  const next = snapshot(games, now);
  if (!prev || typeof prev.get !== "function") return { events: [], next };
  const events = [];
  for (const g of games ?? []) {
    const p = prev.get(g.id);
    const c = next.get(g.id);
    if (!p || !c) continue;
    // A score that went down is a feed correction or glitch: say nothing this tick, keep the old state so a real change is still caught next tick.
    if ((p.home !== null && c.home !== null && c.home < p.home) || (p.away !== null && c.away !== null && c.away < p.away)) {
      next.set(g.id, { ...p, home: c.home, away: c.away });
      continue;
    }
    // A game the feed has left "live" for hours says nothing reliable.
    if (c.stale || p.stale) continue;
    const wasLive = ["LIVE", "CRIT"].includes(p.state);
    const nowLive = ["LIVE", "CRIT"].includes(c.state);

    if (CALLED_OFF.includes(c.schedule) && !isFinal(g) && p.schedule !== c.schedule) {
      const word = c.schedule === "PPD" ? "postponed" : c.schedule === "CNCL" ? "canceled" : "suspended";
      events.push(ev(g, c.schedule, "schedule", `${matchup(g)} ${word}`, `The NHL lists this game as ${word}. No new time is shown until the league publishes one.`, now));
      continue;
    }
    if (isFinal(g)) {
      if (FINAL.includes(p.state)) continue;
      // Only from a game we watched: live, or scheduled to start within the last 12 hours (a poll can miss the whole game).
      const recent = !!p.start && Math.abs(now - Date.parse(p.start)) < 12 * 3600_000;
      if (!wasLive && !recent) continue;
      const tag = g.end === "OT" ? " (OT)" : g.end === "SO" ? " (SO)" : "";
      events.push(ev(g, "final", "final", `Final${tag}: ${score(g)}`, `${matchup(g)} ended${g.end === "OT" ? " in overtime" : g.end === "SO" ? " in a shootout" : ""}.`, now));
      continue;
    }
    if (!wasLive && nowLive && !FINAL.includes(p.state) && !CALLED_OFF.includes(p.schedule)) {
      events.push(ev(g, "start", "start", `Puck drop: ${matchup(g)}`, `${matchup(g)} is under way.`, now));
      continue;
    }
    if (wasLive && nowLive && c.period !== null) {
      const changed = p.period !== c.period || p.type !== c.type;
      // End of the period we were in (also when a poll skipped the intermission and the period simply advanced).
      if (p.period !== null && !p.intermission && c.intermission && !changed) {
        events.push(ev(g, `p${periodTag(c.period, c.type)}:end`, "period", `End of ${periodLabel(c.period, c.type)}: ${score(g)}`, `${matchup(g)}.`, now));
      } else if (p.period !== null && changed && !p.intermission) {
        events.push(ev(g, `p${periodTag(p.period, p.type)}:end`, "period", `End of ${periodLabel(p.period, p.type)}: ${score(g)}`, `${matchup(g)}.`, now));
      }
      // Beginning of a later period (never period 1: that is the puck drop).
      if (changed && p.period !== null && !c.intermission && !(c.period === 1 && c.type === "REG")) {
        const what = periodLabel(c.period, c.type);
        events.push(ev(g, `p${periodTag(c.period, c.type)}:begin`, "period", c.type === "SO" ? "Shootout begins" : `${what[0].toUpperCase()}${what.slice(1)} begins`, `${score(g)}.`, now));
      }
    }
  }
  return { events, next };
}

/* ----- relevance ----- */

/**
 * Which events this person asked for. Master switch (default off) and category toggles first, then scope: favorite teams, saved games, and
 * followed players' teams (which only ever yields the puck drop, worded as "plays tonight": an availability fact, nothing about injuries or form).
 * Returns copies carrying `why` ("team" | "saved" | "player") and, for players, `players`.
 */
export function relevantEvents(events, prefs) {
  const a = prefs?.alerts;
  if (!a || a.enabled !== true) return [];
  const fav = new Set(prefs.favorites ?? []);
  const saved = new Set((prefs.games ?? []).map((g) => Number(g.id)));
  const out = [];
  for (const e of events) {
    if (a[e.kind] !== true) continue;
    if (a.scope?.teams && e.teams.some((t) => fav.has(t))) { out.push({ ...e, why: "team" }); continue; }
    if (a.scope?.saved && saved.has(Number(e.gameId))) { out.push({ ...e, why: "saved" }); continue; }
    if (a.scope?.players && e.kind === "start") {
      const ps = (prefs.players ?? []).filter((p) => p.team && e.teams.includes(p.team));
      if (ps.length) {
        const names = ps.slice(0, 2).map((p) => p.name || "A followed player");
        out.push({ ...e, why: "player", players: ps.slice(0, 3).map((p) => ({ id: p.id, name: p.name })), title: `${names.join(" and ")}${ps.length > 2 ? ` and ${ps.length - 2} more` : ""} ${ps.length === 1 ? "plays" : "play"} tonight`, body: `${matchup({ away: e.teams[0], home: e.teams[1] })} has started.` });
      }
    }
  }
  return out;
}

/** One item for many events at once (a tab returning after a long time hidden). */
export function coalesce(events, now) {
  if (events.length <= COALESCE_OVER) return null;
  const head = events.slice(0, 3).map((e) => e.title).join("; ");
  return {
    id: `summary:${now}:${events.length}:${events[0].id}`, kind: "summary", gameId: null, teams: [], at: now,
    title: `${events.length} updates`, body: `${head}${events.length > 3 ? `; and ${events.length - 3} more` : ""}.`, why: "team",
  };
}

/* ----- persistence: seen-set + notification list, one key, injected storage ----- */

const emptyState = () => ({ v: 1, seen: {}, items: [] });
function prune(s, now) {
  const seen = Object.entries(s.seen).filter(([, at]) => Number.isFinite(at) && now - at < TTL_MS).sort((a, b) => b[1] - a[1]).slice(0, SEEN_CAP);
  const items = s.items.filter((i) => i && typeof i.id === "string" && now - i.at < TTL_MS).sort((a, b) => b.at - a.at).slice(0, ITEM_CAP);
  return { v: 1, seen: Object.fromEntries(seen), items };
}
export function parseState(text, now = Date.now()) {
  let raw = null;
  try { raw = text ? JSON.parse(text) : null; } catch { raw = null; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyState();
  const seen = raw.seen && typeof raw.seen === "object" && !Array.isArray(raw.seen) ? raw.seen : {};
  const items = (Array.isArray(raw.items) ? raw.items : []).filter((i) => i && typeof i === "object" && typeof i.id === "string" && typeof i.title === "string" && Number.isFinite(i.at)).map((i) => ({
    id: i.id.slice(0, 80), kind: String(i.kind ?? "").slice(0, 12), gameId: Number.isFinite(i.gameId) ? i.gameId : null, teams: Array.isArray(i.teams) ? i.teams.filter((t) => typeof t === "string").slice(0, 2) : [],
    title: i.title.slice(0, 200), body: typeof i.body === "string" ? i.body.slice(0, 300) : "", at: i.at, read: i.read === true, why: ["team", "saved", "player"].includes(i.why) ? i.why : "team",
    players: Array.isArray(i.players) ? i.players.filter((p) => p && /^\d{7}$/.test(String(p.id))).slice(0, 3).map((p) => ({ id: Number(p.id), name: String(p.name ?? "").slice(0, 60) })) : [],
  }));
  return prune({ v: 1, seen, items }, now);
}

/** A memory-only storage, used when localStorage is missing or throws. */
export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

/**
 * The alert store. `storage` is a localStorage-like object (shared between tabs in a browser); every call is wrapped so a blocked or full
 * storage falls back to an in-memory copy. `claim()` is the only writer of new items and is guarded by a small lock so that two open tabs
 * seeing the same event cannot both add it: the first tab to take the lock records the id in the seen-set, the other finds it there.
 */
export function createAlertStore(storage, { tab = Math.random().toString(36).slice(2), clock = Date.now } = {}) {
  const mem = memoryStorage();
  let fallback = false;
  const io = {
    get: (k) => { if (!fallback) { try { return storage.getItem(k); } catch { fallback = true; } } return mem.getItem(k); },
    set: (k, v) => { if (!fallback) { try { storage.setItem(k, v); return; } catch { fallback = true; } } mem.setItem(k, v); },
    del: (k) => { try { storage?.removeItem(k); } catch {} mem.removeItem(k); },
  };
  const read = () => parseState(io.get(ALERTS_KEY), clock());
  const write = (s) => io.set(ALERTS_KEY, JSON.stringify(prune(s, clock())));

  function withLock(fn) {
    const now = clock();
    const token = `${tab}:${now}:${Math.random().toString(36).slice(2, 8)}`;
    let held = false;
    try {
      const cur = io.get(LOCK_KEY);
      const [, at] = String(cur ?? "").split(":");
      if (cur && now - Number(at) < 2000 && !cur.startsWith(`${tab}:`)) held = false;
      else { io.set(LOCK_KEY, token); held = io.get(LOCK_KEY) === token; }
    } catch { held = true; }
    if (!held) return null; // another tab is mid-write; it will record these ids, so skipping is safe
    try { return fn(); } finally { try { if (io.get(LOCK_KEY) === token) io.del(LOCK_KEY); } catch {} }
  }

  return {
    state: read,
    items: () => read().items,
    unread: () => read().items.filter((i) => !i.read).length,
    /** Record events not seen before and return only those (plus a summary when there are many). Ids are written even when coalesced. */
    claim(events) {
      if (!events.length) return [];
      return withLock(() => {
        const now = clock();
        const s = read();
        const fresh = events.filter((e) => !(e.id in s.seen));
        if (!fresh.length) return [];
        for (const e of fresh) s.seen[e.id] = now;
        const summary = coalesce(fresh, now);
        const added = summary ? [summary] : fresh.map((e) => ({ ...e, at: now, read: false }));
        s.items = [...added.map((i) => ({ ...i, read: false })), ...s.items];
        write(s);
        return added;
      }) ?? [];
    },
    markAllRead() { const s = read(); if (s.items.some((i) => !i.read)) { s.items = s.items.map((i) => ({ ...i, read: true })); write(s); } },
    /** Remove the list but keep the seen ids, so cleared alerts cannot come back. */
    clearAll() { const s = read(); s.items = []; write(s); },
  };
}
