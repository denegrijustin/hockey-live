import { finished } from "./model.mjs";
import { isLive } from "./game-data.mjs";

/** "FINAL", "FINAL / OT", "LIVE P2 12:31", "INT 1", or the start time. */
export function tickerStatus(g, locale = "en-US") {
  if (finished(g)) return g.end && g.end !== "REG" ? `FINAL / ${g.end}` : "FINAL";
  if (isLive(g)) {
    const p = g.periodType === "OT" ? "OT" : `P${g.period ?? "—"}`;
    return g.intermission ? `INT ${g.period ?? ""}`.trim() : `LIVE ${p} ${g.clock ?? ""}`.trim();
  }
  return new Date(g.start).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

const order = (g) => (isLive(g) ? 0 : finished(g) ? 2 : 1);

/**
 * The day's slate for the ticker: live games first, then the ones still to come in start order, then the finals
 * (latest first). On a day with no games it shows the next day that has some; with none at all, nothing.
 */
export function tickerSlate(games, today) {
  const dates = [...new Set(games.filter((g) => g.date >= today).map((g) => g.date))].sort();
  const date = dates.includes(today) ? today : dates[0];
  if (!date) return { date: today, items: [] };
  const items = games
    .filter((g) => g.date === date)
    .sort((a, b) => order(a) - order(b) || (order(a) === 2 ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
  return { date, items };
}
