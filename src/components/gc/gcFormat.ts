import type { GameFeed } from "../../types";

type Play = NonNullable<GameFeed["plays"]>[number];

/** "1st", "2nd", "3rd", "OT", "2OT" (playoffs), "SO". Regulation is 3 periods; type tells OT/SO. */
export function periodLabel(period?: number | null, type?: string | null): string {
  if (type === "SO") return "SO";
  if (type === "OT") return period && period > 4 ? `${period - 3}OT` : "OT";
  const n = period ?? 0;
  if (!n) return "";
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

export const isGoalPlay = (p: Play) => p.type === "goal";

/** Goals from the feed as they happened (order), from plays when present, else from the older `goals` list. Never invents a goal. */
export function goalsOf(feed: GameFeed | null | undefined, plays: Play[]) {
  const fromPlays = plays.filter(isGoalPlay);
  if (fromPlays.length) return fromPlays.map((p) => ({ id: p.id, period: p.period, periodType: p.periodType ?? null, time: p.time, team: p.team, player: p.player, assists: p.assists ?? [], score: p.score ?? null }));
  return (feed?.goals ?? []).map((g) => ({ id: g.id, period: g.period, periodType: g.period > 3 ? "OT" : "REG", time: g.time, team: g.team, player: g.player, assists: [] as { id: number; name: string }[], score: null as { home: number; away: number } | null }));
}
