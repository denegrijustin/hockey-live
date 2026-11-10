import { createContext, useContext, type ReactNode } from "react";

/** What a player link needs to open that player's profile. `id` is the NHL player id. */
export interface PlayerRef { id: number | string; name?: string; team?: string; headshot?: string | null; number?: number | null }
type Open = (player: PlayerRef) => void;

const ctx = createContext<Open>(() => undefined);
/** `openPlayer(ref)`: open a player's profile from anywhere under the provider (injury rows, team rosters, search). */
export const usePlayerProfile = () => useContext(ctx);
/**
 * Placeholder: Phase 3 Agent 2 replaces this file with the real provider (one player dialog for the whole app, opened by `openPlayer`).
 * Keep the two exports and the `PlayerRef` shape: other screens already import them.
 */
export function PlayerProfileProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
