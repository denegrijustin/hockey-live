import type { Game } from "../../types";
import type { MpResult } from "../../lib/moneypuck-client";
import type { GamesPart, LinesPart, SkatersPart, SummaryPart } from "../../lib/moneypuck-types";
import type { NpState, SetState } from "./state";

/** Everything a sub-view needs: the filters, the loaded parts and the site's game list. */
export type Ctx = {
  season: number; s: NpState; set: SetState;
  summary: MpResult<SummaryPart>; skaters: MpResult<SkatersPart>; lines: MpResult<LinesPart>; games: MpResult<GamesPart>;
  appGames: Game[];
  toggleTeam: (team: string) => void;
};
