// Pure helpers for the player profile. Every function is null-safe: a missing or non-finite input gives null (shown as "—"), never 0 or NaN.
// Game rows use the NHL's own names: gameDate "YYYY-MM-DD", goals, assists, points, shots, toi "mm:ss", savePctg, shotsAgainst, goalsAgainst.

const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Shooting percentage as a ratio: goals / shots (shots must be > 0). Derived. */
export const shootingPct = (goals, shots) => {
  const g = num(goals), s = num(shots);
  return g === null || s === null || s <= 0 ? null : g / s;
};
/** A total per game played: total / gp (gp must be > 0). Derived. */
export const perGame = (total, gp) => {
  const t = num(total), g = num(gp);
  return t === null || g === null || g <= 0 ? null : t / g;
};
/** Save percentage as a ratio: saves / shotsAgainst (shotsAgainst must be > 0). Derived. */
export const savePct = (saves, shotsAgainst) => {
  const s = num(saves), a = num(shotsAgainst);
  return s === null || a === null || a <= 0 || s > a ? null : s / a;
};
/** Goals-against average: goalsAgainst * 3600 / time on ice in seconds (60 minutes = one game). Derived. */
export const gaa = (goalsAgainst, toiSeconds) => {
  const g = num(goalsAgainst), t = num(toiSeconds);
  return g === null || t === null || t <= 0 ? null : (g * 3600) / t;
};
/** "mm:ss" (or "h:mm:ss") to seconds; anything else is null. */
export function parseToi(text) {
  const m = /^(?:(\d+):)?(\d{1,4}):([0-5]\d)$/.exec(String(text ?? "").trim());
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}
/** Seconds to "m:ss" (minutes keep counting past 60, as the NHL's season totals do); null for a missing value. */
export function formatToi(seconds) {
  const s = num(seconds);
  if (s === null || s < 0) return null;
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}
const byDate = (games) => (Array.isArray(games) ? games.filter((g) => g && /^\d{4}-\d{2}-\d{2}/.test(String(g.gameDate))) : []).slice().sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)));
/** The most recent n games, oldest first (the NHL lists newest first; dates decide here). */
export const lastN = (games, n) => (n > 0 ? byDate(games).slice(-n) : []);
function streak(games, hit) {
  let n = 0;
  for (const g of byDate(games).reverse()) {
    if (!(hit(g) >= 1)) break;
    n++;
  }
  return n;
}
/** Consecutive most recent games with at least one point (goals + assists when `points` is missing). */
export const pointStreak = (games) => streak(games, (g) => num(g.points) ?? (num(g.goals) !== null && num(g.assists) !== null ? g.goals + g.assists : null));
/** Consecutive most recent games with at least one goal. */
export const goalStreak = (games) => streak(games, (g) => num(g.goals));
/** A player's share of a team total: player / team (team must be > 0). Derived; the team total is the sum over the same roster file. */
export const teamShare = (player, teamTotal) => {
  const p = num(player), t = num(teamTotal);
  return p === null || t === null || t <= 0 || p > t ? null : p / t;
};
/** Rank of `id` among `items` by `value` (higher is better; ties share the better rank): { rank, of } or null when the player has no value. */
export function rankOn(items, id, value) {
  const rows = (items ?? []).map((i) => ({ id: String(i.id), v: num(value(i)) })).filter((r) => r.v !== null);
  const me = rows.find((r) => r.id === String(id));
  return me ? { rank: 1 + rows.filter((r) => r.v > me.v).length, of: rows.length } : null;
}
/** "Season 2026–27, regular season" for 20262027. */
export const seasonLabel = (season) => (/^\d{8}$/.test(String(season)) ? `Season ${String(season).slice(0, 4)}–${String(season).slice(6)}, regular season` : "Season unavailable");
const dateText = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "Last 5 games played: Nov 3–Nov 7" (fewer games say so: "Last 3 games played"); null when there are none. */
export function rangeLabel(games, n) {
  const g = lastN(games, n);
  if (!g.length) return null;
  const head = `Last ${g.length} ${g.length === 1 ? "game" : "games"} played`;
  return g.length === 1 ? `${head}: ${dateText(g[0].gameDate)}` : `${head}: ${dateText(g[0].gameDate)}–${dateText(g.at(-1).gameDate)}`;
}
/** A ratio as ".911" (save percentage) or "20.4%" (shooting percentage); "—" when missing. */
export const fmtRatio = (v, kind = "pct") => (num(v) === null ? "—" : kind === "sv" ? v.toFixed(3).replace(/^0/, "") : `${(v * 100).toFixed(1)}%`);
/** A plain number or "—". */
export const fmt = (v, digits = 0) => (num(v) === null ? "—" : Number(v).toFixed(digits));
