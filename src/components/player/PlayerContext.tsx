import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { searchFor } from "../../lib/date-nav.mjs";
import "../../player.css";
const PlayerProfile = lazy(() => import("./PlayerProfile"));

/** What a player link needs to open that player's profile. `id` is the NHL player id. */
export interface PlayerRef { id: number | string; name?: string; team?: string; headshot?: string | null; number?: number | null }
type Open = (player: PlayerRef) => void;

const ctx = createContext<Open>(() => undefined);
/** `openPlayer(ref)`: open a player's profile from anywhere under the provider (injury rows, team rosters, search). */
export const usePlayerProfile = () => useContext(ctx);

const validId = (id: unknown) => /^\d{7}$/.test(String(id));
/** The current address with the player parameter set (or removed); the view, date and team stay as they are. */
function addressWith(id: string | null) {
  const q = new URLSearchParams(location.search);
  return `${location.pathname}${searchFor(q.get("view") || "scoreboard", q.get("date"), { team: q.get("team") ?? undefined, player: id ?? undefined })}`;
}
const fromAddress = (): PlayerRef | null => {
  try {
    const id = new URLSearchParams(location.search).get("player");
    return id && validId(id) ? { id } : null;
  } catch { return null; }
};

/**
 * One player profile for the whole app. `openPlayer(ref)` opens it and adds `&player=<id>` to the address with its own history entry, so Back closes it;
 * closing removes the parameter again. A link with `&player=<id>` opens the profile on load.
 */
export function PlayerProfileProvider({ children }: { children: ReactNode }) {
  const [ref, setRef] = useState<PlayerRef | null>(fromAddress);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const pushed = useRef(false);
  const open = useCallback<Open>((p) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRef(p);
    if (validId(p.id)) {
      try { history.pushState({ ...history.state, player: String(p.id) }, "", addressWith(String(p.id))); pushed.current = true; } catch { /* address stays */ }
    }
  }, []);
  /** Close: step Back when this profile added a history entry, else just drop the parameter. */
  const close = useCallback(() => {
    if (pushed.current && history.state?.player) { pushed.current = false; history.back(); return; }
    try { if (new URLSearchParams(location.search).has("player")) history.replaceState(history.state, "", addressWith(null)); } catch { /* ignore */ }
    setRef(null);
  }, []);
  /** Leave for another screen (a team page, a game): drop the parameter in place, with no history step, so the next navigation is not undone. */
  const leave = useCallback(() => {
    pushed.current = false;
    try { if (new URLSearchParams(location.search).has("player")) history.replaceState({ ...history.state, player: undefined }, "", addressWith(null)); } catch { /* ignore */ }
    setRef(null);
  }, []);
  useEffect(() => {
    const pop = () => { const next = fromAddress(); if (!next) pushed.current = false; setRef((cur) => (next ? (cur && String(cur.id) === String(next.id) ? cur : next) : null)); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (ref && !d.open) d.showModal();
    if (!ref && d.open) {
      d.close();
      const o = opener.current;
      if (o?.isConnected && document.activeElement !== o) o.focus({ preventScroll: true });
    }
  }, [ref]);
  const value = useMemo(() => open, [open]);
  return (
    <ctx.Provider value={value}>
      {children}
      <dialog
        ref={dialog}
        className="player-dialog"
        aria-label={ref?.name ? `${ref.name} player profile` : "Player profile"}
        onClose={() => { if (ref) close(); }}
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClick={(e) => { if (e.target === dialog.current) close(); }}
      >
        <button type="button" className="dialog-close" onClick={close} aria-label="Close player details">Close ×</button>
        {ref && (
          <Suspense fallback={<p className="pp-status" role="status">Loading player details…</p>}>
            <PlayerProfile key={String(ref.id)} player={ref} onClose={close} onLeave={leave} />
          </Suspense>
        )}
      </dialog>
    </ctx.Provider>
  );
}
