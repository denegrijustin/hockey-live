// Pure logic for the NHL+ parts of game cards and the Game Center (no React). Everything here is tested in
// tests/nhlplus-cards.test.mjs.
import { gameDataStatus, teamMetrics, matchupDetail, rolling, teamGameLog, goalieMetrics, lineMetrics, periodLength, timelineEnd, chanceFlow } from "../../../lib/nhlplus.mjs";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * What a game card / Game Center shows:
 *   mode: "pregame" | "live" | "intermission" | "final-available" | "final-pending"
 *   season profile is always allowed; game analytics only for "final-available".
 */
export function cardMode(game, gamesPart) {
  const s = gameDataStatus(game, gamesPart);
  if (s === "live") return game?.intermission ? "intermission" : "live";
  return s;
}
export const hasGameAnalytics = (mode) => mode === "final-available";
export const isShootout = (game) => game?.end === "SO" || game?.periodType === "SO";
export const SHOOTOUT_NOTE = "Shootout attempts are not in MoneyPuck's shot data, so they are excluded from every number here. Goals and expected goals cover regulation and overtime only.";
export const PENDING_NOTE = "MoneyPuck game data arrives after the nightly update.";
export const LIVE_NOTE = "MoneyPuck has no live feed. Game analytics arrive after the game, in the nightly update.";

/** Which note (if any) goes with this mode. */
export function modeNote(game, mode) {
  if (mode === "final-pending") return PENDING_NOTE;
  if (mode === "live" || mode === "intermission") return LIVE_NOTE;
  return null;
}

// ---------- Timeline ----------
export const isPlayoff = (game) => game?.type === 3;

/** Game-clock layout: the end second, period spans, 10-minute ticks and OT labels. */
export function timelineLayout(shots, { playoff = false, periods = 3 } = {}) {
  const end = timelineEnd(shots, { playoff, periods });
  const spans = [];
  let start = 0, p = 1;
  while (start < end) {
    const len = periodLength(p, playoff);
    const stop = Math.min(end, start + len);
    spans.push({ period: p, start, end: stop, label: p <= 3 ? `P${p}` : (end > 3600 + periodLength(4, playoff) ? `OT${p - 3}` : "OT") });
    start = stop; p++;
  }
  const ticks = [];
  for (let t = 0; t <= Math.min(3600, end); t += 600) ticks.push({ t, label: t === 0 ? "0" : String(t / 60) });
  return { end, spans, ticks, boundaries: spans.slice(0, -1).map((s) => s.end) };
}

/** Elapsed second of a feed play ("MM:SS" into its period), or null (shootout / unknown). */
export function playSeconds(play, playoff = false) {
  const [m, s] = String(play?.time ?? "").split(":").map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(s) || !play?.period || play.periodType === "SO") return null;
  let start = 0;
  for (let p = 1; p < play.period; p++) start += periodLength(p, playoff);
  return start + m * 60 + s;
}

/** Penalty markers from the NHL feed: [{ t, team, player, text, minutes }]. */
export function penaltyMarkers(plays, playoff = false) {
  return (plays ?? []).filter((p) => p.type === "penalty").map((p) => ({
    t: playSeconds(p, playoff), team: p.team, player: p.player ?? null, text: p.penalty ?? "Penalty", minutes: p.duration ?? null,
  })).filter((p) => p.t != null && p.team).sort((a, b) => a.t - b.t);
}

/** Series for drawing one team's line: step points up to `through`, closed with a point at `through`. */
export function stepSeries(shots, home, away, { through = Infinity, sit = "all", end = Infinity } = {}) {
  const stop = Math.min(through, end);
  const pts = chanceFlow(shots, home, away, { through: stop, sit });
  const last = pts[pts.length - 1];
  const close = Number.isFinite(stop) ? stop : last.t;
  return { points: pts, closeAt: close, last };
}
export const clampThrough = (through, end) => (isNum(through) ? Math.max(0, Math.min(through, end)) : end);

/** Distance to the net (goal line at x = 89 ft) and offset from the centre line. */
export function shotLocation(s) {
  if (!isNum(s?.x) || !isNum(s?.y)) return null;
  return { distance: Math.round(Math.hypot(89 - s.x, s.y)), offset: Math.round(Math.abs(s.y)) };
}
const TYPE_LABEL = { WRIST: "Wrist shot", SLAP: "Slap shot", SNAP: "Snap shot", BACK: "Backhand", TIP: "Tip-in", DEFL: "Deflection", WRAP: "Wraparound" };
export const shotTypeLabel = (t) => (t ? TYPE_LABEL[t] ?? t.charAt(0) + t.slice(1).toLowerCase() : "Shot type unavailable");

