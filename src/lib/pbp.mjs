/**
 * Play-by-play helpers (Phase 5, Game Center). Pure, no DOM. Every function tolerates missing time/order/team/type.
 *
 * Definitions (all Official = read from the NHL feed unless marked Derived):
 *  - eventLabel(play): a human description built from typeDescKey (`type`), the penalty descKey (`penalty`), `shotType`, `reason`.
 *    Unknown types are shown as their humanised raw key (never dropped, never invented).
 *  - strengthLabel(sit, side): decodes the NHL situationCode "ABCD" = away goalie (1 in net, 0 pulled), away skaters,
 *    home skaters, home goalie. Both goalies in and equal skaters -> "5v5"/"4v4"/"3v3". Unequal skaters, `side` ("home"|"away")
 *    is the team of the event: more skaters than the opponent -> "Power play 5v4", fewer -> "Penalty kill 4v5".
 *    A pulled goalie (digit 0) -> "Empty net" (with skater counts). Anything else (bad length, non-digits, skater counts outside
 *    1-6, unequal skaters with no side) -> null: only what the code says. The situation is the one in force when the event
 *    happened, so a penalty is labelled with the strength BEFORE it, and a power-play goal with the strength it was scored at.
 *  - Goal numbering: the feed's `score` after a goal is Official. If absent the running count of goals in event order is Derived
 *    (shootout goals are not counted, voided goals are skipped) and flagged `derived: true`; it needs every goal to be present.
 *  - Order: events sort by `order` (NHL sortOrder, not eventId); missing order sorts last within its period.
 */
const GROUPS = [
  { key: "goals", label: "Goals" },
  { key: "shots", label: "Shots" },
  { key: "penalties", label: "Penalties" },
  { key: "hits", label: "Hits" },
  { key: "blocks", label: "Blocks" },
  { key: "faceoffs", label: "Faceoffs" },
  { key: "turnovers", label: "Giveaways/Takeaways" },
  { key: "stoppages", label: "Stoppages" },
  { key: "other", label: "Other" },
];
export const FILTER_GROUPS = GROUPS;
const GROUP_OF = {
  goal: "goals", "shot-on-goal": "shots", "missed-shot": "shots", "failed-shot-attempt": "shots", penalty: "penalties", hit: "hits",
  "blocked-shot": "blocks", faceoff: "faceoffs", giveaway: "turnovers", takeaway: "turnovers", stoppage: "stoppages",
};
export const groupOf = (p) => GROUP_OF[p?.type] ?? "other";

