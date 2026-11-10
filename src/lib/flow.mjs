/**
 * Iceboard metric: SHOT-ATTEMPT PRESSURE ("game flow"). Derived, not official.
 * It is NOT possession, NOT expected goals (xG) and NOT win probability. docs/phase5-momentum.md has the full write-up.
 *
 * Definition
 *   Every shot attempt carries a weight and is credited to the SHOOTING team:
 *     goal 1.00 (counted once; a goal is one event in the feed, never goal + shot)
 *     shot on goal 0.30 · missed shot 0.15 · blocked shot 0.10
 *   Unblocked non-goal attempts with a recorded spot get a distance multiplier 1.0 to 1.6: x1.6 inside the existing
 *   high-danger radius (ice-view `isHighDanger`, 24 ft from the net), fading linearly to x1.0 at 60 ft. Goals and
 *   blocked shots get no multiplier (a blocked shot's spot is where it was blocked). No x/y => no multiplier.
 *   Hits, faceoffs, giveaways, takeaways and penalties are NOT part of the pressure number. Shootout attempts are excluded.
 *   At sample time t, a team's pressure is the sum over its attempts at time te (0 <= t - te < window) of
 *   weight * (1 - (t - te) / window): a rolling window (default 300 s) with linear decay, sampled every `step` seconds (default 10).
 *   Series value = clamp((homePressure - awayPressure) / REF, -1, 1), REF = 1.5 fixed (a sustained one-sided stretch
 *   reaches about +-1; clamping is a display bound). Positive favours the HOME team. Raw home/away pressure and the
 *   unclamped net are kept on every point. Normalisation uses a fixed constant, never the game's own maximum, so
 *   values are comparable across games and do not rescale as the game goes on.
 *
 * Strength (power plays)
 *   Bands come from the feed's NHL situationCode "ABCD" = away goalie, away skaters, home skaters, home goalie
 *   (ice-time-independent: only digits are read). Goalie digit 0 means the net is empty: that team's extra attacker is
 *   not counted as a skater. A power play is shown only when both sides have >= 3 skaters and the counts differ
 *   ("1541" => away 5 v home 4 => AWAY power play; "1551" and empty-net 5v5 are even; anything unparseable => no band).
 *   The code is only present on plays, so a band runs from its first play (back-dated to a matching penalty when one
 *   happened since the previous play) to the first play showing a different state, and is capped by the minutes of the
 *   penalties inside it when their durations are known. Edges are accurate to the nearest recorded event, not the second.
 *   Penalties are markers (team penalised, minutes, infraction), never part of the pressure number. Without `sit`: no band.
 *
 * Time
 *   Game seconds elapsed: periods 1-3 are 1200 s; overtime periods are 300 s in the regular season (game type 2) and
 *   1200 s in the playoffs (type 3). Intermissions take no time on the axis. Plays with a malformed time or a clock past
 *   the period length are dropped (counted in `dropped`). Plays without a time never enter a series.
 *
 * Incremental API: createFlow(opts) -> { push(plays), series(), reset() }. push is append-friendly: attempts that arrive
 * in order feed a running window (sums A = sum w, B = sum w*te with expiring events, O(1) amortised per sample) and
 * only new samples are computed; plays are de-duplicated by `id` (an identical repeat is ignored, a changed one, or an
 * out-of-order one, triggers a full rebuild from the stored plays). Samples strictly before the newest play time are
 * final; the tail up to the newest play (and `until`) is computed per call without mutating state.
 * Missing data: no plays with a usable time => series() is null; never NaN.
 */
import { isHighDanger } from "./ice-view.mjs";

export const FLOW_WEIGHTS = { goal: 1, "shot-on-goal": 0.3, "missed-shot": 0.15, "blocked-shot": 0.1 };
export const FLOW_REF = 1.5;
export const FLOW_WINDOW_SEC = 300;
export const FLOW_STEP_SEC = 10;
export const DANGER_MAX = 1.6;
const NET_X = 89;
const FAR_FT = 60;
const REG_SEC = 1200;

