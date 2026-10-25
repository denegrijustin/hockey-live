import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Game, Team } from "../types";
import "./team-profile.css";
const TeamProfileBody = lazy(() => import("./TeamProfileBody"));

const ctx = createContext<(id: string) => void>(() => undefined);
export const useTeamProfile = () => useContext(ctx);

/** A team's name as a button that opens its profile. */
export function TeamLink({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  return <button type="button" className={`team-link ${className}`} data-team-link={id}>{children}</button>;
}

// Where a click on a logo should NOT open a profile: it belongs to a control that does something else (a team picker, a filter tile). The game cards are the one
// exception: the profile itself (so you can hop from one team to another). On the game cards a tap on a logo or name expands the card, as it always did.
const OWN_JOB = "button, a, summary, label, select, [role='button'], [data-no-profile]";
const STILL_OPENS = ".rs-row, .team-dialog";

/** One team profile for the whole app. Clicking any team logo, or any name marked as a team link, opens it. */
export function TeamProfileProvider({ teams, table, games, season, children }: { teams: Team[]; table: Record<string, any> | null; games: Game[]; season: number; children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const team = id ? teams.find((t) => t.id === id) : undefined;
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (team && !d.open) d.showModal();
    if (!team && d.open) d.close();
  }, [team]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      const named = el.closest("[data-team-link]");
      const logo = el.closest("img.team-logo[data-team]");
      const teamId = named?.getAttribute("data-team-link") ?? logo?.getAttribute("data-team") ?? null;
      if (!teamId) return;
      if (!named && logo && logo.closest(OWN_JOB) && !logo.closest(STILL_OPENS)) return;
      if (!teams.some((t) => t.id === teamId)) return;
      e.preventDefault();
      e.stopPropagation();
      setId(teamId);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [teams]);
  return (
    <ctx.Provider value={setId}>
      {children}
      <dialog ref={dialog} className="team-dialog" aria-label={team ? `${team.name} profile` : "Team profile"} onClose={() => setId(null)} onCancel={() => setId(null)} onClick={(e) => { if (e.target === dialog.current) setId(null); }}>
        {team && table && <Suspense fallback={<p className="rs-none">Loading…</p>}><TeamProfileBody team={team} teams={teams} table={table} games={games} season={season} onClose={() => setId(null)} /></Suspense>}
      </dialog>
    </ctx.Provider>
  );
}
