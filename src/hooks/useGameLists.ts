import { useMemo } from "react";
import { useEtToday } from "./useEtToday";
import { dayDiff } from "../lib/dates.mjs";
import { isLive } from "../lib/game-data.mjs";
import { finished } from "../lib/model.mjs";
import type { Game, Snapshot, Team } from "../types";

type Args = {
  data: Snapshot | null;
  // The season analysis from analyzeSeason(); only .analysis[id].score is read here.
  analysis: { analysis: Record<string, { score: number }> } | null;
  teams: Team[];
  selected: string[];
  type: number;
  period: string;
  range: string;
  query: string;
  sort: string;
  /** One Eastern day (YYYY-MM-DD) to show instead of the Upcoming/Past period and the window; null shows the usual lists. */
  date?: string | null;
};

/** The followed teams' games for the chosen filters, plus today's finished games kept in a compact strip. */
export function useGameLists({ data, analysis, teams, selected, type, period, range, query, sort, date = null }: Args) {
  const todayStr = useEtToday();
  const games = useMemo<Game[]>(() => {
    if (!data || !analysis) return [];
    const distance = Number(range);
    return data.games
      .filter(
        (g) =>
          (selected.includes(g.home) || selected.includes(g.away)) &&
          g.type === type &&
          (date ? g.date === date : finished(g) === (period === "past")) &&
          `${g.home} ${g.away} ${teams.find((t) => t.id === g.home)?.name} ${teams.find((t) => t.id === g.away)?.name}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (date || range === "all" ||
            Math.abs(dayDiff(todayStr, g.date)) <= distance),
      )
      .sort((a, b) =>
        isLive(a) !== isLive(b)
          ? Number(isLive(b)) - Number(isLive(a))
          : date
            ? a.start.localeCompare(b.start)
          : sort === "importance"
            ? analysis.analysis[b.id].score - analysis.analysis[a.id].score ||
              (period === "past"
                ? b.start.localeCompare(a.start)
                : a.start.localeCompare(b.start))
            : period === "past"
              ? b.start.localeCompare(a.start)
              : a.start.localeCompare(b.start),
      );
  }, [data, analysis, selected, type, period, range, query, sort, date, todayStr]);
  // The "Upcoming" list excludes finished games entirely, so a game that
  // already wrapped up earlier today would otherwise vanish until you
  // switch to "Past games". Surface those in a compact, collapsed strip
  // instead of full-size cards crowding the upcoming list.
  // The Eastern day, as the NHL dates its games (the browser's own date is a different day for much of the evening elsewhere).
  const finishedToday = useMemo(() => {
    if (!data || date) return [];
    return data.games
      .filter(
        (g) =>
          g.date === todayStr &&
          finished(g) &&
          g.type === type &&
          (selected.includes(g.home) || selected.includes(g.away)) &&
          `${g.home} ${g.away} ${teams.find((t) => t.id === g.home)?.name} ${teams.find((t) => t.id === g.away)?.name}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [data, type, selected, query, todayStr, date]);
  return { games, finishedToday };
}
