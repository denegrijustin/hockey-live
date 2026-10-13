// Pure helpers for the NHL+ views: sorting, filtering, scales and short factual sentences. No React, no network.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Sort rows by a key. Missing values always go last, whichever way the column is sorted. Ties keep their order. */
export function sortRows(rows, key, dir = "desc", get = (r, k) => r[k]) {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => [r, i])
    .sort(([a, i], [b, j]) => {
      const x = get(a, key), y = get(b, key);
      const xm = x == null || (typeof x === "number" && !isNum(x)), ym = y == null || (typeof y === "number" && !isNum(y));
      if (xm || ym) return xm && ym ? i - j : xm ? 1 : -1;
      const c = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y)) : x - y;
      return c ? c * sign : i - j;
    })
    .map(([r]) => r);
}

/** Next sort state when a column header is pressed: same column flips, a new column starts in its natural direction. */
export function nextSort(current, key, firstDir = "desc") {
  if (current?.key === key) return { key, dir: current.dir === "desc" ? "asc" : "desc" };
  return { key, dir: firstDir };
}

/** Keep rows with at least `minSeconds` of time on ice. Rows with no time recorded are dropped once a minimum is set. */
export function filterMinToi(rows, minSeconds, get = (r) => r.toi) {
  if (!minSeconds) return rows;
  return rows.filter((r) => { const t = get(r); return isNum(t) && t >= minSeconds; });
}

/** Case-insensitive, accent-insensitive "contains" over several fields. */
export function matches(query, ...fields) {
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(query).trim();
  return !q || fields.some((f) => norm(f).includes(q));
}

/** "Nice" tick values covering [min, max] with roughly `count` steps. */
export function niceTicks(min, max, count = 5) {
  if (!isNum(min) || !isNum(max)) return [];
  if (min === max) return [min];
  const span = max - min, raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push((Math.round(v / step) * step) || 0);
  return out;
}

export function linearScale(d0, d1, r0, r1) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/** [min, max] of the finite values, padded by a fraction of the span; null when there are none. */
export function paddedExtent(values, pad = 0.08, { includeZero = false } = {}) {
  const v = values.filter(isNum);
  if (!v.length) return null;
  let lo = Math.min(...v), hi = Math.max(...v);
  if (includeZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const span = hi - lo || Math.abs(hi) || 1;
  return [lo - span * pad, hi + span * pad];
}

/** What a manual refresh did, in one short sentence. */
export function refreshMessage(result, error) {
  if (result === "updated") return "Updated";
  if (result === "unchanged" || result === "recent") return "No new data from MoneyPuck";
  if (result === "running") return "Refresh already running";
  if (result === "failed" || error) return `Refresh failed${error ? `: ${error}` : ""}`;
  return "";
}

/** Totals over the last n games of a team game log (all counts are sums, shares come from the sums). */
export function lastGames(log, n) {
  const w = log.slice(-n);
  const sum = (k) => w.reduce((t, g) => t + (isNum(g[k]) ? g[k] : 0), 0);
  const xGF = sum("xGF"), xGA = sum("xGA"), GF = sum("GF"), GA = sum("GA");
  return { games: w.length, xGF, xGA, GF, GA, xGPct: xGF + xGA > 0 ? xGF / (xGF + xGA) : null, goalsVsXFor: GF - xGF, goalsVsXAgainst: GA - xGA };
}

const goalsWord = (v) => (Math.abs(v) >= 0.95 && Math.abs(v) < 1.05 ? "goal" : "goals");
/** "2.3 goals above xG over 5 games" (scored) / "1.1 fewer goals than xG allowed over 5 games". Facts only. */
export function callouts(w) {
  if (!w || !w.games) return [];
  const n = `${w.games} game${w.games === 1 ? "" : "s"}`;
  const f = w.goalsVsXFor, a = w.goalsVsXAgainst;
  const forText = Math.abs(f) < 0.05 ? `Goals scored equal xG over ${n}` : `${Math.abs(f).toFixed(1)} ${goalsWord(f)} ${f > 0 ? "above" : "below"} xG scored over ${n}`;
  const againstText = Math.abs(a) < 0.05 ? `Goals allowed equal xG against over ${n}` : `${Math.abs(a).toFixed(1)} ${goalsWord(a)} ${a > 0 ? "more" : "fewer"} allowed than xG against over ${n}`;
  return [forText, againstText];
}

/** Next upcoming games (not final, not live, not preseason) in start order. `isOver` tells which games are done/live. */
export function upcomingGames(games, isOver, limit = 8) {
  return games.filter((g) => g.type !== 1 && !isOver(g)).sort((a, b) => String(a.start).localeCompare(String(b.start)) || a.id - b.id).slice(0, limit);
}