// ---------- Pregame summary ----------
const seasonLabel = (id) => `${String(id).slice(0, 4)}–${String(id).slice(6)}`;
export { seasonLabel };

/** Season-profile numbers for a matchup, from the summary part. Missing stays null. */
export function profileFor(summary, away, home) {
  const side = (t) => {
    const m5 = teamMetrics(summary?.teams?.[t]?.["5on5"]);
    const pp = teamMetrics(summary?.teams?.[t]?.["5on4"]);
    const pk = teamMetrics(summary?.teams?.[t]?.["4on5"]);
    const all = teamMetrics(summary?.teams?.[t]?.all);
    return { team: t, gp: all?.gp ?? m5?.gp ?? null, m5, pp, pk, all, ppXG60: pp?.xGF60 ?? null, pkXGA60: pk?.xGA60 ?? null, xGPct: m5?.xGPct ?? null };
  };
  return { away: side(away), home: side(home), detail: matchupDetail(summary, away, home) };
}

/** The starter's MoneyPuck row, joined by NHL player id. Returns { status, name, gsax, gp, toi } with null gsax when unmatched. */
export function starterLine(summary, starter) {
  if (!starter || starter.status === "unknown" || starter.id == null) return { status: "unknown", name: null, id: null, gsax: null, gp: null, toi: null, inRows: false };
  const row = (summary?.goalies ?? []).find((g) => g.id === starter.id);
  const m = row ? goalieMetrics(row.sit?.all) : null;
  return { status: starter.status, name: starter.name ?? row?.name ?? null, id: starter.id, gsax: m?.gsax ?? null, gp: m?.gp ?? null, toi: m?.toi ?? null, gsaxPer60: m?.gsaxPer60 ?? null, svPct: m?.svPct ?? null, xSvPct: m?.xSvPct ?? null, inRows: !!row };
}

/** Last-5 xG% for each team from the games part (derived from shot-level data); null until a team has games. */
export function lastFive(games, team) {
  const log = teamGameLog(games, team, "all");
  const r = rolling(log, 5, { partial: true });
  const last = r[r.length - 1];
  return last ? { n: last.n, xGPct: last.xGPct, xGF: last.xGF, xGA: last.xGA } : { n: 0, xGPct: null, xGF: null, xGA: null };
}

// ---------- Completed game numbers ----------
/** xG, goals and shots for each team in a game, from the games part (all situations). */
export function gameSummary(gameLog, away, home) {
  if (!gameLog) return null;
  const t = (x) => gameLog.teams?.[x]?.all;
  const a = t(away), h = t(home);
  if (!a || !h) return null;
  return { away: { xG: a.xGF, goals: a.GF, sog: a.SOGF }, home: { xG: h.xGF, goals: h.GF, sog: h.SOGF }, overtime: !!gameLog.overtime };
}

// ---------- Lines ----------
/** Top 5-on-5 lines/pairings for a team with a minimum time on ice (seconds), names from the skaters part. */
export function topLines(linesPart, skatersPart, team, { minToi = 300, limit = 3 } = {}) {
  const names = new Map((skatersPart?.skaters ?? []).map((s) => [s.id, s.name]));
  const rows = (linesPart?.lines ?? []).filter((l) => l.team === team && isNum(l.toi) && l.toi >= minToi);
  const pick = (type) => rows.filter((l) => l.type === type).sort((a, b) => b.toi - a.toi).slice(0, limit).map((l) => ({
    id: l.id, type: l.type, players: l.players.map((id) => ({ id, name: names.get(id) ?? null })), metrics: lineMetrics(l), label: l.name,
  }));
  return { lines: pick("line"), pairings: pick("pairing") };
}

// ---------- Colours that read on the dark cards ----------
const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c ?? ""); if (!m) return [123, 225, 198]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** Lightens a team colour until it is visible on a dark background (never darkens). */
export function visibleColor(color, minLum = 0.2) {
  let rgb = hex(color);
  for (let i = 0; i < 12 && lum(rgb) < minLum; i++) rgb = rgb.map((v) => v + (255 - v) * 0.2);
  return toHex(rgb);
}
/** Two line colours that can be told apart: team colours, or the site's mint / amber when the teams look alike. */
export function lineColors(awayColor, homeColor) {
  const a = hex(visibleColor(awayColor)), h = hex(visibleColor(homeColor));
  const dist = Math.hypot(a[0] - h[0], a[1] - h[1], a[2] - h[2]);
  return dist < 90 ? { away: "#7be1c6", home: "#e9c67d" } : { away: toHex(a), home: toHex(h) };
}
export const niceMax = (v) => (v <= 1 ? 1 : v <= 3 ? Math.ceil(v * 2) / 2 : Math.ceil(v));
