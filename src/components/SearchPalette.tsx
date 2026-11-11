import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Game, Team } from "../types";
import type { SearchPlayer } from "../hooks/useSearchIndex";
import { Icon } from "./icons";
import "../search.css";

// The dialog, the index and the ranking load the first time search opens, so the first paint does not carry them.
const SearchDialog = lazy(() => import("./SearchDialog"));

const typing = (el: EventTarget | null) => {
  const e = el instanceof HTMLElement ? el : null;
  return !!e && (e.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.tagName));
};

/** The header's Search button and the palette it opens (also Ctrl/Cmd+K, and "/" when not typing). Picks a team, game, player or page. `players` are only those the app has already loaded. */
export function SearchPalette({ teams, games, players, onTeam, onView }: { teams: Team[]; games: Game[]; players?: SearchPlayer[]; onTeam: (id: string) => void; onView: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const show = useCallback(() => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current;
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    const back = returnTo.current && document.contains(returnTo.current) ? returnTo.current : trigger.current;
    requestAnimationFrame(() => back?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); if (!open) show(); return; }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target) && !document.querySelector("dialog[open]")) { e.preventDefault(); show(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, show]);
  return (
    <>
      <button ref={trigger} type="button" className="search-trigger" aria-label="Search" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K /" title="Search (Ctrl K or /)" onClick={show}>
        <Icon name="search" size={18} />
      </button>
      {open && <Suspense fallback={null}><SearchDialog teams={teams} games={games} players={players} onClose={hide} onTeam={onTeam} onView={onView} /></Suspense>}
    </>
  );
}
