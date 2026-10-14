import { useEffect, useMemo, useState } from "react";
import type { Game, MatchupGoalie } from "../../../types";
import { finished } from "../../../lib/model.mjs";
import { isLive } from "../../../lib/game-data.mjs";
import { loadBox } from "../../../lib/api";
import { useLeagueMatchups } from "../../useLeagueMatchups";

export type StarterStatus = "confirmed" | "projected" | "unknown";
export type StarterInfo = {
  team: string;
  id: number | null;
  name: string | null;
  headshot: string | null;
  status: StarterStatus;
  gamesStarted: number | null;
};

/**
 * The goalie each team starts, from the site's existing starter source (the same one the Starting goalies panel uses):
 * "confirmed" once the NHL box score shows a goalie facing shots in this game, "projected" from season starts before
 * that, "unknown" when no goalie is on record. MoneyPuck goalie rows are joined to these by NHL player id.
 */
export function useStarters(game: Game | null, teams: string[], season: number): Record<string, StarterInfo> {
  const { data } = useLeagueMatchups(season);
  const [actual, setActual] = useState<Record<string, number>>({});
  const played = !!game && (finished(game) || isLive(game));
  useEffect(() => {
    if (!game || !played) { setActual({}); return; }
    let active = true;
    loadBox(game.id).then((box) => {
      if (active) setActual(Object.fromEntries(box.players.filter((p) => p.position === "G" && p.shotsAgainst != null).map((p) => [p.team, p.id])));
    }).catch(() => {});
    return () => { active = false; };
  }, [game?.id, played]);
  return useMemo(() => {
    const out: Record<string, StarterInfo> = {};
    for (const team of teams) {
      const goalies: MatchupGoalie[] = data?.teams[team]?.goalies ?? [];
      const confirmed = goalies.find((g) => g.id === actual[team]);
      const pick = confirmed ?? goalies[0] ?? null;
      out[team] = {
        team, id: pick?.id ?? actual[team] ?? null, name: pick?.name ?? null, headshot: pick?.headshot ?? null,
        status: actual[team] ? "confirmed" : pick ? "projected" : "unknown", gamesStarted: pick?.gamesStarted ?? null,
      };
    }
    return out;
  }, [data, actual, teams.join(",")]);
}
