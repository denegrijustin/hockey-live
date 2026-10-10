import { useMemo } from "react";
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
};

/** The followed teams' games for the chosen filters, plus today's finished games kept in a compact strip. */
export function useGameLists({ data, analysis, teams, selected, type, period, range, query, sort }: Args) {
  const games = useMemo<Game[]>(() => {
    if (!data || !analysis) return [];
    const today = new Date();
    const distance = Number(range) * 86400000;
    return data.games
      .filter(
        (g) =>
          (selected.includes(g.home) || selected.includes(g.away)) &&
          g.type === type &&
          finished(g) === (period === "past") &&
          `${g.home} ${g.away} ${teams.find((t) => t.id === g.home)?.name} ${teams.find((t) => t.id === g.away)?.name}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (range === "all" ||
            Math.abs(Date.parse(g.start) - today.getTime()) <= distance),
      )
      .sort((a, b) =>
        isLive(a) !== isLive(b)
          ? Number(isLive(b)) - Number(isLive(a))
          : sort === "importance"
            ? analysis.analysis[b.id].score - analysis.analysis[a.id].score ||
              (period === "past"
                ? b.start.localeCompare(a.start)
                : a.start.localeCompare(b.start))
            : period === "past"
              ? b.start.localeCompare(a.start)
              : a.start.localeCompare(b.start),
      );
  }, [data, analysis, selected, type, period, range, query, sort]);
  // The "Upcoming" list excludes finished games entirely, so a game that
  // already wrapped up earlier today would otherwise vanish until you
  // switch to "Past games". Surface those in a compact, collapsed strip
  // instead of full-size cards crowding the upcoming list.
  const todayStr = new Date().toLocaleDateString("en-CA");
  const finishedToday = useMemo(() => {
    if (!data) return [];
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
  }, [data, type, selected, query, todayStr]);
  return { games, finishedToday };
}
