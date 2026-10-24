// Where the ice is hot: a heat map of each team's shot attempts, which way the ice is tilting, and who is gaining. Pure, so the card and the tests share it.
//
// Same drawing convention as the shot map (ice-view.mjs): the AWAY team's attempts are plotted at the left net and the HOME team's at the right, whichever end they
// attacked, on the NHL's 200 x 85 foot rink. Unblocked attempts are a pressure proxy, not tracked possession.
import { iceShots, NET_X, HIGH_DANGER_FT } from "./ice-view.mjs";
import { playMinute, pulseMinute } from "./pulse.mjs";

export const COLS = 40, ROWS = 17; // 5-foot cells
const CELL_X = 200 / COLS, CELL_Y = 85 / ROWS;
const SIGMA = 11; // feet: how far one attempt's heat spreads
const WEIGHT = { goal: 4, sog: 1.3, miss: 0.6 };
/** How fast an attempt cools: its heat halves every this many minutes while the game is on. */
export const HALF_LIFE_MIN = 7;

const minuteOf = (game, id) => {
  const p = Array.isArray(game.plays) ? game.plays.find((q) => q.id === id) : null;
  return p ? playMinute(p, game.type) : null;
};

/** The minute the game has reached (live), or null for a finished game, where nothing cools. */
function nowMinute(game) {
  return ["LIVE", "CRIT"].includes(game.state) ? pulseMinute(game) : null;
}

/**
 * A grid of heat for each team. While a game is on, older attempts cool (so the map shows where it is hot NOW); for a finished game every attempt counts the same.
 * @returns {{ cols: number, rows: number, home: Float32Array, away: Float32Array, max: number, shots: number }}
 */
export function heatGrid(game) {
  const shots = iceShots(game);
  const now = nowMinute(game);
  const home = new Float32Array(COLS * ROWS), away = new Float32Array(COLS * ROWS);
  const reach = Math.ceil((SIGMA * 2.5) / CELL_X);
  for (const s of shots) {
    const minute = now != null ? minuteOf(game, s.id) : null;
    const cool = minute == null ? 1 : Math.pow(0.5, Math.max(0, now - minute) / HALF_LIFE_MIN);
    const w = WEIGHT[s.kind] * cool;
    const grid = s.home ? home : away;
    const cx = Math.floor((s.x + 100) / CELL_X), cy = Math.floor((s.y + 42.5) / CELL_Y);
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const gx = cx + dx, gy = cy + dy;
      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue;
      const px = (gx + 0.5) * CELL_X - 100, py = (gy + 0.5) * CELL_Y - 42.5;
      grid[gy * COLS + gx] += w * Math.exp(-((px - s.x) ** 2 + (py - s.y) ** 2) / (2 * SIGMA * SIGMA));
    }
  }
  let max = 0;
  for (const v of home) max = Math.max(max, v);
  for (const v of away) max = Math.max(max, v);
  return { cols: COLS, rows: ROWS, home, away, max, shots: shots.length };
}

/** A plain name for a spot on the ice (x toward the net the team attacked, in feet). */
export function zoneName(x, y) {
  const toNet = Math.hypot(NET_X - Math.abs(x), y);
  if (toNet <= HIGH_DANGER_FT) return "the slot";
  if (Math.abs(x) < 60) return "the point";
  if (Math.abs(y) > 22) return "the circles";
  return "the high slot";
}

/** The hottest spot for each team and what to call it, or null for a team with no heat. */
export function hotZones(grid, game) {
  const best = (cells) => {
    let top = 0, at = -1;
    cells.forEach((v, i) => { if (v > top) { top = v; at = i; } });
    if (at < 0 || top < 0.5) return null;
    const x = ((at % COLS) + 0.5) * CELL_X - 100, y = (Math.floor(at / COLS) + 0.5) * CELL_Y - 42.5;
    return { x, y, heat: top, zone: zoneName(x, y) };
  };
  return { home: best(grid.home), away: best(grid.away), homeId: game.home, awayId: game.away };
}

const attempts = (game, from, to) => {
  const list = (Array.isArray(game.plays) ? game.plays : []).filter((p) => ["goal", "shot-on-goal", "missed-shot"].includes(p.type) && p.periodType !== "SO");
  let home = 0, away = 0;
  for (const p of list) {
    const m = playMinute(p, game.type);
    if (m == null || m <= from || m > to) continue;
    p.team === game.home ? home++ : p.team === game.away && away++;
  }
  return { home, away };
};

/**
 * Which way the ice is tilting and who is gaining. Live: the last ten minutes' share of attempts, and how that share moved against the ten minutes before.
 * Finished: the share over the whole game. Null until there are enough attempts to say anything.
 * @returns {null | { team: string | null, pct: number, share: number, minutes: number | null, gaining: { team: string, points: number } | null, live: boolean }}
 */
export function iceTiltReading(game, minAttempts = 4) {
  const now = nowMinute(game);
  const live = now != null;
  const span = live ? Math.min(10, now) : 65;
  const cur = attempts(game, live ? now - span : -1, live ? now : 999);
  const total = cur.home + cur.away;
  if (total < minAttempts) return null;
  const share = cur.home / total; // the home team's share
  const team = Math.abs(share - 0.5) < 0.05 ? null : share > 0.5 ? game.home : game.away;
  let gaining = null;
  if (live && now >= 12) {
    const before = attempts(game, now - 2 * span, now - span), bt = before.home + before.away;
    if (bt >= minAttempts) {
      const delta = (share - before.home / bt) * 100; // positive: home gaining
      if (Math.abs(delta) >= 8) gaining = { team: delta > 0 ? game.home : game.away, points: Math.round(Math.abs(delta)) };
    }
  }
  return { team, pct: Math.round((team === game.away ? 1 - share : share) * 100), share, minutes: live ? Math.round(span) : null, gaining, live };
}
