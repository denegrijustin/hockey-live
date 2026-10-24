// A team's season: every game it plays (regular season and playoffs), what happened in the ones that are over, and when the rest are on. Pure, so the list, the
// calendar and the tests share it.
const finished = (g) => ["OFF", "FINAL"].includes(g.state);
const live = (g) => ["LIVE", "CRIT"].includes(g.state);

/** The team's games in the order they are played. Preseason is left out. */
export function teamGames(games, teamId) {
  return games.filter((g) => (g.type === 2 || g.type === 3) && (g.home === teamId || g.away === teamId)).sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id);
}

/** One game from the team's side: the opponent, home or away, where it stands, and (once over) the result. */
export function sideOf(g, teamId) {
  const home = g.home === teamId, us = home ? g.homeScore : g.awayScore, them = home ? g.awayScore : g.homeScore;
  const status = finished(g) ? "final" : live(g) ? "live" : "upcoming";
  let result = null;
  if (status === "final" && us != null && them != null && us !== them) result = us > them ? "W" : g.end === "OT" || g.end === "SO" ? "OTL" : "L";
  return { id: g.id, game: g, opp: home ? g.away : g.home, home, status, result, us, them, ot: g.end === "OT" || g.end === "SO" ? g.end : null, date: g.date, start: g.start };
}

/** W–L–OTL and points for the games that are over. */
export function recordOf(items) {
  const r = { gp: 0, w: 0, l: 0, otl: 0, pts: 0 };
  for (const i of items) {
    if (!i.result) continue;
    r.gp++;
    if (i.result === "W") { r.w++; r.pts += 2; } else if (i.result === "OTL") { r.otl++; r.pts += 1; } else r.l++;
  }
  return r;
}

/** Index of the game closest to being played: the one on now, else the next one to start, else (the season is over) the last one played. -1 for no games. */
export function nextIndex(items) {
  if (!items.length) return -1;
  const on = items.findIndex((i) => i.status === "live");
  if (on >= 0) return on;
  const next = items.findIndex((i) => i.status === "upcoming");
  return next >= 0 ? next : items.length - 1;
}

/** "2026-10" for a date. */
export const monthKey = (date) => date.slice(0, 7);
/** The months the season spans, first to last, as "YYYY-MM". */
export function seasonMonths(items) {
  if (!items.length) return [];
  const out = [];
  let [y, m] = monthKey(items[0].date).split("-").map(Number);
  const last = monthKey(items.at(-1).date);
  for (;;) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    out.push(k);
    if (k >= last) break;
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** The weeks (Sunday first) that show a month, each day with that day's games. Days from the neighbouring months are marked so they can be dimmed. */
export function monthGrid(month, items) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const byDate = new Map();
  for (const i of items) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i]);
  const weeks = [];
  const d = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let k = 0; k < 7; k++) {
      const date = d.toISOString().slice(0, 10);
      week.push({ date, day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1, games: byDate.get(date) ?? [] });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    if (w >= 4 && !week.some((x) => x.inMonth)) break; // no empty trailing week
    weeks.push(week);
  }
  return weeks;
}

/** The month to open the calendar on: this month if the season covers it, else the nearest month the season does cover. */
export function defaultMonth(items, today) {
  const months = seasonMonths(items);
  if (!months.length) return monthKey(today);
  const k = monthKey(today);
  return months.includes(k) ? k : k < months[0] ? months[0] : months.at(-1);
}

export const monthLabel = (month) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
