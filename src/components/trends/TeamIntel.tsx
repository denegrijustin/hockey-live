import type { Game, Team } from "../../types";

/** The data a team's intelligence section is built from (all optional: the section hides what it cannot support). */
export interface TeamIntelProps {
  teamId: string;
  teams: Team[];
  table: Record<string, any> | null;
  games: Game[];
  /** League matchup snapshot (offense/defense/special-teams ranks), when loaded. */
  matchups?: any;
  /** Playoff simulation result, when computed (labelled as a simulation, never a prediction). */
  sim?: any;
  onNavigate?: (view: string) => void;
}
/** Placeholder: Phase 3 Agent 5 replaces this file. The team page (Agent 1) mounts it as the "Team intelligence" section; keep the props. */
export function TeamIntel(_props: TeamIntelProps) {
  return null;
}