/** "delaying-game-puck-over-glass" / "wristShot" / "tv_timeout" -> "Delaying game puck over glass". */
export function humanize(key) {
  if (key == null || key === "") return "";
  const s = String(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const lower = (k) => humanize(k).toLowerCase();

/** Human description of an event, without player names (the UI adds those as links). */
export function eventLabel(p) {
  const t = p?.type;
  if (!t) return "Event";
  if (p.periodType === "SO") {
    if (t === "goal") return "Shootout goal";
    if (t === "shot-on-goal") return "Shootout attempt saved";
    if (t === "missed-shot") return "Shootout attempt missed";
  }
  switch (t) {
    case "goal": return p.shotType ? `${humanize(p.shotType)} goal` : "Goal";
    case "shot-on-goal": return p.shotType ? `${humanize(p.shotType)} on goal` : "Shot on goal";
    case "missed-shot": return `${p.shotType ? `${humanize(p.shotType)} shot` : "Shot"} ${p.reason ? `missed (${lower(p.reason)})` : "missed"}`;
    case "blocked-shot": return "Blocked shot";
    case "failed-shot-attempt": return "Failed shot attempt";
    case "penalty": {
      const d = p.penalty ? humanize(p.penalty) : "Penalty";
      return p.duration ? `${d} (${p.duration} min)` : d;
    }
    case "hit": return "Hit";
    case "faceoff": return "Faceoff";
    case "giveaway": return "Giveaway";
    case "takeaway": return "Takeaway";
    case "stoppage": return p.reason ? `Stoppage: ${lower(p.reason)}` : "Stoppage";
    case "period-start": return "Period start";
    case "period-end": return "Period end";
    case "game-end": return "Game end";
    case "shootout-complete": return "Shootout complete";
    case "delayed-penalty": return "Delayed penalty";
    default: return humanize(t);
  }
}

/** Importance tier: goals high, penalties medium, shots/saves/blocks routine, faceoffs/stoppages/hits/turnovers/other low. */
export function importance(p) {
  const g = groupOf(p);
  if (g === "goals") return "high";
  if (g === "penalties") return "medium";
  if (g === "shots" || g === "blocks") return "routine";
  return "low";
}

/**
 * Decode an NHL situationCode for a side ("home"|"away"|null). Returns {label, kind, away, home} or null.
 * @param {any} sit
 * @param {"home"|"away"|null} [side]
 */
export function strengthLabel(sit, side = null) {
  if (typeof sit !== "string" || !/^\d{4}$/.test(sit)) return null;
  const [ag, as, hs, hg] = sit.split("").map(Number);
  if (as < 1 || as > 6 || hs < 1 || hs > 6 || ag > 1 || hg > 1) return null;
  const base = { away: as, home: hs };
  if (ag === 0 || hg === 0) return { label: `${ag === 0 && hg === 0 ? "Both nets empty" : "Empty net"} ${as}v${hs}`, kind: "empty-net", ...base };
  if (as === hs) return as >= 3 && as <= 5 ? { label: `${as}v${as}`, kind: "even", ...base } : null;
  if (side !== "home" && side !== "away") return null;
  const mine = side === "home" ? hs : as, theirs = side === "home" ? as : hs;
  return mine > theirs
    ? { label: `Power play ${mine}v${theirs}`, kind: "power-play", ...base }
    : { label: `Penalty kill ${mine}v${theirs}`, kind: "penalty-kill", ...base };
}

export const sideOf = (p, game) => (!p?.team || !game ? null : p.team === game.home ? "home" : p.team === game.away ? "away" : null);

const num = (v) => (Number.isFinite(v) ? v : Infinity);
const secs = (t) => { const m = /^(\d+):(\d{2})$/.exec(t ?? ""); return m ? +m[1] * 60 + +m[2] : Infinity; };
const per = (p) => (Number.isFinite(p?.period) ? p.period : Infinity);
const cmp = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
/** Chronological order: period, then `order`, then clock time. Missing values sort last. Does not mutate. */
export function sortPlays(plays) {
  return [...(plays ?? [])].sort((a, b) => cmp(per(a), per(b)) || cmp(num(a.order), num(b.order)) || cmp(secs(a.time), secs(b.time)));
}

const ord = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
/** Label for a period: {key, label, short}. REG 1-3 "1st period", OT "Overtime"/"2nd overtime", SO "Shootout". */
export function periodInfo(period, periodType, regPeriods = 3) {
  if (periodType === "SO") return { key: `SO:${period ?? ""}`, label: "Shootout", short: "SO" };
  if (periodType === "OT" || (Number.isFinite(period) && period > regPeriods && periodType !== "REG")) {
    const n = Number.isFinite(period) ? period - regPeriods : 1;
    return { key: `OT:${period}`, label: n <= 1 ? "Overtime" : `${ord(n)} overtime`, short: n <= 1 ? "OT" : `${n}OT` };
  }
  if (!Number.isFinite(period)) return { key: "unknown", label: "Other events", short: "?" };
  return { key: `REG:${period}`, label: `${ord(period)} period`, short: `P${period}` };
}

/** Groups already-sorted plays by period: [{key,label,short,period,periodType,plays}]. */
export function groupByPeriod(plays) {
  const out = [], idx = new Map();
  for (const p of plays ?? []) {
    const info = periodInfo(p.period, p.periodType);
    let g = idx.get(info.key);
    if (!g) { g = { ...info, period: p.period ?? null, periodType: p.periodType ?? null, plays: [] }; idx.set(info.key, g); out.push(g); }
    g.plays.push(p);
  }
  return out;
}
/** Period navigation list: [{key,label,short,count,firstId}] over the given (filtered) plays. */
export const periodList = (plays) => groupByPeriod(plays).map((g) => ({ key: g.key, label: g.label, short: g.short, count: g.plays.length, firstId: g.plays[0]?.id ?? null }));

/**
 * Filter by type groups (empty/absent = all) and team ("all" | abbreviation | "neutral" for events with no team).
 * @param {any[] | null | undefined} plays
 * @param {{groups?: string[] | Set<string>, team?: string}} [opts]
 */
export function applyFilters(plays, { groups, team = "all" } = {}) {
  const set = groups && (groups.size ?? groups.length) ? new Set(groups) : null;
  return (plays ?? []).filter((p) => (!set || set.has(groupOf(p))) && (team === "all" || (team === "neutral" ? !p.team : p.team === team)));
}

/** @param {any[] | undefined | null} list */
const idsOf = (list) => new Set((list ?? []).map((x) => (x && typeof x === "object" ? x.id ?? x.eventId : x)).filter((x) => x != null));
/** Normalise the optional event-store fields `voided` / `changed` (arrays of ids or play objects, or undefined) to id sets. */
export const eventFlags = (voided, changed) => ({ voided: idsOf(voided), changed: idsOf(changed) });
/** Voided goals that are no longer in `plays` (given as objects) are merged back in, in order, so the disallowed goal stays visible. */
export function mergeVoided(plays, voided) {
  const have = new Set((plays ?? []).map((p) => p.id));
  const extra = (voided ?? []).filter((v) => v && typeof v === "object" && v.type && !have.has(v.id ?? v.eventId)).map((v) => ({ ...v, id: v.id ?? v.eventId }));
  return extra.length ? sortPlays([...(plays ?? []), ...extra]) : (plays ?? []);
}

/**
 * Goals in order with numbering and score after: [{id, n, team, side, score:{home,away}|null, derived, voided, play}].
 * `score` comes from play.score (Official); otherwise a running count by team side (Derived, flagged). Shootout goals have no score.
 * `voided` (Set of ids) goals are listed (n=null) but do not count.
 */
export function goalList(plays, game, { voided } = {}) {
  const run = { home: 0, away: 0 };
  let n = 0;
  const out = [];
  for (const p of plays ?? []) {
    if (p.type !== "goal") continue;
    const side = sideOf(p, game);
    if (voided?.has?.(p.id)) { out.push({ id: p.id, n: null, team: p.team ?? null, side, score: null, derived: false, voided: true, play: p }); continue; }
    n += 1;
    let score = null, derived = false;
    if (p.score && Number.isFinite(p.score.home) && Number.isFinite(p.score.away)) { score = { home: p.score.home, away: p.score.away }; run.home = score.home; run.away = score.away; }
    else if (side && p.periodType !== "SO") { run[side] += 1; score = { home: run.home, away: run.away }; derived = true; }
    out.push({ id: p.id, n, team: p.team ?? null, side, score, derived, voided: false, play: p });
  }
  return out;
}

/** Goal ids in order. */
/** @param {any[] | null | undefined} plays */
export const goalIds = (plays) => (plays ?? []).filter((p) => p.type === "goal").map((p) => p.id);
/**
 * The next (dir 1) or previous (dir -1) goal id relative to `fromId` (an event id, or null = from the start), wrapping around; null if no goals.
 * @param {any[] | null | undefined} plays
 * @param {number | null} [fromId]
 * @param {number} [dir]
 * @returns {number | null}
 */
export function jumpToGoals(plays, fromId = null, dir = 1) {
  const list = plays ?? [];
  const goals = list.map((p, i) => [p, i]).filter(([p]) => p.type === "goal");
  if (!goals.length) return null;
  const first = goals[0][0].id, last = goals[goals.length - 1][0].id;
  const at = fromId == null ? -1 : list.findIndex((p) => p.id === fromId);
  if (at < 0) return dir < 0 ? last : first;
  const hit = dir < 0 ? [...goals].reverse().find(([, i]) => i < at) : goals.find(([, i]) => i > at);
  return hit ? hit[0].id : dir < 0 ? last : first;
}

/** Default direction: newest first while a game is live (the latest is on top), chronological for finals and everything else. */
export const defaultNewestFirst = (live) => !!live;

/** Cheap change signature for memoisation: length, last order/id, and goal detail (assists/score) so corrections re-render. */
export function playsSignature(plays) {
  const l = plays ?? [], last = l[l.length - 1];
  let g = "";
  for (const p of l) if (p.type === "goal") g += `${p.id}:${p.score ? `${p.score.home}-${p.score.away}` : ""}:${(p.assists ?? []).map((a) => a.id).join(".")}:${p.pid ?? ""};`;
  return `${l.length}|${last?.order ?? ""}|${last?.id ?? ""}|${g}`;
}
/** Penalty minutes label ("2 min") or null. */
export const penaltyMinutes = (p) => (p?.type === "penalty" && Number.isFinite(p.duration) ? `${p.duration} min` : null);