/** Seconds in one overtime period for a game type (2 regular season, 3 playoffs). */
export const otSeconds = (gameType) => (Number(gameType) === 3 ? 1200 : 300);
const periodLen = (p, gameType) => (p <= 3 ? REG_SEC : otSeconds(gameType));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Game second at which period `p` starts. */
export function periodStart(p, gameType = 2) {
  return p <= 3 ? (p - 1) * REG_SEC : 3 * REG_SEC + (p - 4) * otSeconds(gameType);
}
export function periodLabel(p) {
  if (p <= 3) return p === 1 ? "1st" : p === 2 ? "2nd" : "3rd";
  const k = p - 3;
  return k === 1 ? "OT" : `${k}OT`;
}
/** Elapsed game seconds of a play, or null (shootout, no/invalid time or period). */
export function playSecond(play, gameType = 2) {
  const p = play?.period;
  if (!Number.isInteger(p) || p < 1 || play.periodType === "SO") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(play.time ?? "");
  if (!m) return null;
  const inPeriod = Number(m[1]) * 60 + Number(m[2]);
  if (inPeriod > periodLen(p, gameType)) return null;
  return periodStart(p, gameType) + inPeriod;
}
/** "P2 08:20" for a game second. A boundary second belongs to the period that starts there, unless `endOfPeriod` (the latest data point) asks for the one that ends there. */
export function clockAt(t, gameType = 2, endOfPeriod = false) {
  let p = 1;
  while (p < 12 && (endOfPeriod ? t > periodStart(p + 1, gameType) : t >= periodStart(p + 1, gameType))) p++;
  const inP = Math.max(0, t - periodStart(p, gameType));
  const mm = Math.floor(inP / 60), ss = Math.floor(inP % 60);
  return `${p <= 3 ? `P${p}` : p === 4 ? "OT" : `${p - 3}OT`} ${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Decode an NHL situationCode ("ABCD"). Returns null when it is not four digits. */
export function decodeSit(code) {
  if (typeof code !== "string" || !/^\d{4}$/.test(code)) return null;
  const [ag, as, hs, hg] = code.split("").map(Number);
  const aEff = as - (ag === 0 ? 1 : 0), hEff = hs - (hg === 0 ? 1 : 0);
  let state = "even";
  if (aEff >= 3 && hEff >= 3 && aEff !== hEff) state = aEff > hEff ? "away-pp" : "home-pp";
  else if (aEff < 3 || hEff < 3 || aEff < 0 || hEff < 0) state = "other";
  return {
    awaySkaters: as, homeSkaters: hs, awayNetEmpty: ag === 0, homeNetEmpty: hg === 0, state,
    strength: state === "away-pp" ? `${aEff}v${hEff}` : state === "home-pp" ? `${hEff}v${aEff}` : null,
  };
}

/** Distance multiplier for an unblocked attempt at (x, y), 1.0 to 1.6 (1 when the spot is unknown). */
export function dangerMultiplier(x, y) {
  if (num(x) == null || num(y) == null) return 1;
  if (isHighDanger(x, y)) return DANGER_MAX;
  const d = Math.hypot(NET_X - Math.abs(x), y);
  return 1 + (DANGER_MAX - 1) * clamp((FAR_FT - d) / (FAR_FT - 24), 0, 1);
}

/** The weighted attempt a play contributes, or null. `teamOf(play)` resolves the shooting team. */
function attemptOf(play, t, ctx) {
  const base = FLOW_WEIGHTS[play.type];
  if (base == null) return null;
  const team = ctx.teamOf(play);
  if (team !== ctx.home && team !== ctx.away) return null;
  const mult = ctx.danger && (play.type === "shot-on-goal" || play.type === "missed-shot") ? dangerMultiplier(play.x, play.y) : 1;
  return { t, team, type: play.type, w: base * mult, order: play.order ?? 0 };
}

const emptyAcc = () => ({ w: 0, att: 0, goals: 0, sog: 0, missed: 0, blocked: 0 });
const bump = (acc, a) => {
  acc.w += a.w; acc.att++;
  if (a.type === "goal") acc.goals++; else if (a.type === "shot-on-goal") acc.sog++; else if (a.type === "missed-shot") acc.missed++; else acc.blocked++;
};
const round = (v, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

/** Incremental pressure engine. See the file header. */
export function createFlow(opts = {}) {
  const o = { home: opts.home, away: opts.away, gameType: opts.gameType ?? 2, step: opts.step ?? FLOW_STEP_SEC, window: opts.windowSec ?? FLOW_WINDOW_SEC, danger: opts.danger !== false, until: opts.until ?? null };
  const rosterTeam = new Map((opts.roster ?? []).filter((r) => r?.id != null).map((r) => [r.id, r.team]));
  // The feed's event owner of a blocked shot is the SHOOTING team (checked on the recorded game); the roster, when given, wins.
  const teamOf = (p) => { const rt = p.pid != null ? rosterTeam.get(p.pid) : null; return rt === o.home || rt === o.away ? rt : p.team; };
  const ctx = { home: o.home, away: o.away, danger: o.danger, teamOf };

  let stored, seen, st, version, cache, dirty, anon;
  const fresh = () => {
    stored = []; seen = new Map(); anon = 0;
    st = {
      events: [], addPtr: 0, remPtr: 0, A: { h: 0, a: 0 }, B: { h: 0, a: 0 }, committed: [], nextGrid: 0,
      tEnd: null, lastOrder: -Infinity, lastT: -Infinity, dropped: 0, maxPeriod: 0, hasSit: false,
      goals: [], penalties: [], bands: [], cur: null, prevSitT: null, totals: { home: emptyAcc(), away: emptyAcc() }, byPeriod: new Map(), danger: 0,
    };
    version = 0; cache = null; dirty = false;
  };
  fresh();

  function closeBand(end, basis) {
    const b = st.cur; if (!b) return;
    b.end = end; b.endBasis = basis; b.open = false; st.bands.push(b); st.cur = null;
  }
  function ingest(play) {
    const t = playSecond(play, o.gameType);
    if (t == null) { if (play.periodType !== "SO") st.dropped++; return; }
    st.lastOrder = Math.max(st.lastOrder, play.order ?? 0);
    st.tEnd = st.tEnd == null ? t : Math.max(st.tEnd, t);
    st.lastT = Math.max(st.lastT, t);
    st.maxPeriod = Math.max(st.maxPeriod, play.period);
    const a = attemptOf(play, t, ctx);
    if (a) {
      st.events.push(a);
      const side = a.team === o.home ? "home" : "away";
      bump(st.totals[side], a);
      let per = st.byPeriod.get(play.period); if (!per) st.byPeriod.set(play.period, (per = { home: emptyAcc(), away: emptyAcc() }));
      bump(per[side], a);
      if (a.w > FLOW_WEIGHTS[a.type] + 1e-9) st.danger++;
    }
    if (play.type === "goal" && (play.team === o.home || play.team === o.away)) {
      st.goals.push({ id: play.id ?? null, t, period: play.period, clock: play.time, team: play.team, player: play.player ?? null, score: play.score ?? null, sit: decodeSit(play.sit)?.state ?? null });
    }
    if (play.type === "penalty" && (play.team === o.home || play.team === o.away)) {
      st.penalties.push({ id: play.id ?? null, t, period: play.period, clock: play.time, team: play.team, minutes: num(play.duration), infraction: play.penalty ?? null });
    }
    const sit = decodeSit(play.sit);
    if (sit) {
      st.hasSit = true;
      const key = sit.state === "home-pp" ? `${o.home}|${sit.strength}` : sit.state === "away-pp" ? `${o.away}|${sit.strength}` : null;
      if (st.cur && st.cur.key !== key) closeBand(t, "next-event");
      if (key && !st.cur) {
        const adv = sit.state === "home-pp" ? o.home : o.away, short = adv === o.home ? o.away : o.home;
        const lo = st.prevSitT ?? -Infinity;
        const pen = st.penalties.filter((p) => p.team === short && p.t >= lo && p.t <= t).map((p) => p.t);
        st.cur = { key, team: adv, against: short, strength: sit.strength, start: pen.length ? Math.min(...pen) : t, end: t, endBasis: "open", open: true };
      }
      st.prevSitT = t;
    }
  }

  function snapshotWindow() { return { addPtr: st.addPtr, remPtr: st.remPtr, A: { ...st.A }, B: { ...st.B } }; }
  function sampleAt(t, w) {
    const ev = st.events;
    while (w.addPtr < ev.length && ev[w.addPtr].t <= t) { const e = ev[w.addPtr++]; const k = e.team === o.home ? "h" : "a"; w.A[k] += e.w; w.B[k] += e.w * e.t; }
    while (w.remPtr < w.addPtr && ev[w.remPtr].t <= t - o.window) { const e = ev[w.remPtr++]; const k = e.team === o.home ? "h" : "a"; w.A[k] -= e.w; w.B[k] -= e.w * e.t; }
    const f = (k) => Math.max(0, w.A[k] - (t * w.A[k] - w.B[k]) / o.window);
    const home = f("h"), away = f("a"), net = home - away;
    return { t, home: round(home), away: round(away), net: round(net), value: round(clamp(net / FLOW_REF, -1, 1)) };
  }

  function rebuild() {
    const list = stored.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (playSecond(a, o.gameType) ?? 0) - (playSecond(b, o.gameType) ?? 0));
    const keep = stored, keepSeen = seen, keepAnon = anon; fresh(); stored = keep; seen = keepSeen; anon = keepAnon;
    for (const p of list) ingest(p);
    // attempts must be time-sorted for the window pointers even if the feed order disagrees
    st.events.sort((x, y) => x.t - y.t || x.order - y.order);
    st.lastT = st.events.at(-1)?.t ?? st.lastT;
  }
  function advance() {
    if (st.tEnd == null) return;
    const w = { addPtr: st.addPtr, remPtr: st.remPtr, A: st.A, B: st.B }; // mutate the committed state
    while (st.nextGrid < st.tEnd) { st.committed.push(sampleAt(st.nextGrid, w)); st.nextGrid += o.step; }
    st.addPtr = w.addPtr; st.remPtr = w.remPtr;
  }

  function push(plays) {
    if (!Array.isArray(plays)) return api;
    let changed = false;
    for (const p of plays) {
      if (!p || typeof p !== "object") continue;
      const key = p.id != null ? `id:${p.id}` : `anon:${anon++}`;
      const sig = JSON.stringify([p.type, p.period, p.time, p.team, p.x, p.y, p.sit, p.order, p.pid, p.duration, p.score]);
      if (seen.has(key)) { if (seen.get(key) === sig) continue; dirty = true; seen.set(key, sig); const i = stored.findIndex((s) => s.id === p.id); if (i >= 0) stored[i] = p; changed = true; continue; }
      seen.set(key, sig); stored.push(p); changed = true;
      const t = playSecond(p, o.gameType);
      if (dirty) continue;
      if (t != null && (t < st.lastT || (p.order ?? 0) < st.lastOrder)) { dirty = true; continue; }
      ingest(p);
    }
    if (changed) { version++; cache = null; }
    return api;
  }

  function periodsOf(end) {
    const last = Math.max(3, st.maxPeriod);
    const out = [];
    for (let p = 1; p <= last; p++) out.push({ period: p, label: periodLabel(p), start: periodStart(p, o.gameType), end: periodStart(p, o.gameType) + periodLen(p, o.gameType), seen: p <= st.maxPeriod });
    return out;
  }

  function series() {
    if (dirty) { rebuild(); dirty = false; cache = null; }
    if (cache && cache.version === version) return cache.value;
    if (st.tEnd == null) { cache = { version, value: null }; return null; }
    advance();
    const end = Math.max(st.tEnd, o.until ?? 0);
    const points = st.committed.slice();
    const w = snapshotWindow();
    // the committed pointers already sit past nextGrid - step; resample the tail from them without mutating state
    for (let t = st.nextGrid; t < end; t += o.step) points.push(sampleAt(t, w));
    if (!points.length || points.at(-1).t < end) points.push(sampleAt(end, w));
    const periods = periodsOf(end);
    const bands = st.bands.slice();
    if (st.cur) bands.push({ ...st.cur, end: end, endBasis: "open", open: true });
    const minutesIn = (b) => {
      const pens = st.penalties.filter((p) => p.team === b.against && p.t >= b.start && p.t <= b.end);
      if (!pens.length || pens.some((p) => p.minutes == null)) return null;
      return pens.reduce((s, p) => s + p.minutes, 0) * 60;
    };
    const outBands = bands.map((b) => {
      const cap = minutesIn(b);
      const end2 = cap != null && b.start + cap < b.end ? b.start + cap : b.end;
      return { team: b.team, against: b.against, strength: b.strength, start: b.start, end: end2, endBasis: end2 !== b.end ? "penalty-minutes" : b.endBasis, open: b.open && end2 === b.end };
    }).filter((b) => b.end > b.start);
    const perPeriod = periods.filter((p) => p.seen).map((p) => {
      const acc = st.byPeriod.get(p.period) ?? { home: emptyAcc(), away: emptyAcc() };
      const diff = acc.home.w - acc.away.w, tot = acc.home.w + acc.away.w;
      const leader = tot === 0 || Math.abs(diff) < Math.max(0.15, 0.1 * tot) ? null : diff > 0 ? o.home : o.away;
      return { period: p.period, label: p.label, home: { ...acc.home, w: round(acc.home.w, 3) }, away: { ...acc.away, w: round(acc.away.w, 3) }, leader };
    });
    const value = {
      home: o.home, away: o.away, gameType: o.gameType, step: o.step, windowSec: o.window, ref: FLOW_REF, weights: FLOW_WEIGHTS,
      elapsed: end, duration: Math.max(periods.at(-1).end, end), points, periods, perPeriod,
      goals: st.goals.slice(), penalties: st.penalties.slice(), bands: outBands, hasSit: st.hasSit,
      totals: { home: { ...st.totals.home, w: round(st.totals.home.w, 3) }, away: { ...st.totals.away, w: round(st.totals.away.w, 3) } },
      latest: points.at(-1), dropped: st.dropped, dangerAdjusted: st.danger, usedDanger: o.danger,
    };
    cache = { version, value };
    return value;
  }
  function reset() { fresh(); return api; }
  const api = { push, series, reset };
  return api;
}

/** One-shot compute over a whole play list (optionally only plays up to game second `through`; the series then runs to `until`). */
export function computeFlow(plays, opts = {}) {
  const f = createFlow(opts);
  const list = Array.isArray(plays) ? plays : [];
  f.push(opts.through != null ? list.filter((p) => { const t = playSecond(p, opts.gameType ?? 2); return t != null && t <= opts.through; }) : list);
  return f.series();
}

/** Value at game second t (nearest sample at or before it), or null. */
export function pointAt(series, t) {
  if (!series?.points?.length) return null;
  const pts = series.points;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid].t <= t) lo = mid; else hi = mid - 1; }
  return pts[lo];
}

/** "P2 08:20 — EDM +0.42 pressure" (team code, or "even"). Computed only from the point. */
export function readoutText(series, point) {
  if (!series || !point) return "";
  const v = point.value;
  const who = Math.abs(v) < 0.05 ? null : v > 0 ? series.home : series.away;
  return `${clockAt(point.t, series.gameType, point.t === series.elapsed)} — ${who ? `${who} +${Math.abs(v).toFixed(2)} pressure` : "even pressure (0.00)"}`;
}

const fmtMmSs = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/** Plain-language alternative for the chart, generated only from the series. */
export function describeFlow(series) {
  if (!series) return "No play-by-play yet.";
  const parts = [];
  const per = series.perPeriod.filter((p) => p.home.att + p.away.att > 0);
  if (per.length) {
    const phr = per.map((p, i) => {
      const who = p.leader;
      if (i === 0) return who ? `${who} led the shot-attempt pressure in the ${p.label}` : `Shot-attempt pressure was even in the ${p.label}`;
      return who ? `${who} in the ${p.label}` : `even in the ${p.label}`;
    });
    parts.push(`${phr.join("; ")}.`);
  } else parts.push("No shot attempts recorded yet.");
  if (series.goals.length) {
    parts.push(`Goals: ${series.goals.map((g) => `${periodLabel(g.period)} ${g.clock.replace(/^0/, "")} ${g.team}${g.score ? ` (${series.away} ${g.score.away}, ${series.home} ${g.score.home})` : ""}`).join(", ")}.`);
  } else parts.push("No goals yet.");
  if (series.bands.length) {
    parts.push(`Power plays: ${series.bands.map((b) => `${b.team} ${b.strength} from ${clockAt(b.start, series.gameType).replace(/^P(\d)/, (_, d) => `${periodLabel(Number(d))}`)} for about ${fmtMmSs(b.end - b.start)}`).join(", ")}.`);
  } else if (series.hasSit) parts.push("No power-play time recorded.");
  const l = series.latest;
  if (l) parts.push(`Latest: ${readoutText(series, l)}.`);
  return parts.join(" ");
}
