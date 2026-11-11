/**
 * Normalized game state (Phase 5, docs/phase5-live-data.md). One pure function says where a game stands, for every card, tile,
 * ticker item, Game Center header and the polling engine. The older helpers (isLive, isFreshLive, isCalledOff, gameStatus)
 * are implemented on top of it.
 *
 * Inputs: a scoreboard row (`/api/live`, season file) or a game feed (`/api/game/:id`); both carry the same fields:
 *   state (FUT|PRE|LIVE|CRIT|OFF|FINAL), scheduleState (OK|PPD|CNCL|SUSP), start, period, periodType (REG|OT|SO),
 *   intermission, clock ("mm:ss"), end (REG|OT|SO, final games on the scoreboard), clockRunning/clockSeconds (feed) or
 *   running/secondsRemaining (raw NHL names).
 * Output phase: scheduled | pregame | live | intermission | overtime | shootout | final | final-ot | final-so | postponed |
 *   suspended | cancelled.
 *
 * Limits (deliberate):
 *  - There is NO "delayed" phase. The NHL feed has no field that says a start is delayed; a game simply stays FUT/PRE past its
 *    scheduled time. We never invent a delay.
 *  - `pregame` means exactly the feed's PRE state.
 *  - `stale` means a LIVE/CRIT game that started more than STALE_LIVE_MS ago (no NHL game lasts that long: stuck data). The
 *    phase is still a live phase; callers decide how to word it. Staleness of a poll (data older than expected) is the poller's
 *    job (src/lib/game-poller.ts), not this function's.
 *  - A final feed (`/api/game`) carries no gameOutcome, so OT/SO finals are recognised from the last period's type; scoreboard
 *    rows use `end`.
 */

/** A live game this long after its puck drop with no word from the feed is stale (no NHL game lasts this long). */
export const STALE_LIVE_MS = 8 * 3600_000;

export const PHASES = Object.freeze([
  "scheduled", "pregame", "live", "intermission", "overtime", "shootout", "final", "final-ot", "final-so", "postponed", "suspended", "cancelled",
]);

const LIVE_PHASES = new Set(["live", "intermission", "overtime", "shootout"]);
const FINAL_PHASES = new Set(["final", "final-ot", "final-so"]);
const LABELS = {
  scheduled: "Scheduled", pregame: "Pregame", live: "Live", intermission: "Intermission", overtime: "Overtime", shootout: "Shootout",
  final: "Final", "final-ot": "Final/OT", "final-so": "Final/SO", postponed: "Postponed", suspended: "Suspended", cancelled: "Canceled",
};

export const isLivePhase = (phase) => LIVE_PHASES.has(phase);
export const isFinalPhase = (phase) => FINAL_PHASES.has(phase);

/** "mm:ss" -> seconds (null when it is not a clock). */
export function clockSeconds(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The bare phase name (cheap: no clock parsing, no allocation). */
export function phaseName(g) {
  const state = g?.state;
  if (state === "OFF" || state === "FINAL") {
    const tail = g.end && g.end !== "REG" ? g.end : g.periodType;
    return tail === "SO" ? "final-so" : tail === "OT" ? "final-ot" : "final";
  }
  if (state === "LIVE" || state === "CRIT") {
    if (g.intermission) return "intermission";
    return g.periodType === "SO" ? "shootout" : g.periodType === "OT" ? "overtime" : "live";
  }
  const sched = String(g?.scheduleState ?? "OK").toUpperCase();
  if (sched === "PPD") return "postponed";
  if (sched === "CNCL") return "cancelled";
  if (sched === "SUSP") return "suspended";
  return state === "PRE" ? "pregame" : "scheduled";
}

/**
 * Where a game stands. `now` only feeds the stale-live rule.
 * -> {phase, label, live, final, clock:{period, periodType, remaining, running, intermission}, stale, reason}
 */
export function phaseOf(g, { now = Date.now() } = {}) {
  const phase = phaseName(g);
  const live = LIVE_PHASES.has(phase);
  const stale = live && !!g.start && now - Date.parse(g.start) > STALE_LIVE_MS;
  const remaining = live ? (g.clockSeconds ?? g.secondsRemaining ?? clockSeconds(g.clock)) : null;
  const running = live ? (g.clockRunning ?? g.running ?? null) : null;
  return {
    phase,
    label: LABELS[phase],
    live,
    final: FINAL_PHASES.has(phase),
    clock: {
      period: g?.period ?? null,
      periodType: g?.periodType ?? null,
      remaining: Number.isFinite(remaining) ? remaining : null,
      running: typeof running === "boolean" ? running : null,
      intermission: phase === "intermission",
    },
    stale,
    reason: stale ? `Live more than ${STALE_LIVE_MS / 3600_000} hours after puck drop` : null,
  };
}

const nameOf = (x) => (typeof x === "string" ? x : x?.phase ?? (x && typeof x === "object" ? phaseName(x) : null));

/**
 * Change between two observations of one game: `{from, to}` when the phase changed, otherwise null. `prev` may be null (first
 * observation: no transition, so nothing announces on first render). Each argument is a phaseOf() result, a game/feed or a phase name.
 */
export function transition(prev, next) {
  const from = nameOf(prev), to = nameOf(next);
  if (!from || !to || from === to) return null;
  return { from, to };
}

const POLL = { live: 15_000, intermission: 30_000, pregameNear: 30_000, scheduled: 60_000, finalRecheck: 180_000 };
export const PREGAME_NEAR_MS = 30 * 60_000;
/** The stale flag is raised after this many expected intervals without fresh data, but never sooner than STALE_MIN_MS. */
export const STALE_FACTOR = 2;
export const STALE_MIN_MS = 45_000;

/**
 * How often to refresh a game (docs/phase5-live-data.md table). `every` 0 = no repeating timer. `recheck`: after the first
 * successful fetch of a finished game, one more fetch this many ms later (late corrections), then stop. `expected` is the interval
 * data should arrive within, or 0 when age says nothing (finished, called off).
 */
export function pollPlan(info, game, { now = Date.now() } = {}) {
  const p = info?.phase ?? phaseName(info);
  if (FINAL_PHASES.has(p)) return { every: 0, recheck: POLL.finalRecheck, expected: 0 };
  if (p === "postponed" || p === "cancelled" || p === "suspended") return { every: 0, recheck: 0, expected: 0 };
  if (p === "live" || p === "overtime" || p === "shootout") return { every: POLL.live, recheck: 0, expected: POLL.live };
  if (p === "intermission") return { every: POLL.intermission, recheck: 0, expected: POLL.intermission };
  const start = Date.parse(game?.start ?? "");
  const near = Number.isFinite(start) && start - now <= PREGAME_NEAR_MS;
  const every = near ? POLL.pregameNear : POLL.scheduled;
  return { every, recheck: 0, expected: every };
}

/** Milliseconds of silence after which data from a poll of `expected` ms is shown as stale; 0 when age is not meaningful. */
export const staleAfter = (expected) => (expected > 0 ? Math.max(STALE_MIN_MS, STALE_FACTOR * expected) : 0);
