import { useMemo } from "react";
import type { Game, Team } from "../../../types";
import type { SummaryPart } from "../../../lib/moneypuck-types";
import { useStarters } from "../shared/useStarters";
import { starterLine } from "./logic.mjs";
import { fmtSigned } from "../shared/format";

export type StarterRow = ReturnType<typeof starterLine>;

/** Both starters joined to MoneyPuck goalie rows. Only mounted for visible cards (it fetches the starter source). */
export function useStarterLines(game: Game, away: Team, home: Team, summary: SummaryPart | null) {
  const ids = useMemo(() => [away.id, home.id], [away.id, home.id]);
  const starters = useStarters(game, ids, game.season);
  return useMemo(() => ({ away: starterLine(summary, starters[away.id]), home: starterLine(summary, starters[home.id]) }), [summary, starters, away.id, home.id]);
}

export const statusWord = (s: StarterRow["status"]) => (s === "confirmed" ? "Confirmed" : s === "projected" ? "Projected" : "Starter unknown");
/** The one-line explanation of a missing number, never a made-up value. */
export function starterGap(s: StarterRow): string | null {
  if (s.status === "unknown") return "Starter unknown";
  if (!s.inRows) return "Not in MoneyPuck goalie data";
  if (s.gsax == null) return "GSAx unavailable";
  return null;
}
export const starterText = (s: StarterRow) => (s.gsax == null ? "–" : fmtSigned(s.gsax, 1));
