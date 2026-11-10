import { useEffect, useRef } from "react";
import { openGame } from "../../lib/open-game";
import { Sheet } from "../Sheet";
import { usePlayerProfile } from "../player/PlayerContext";
import { TeamLink } from "../TeamProfile";
import { clearAlerts, markAllRead, useAlertItems } from "./alertFeed";

const when = (at: number) => { try { return new Date(at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };

/** The notification list, newest first. Opening it marks everything read (items that were new stay marked "New" until it closes). */
export function NotificationCenter({ onClose, onNavigate }: { onClose: () => void; onNavigate?: (view: string) => void }) {
  const items = useAlertItems();
  const openPlayer = usePlayerProfile();
  const fresh = useRef<Set<string> | null>(null);
  if (fresh.current === null) fresh.current = new Set(items.filter((i) => !i.read).map((i) => i.id));
  useEffect(() => { markAllRead(); }, []);
  const sorted = [...items].sort((a, b) => b.at - a.at);
  return (
    <Sheet title="Notifications" onClose={onClose} left={sorted.length ? <button type="button" className="sheet-reset" onClick={clearAlerts}>Clear all</button> : undefined}>
      {sorted.length === 0 ? (
        <div className="alert-empty">
          <p><strong>No notifications yet.</strong></p>
          <p>Iceboard tells you about puck drops, period breaks, finals and postponements for your favorite teams and saved games while this page is open. Choose what you want in Settings, Notifications.</p>
          <button type="button" className="alert-link" onClick={() => { onClose(); onNavigate?.("settings"); }}>Open notification settings</button>
        </div>
      ) : (
        <ul className="alert-list">
          {sorted.map((i) => (
            <li key={i.id} className="alert-item" data-new={fresh.current!.has(i.id) || undefined} data-retracted={i.retracted || undefined} data-kind={i.kind}>
              <div className="alert-text">
                <strong className={i.retracted ? "alert-struck" : undefined}>{fresh.current!.has(i.id) && <span className="alert-new">New </span>}{i.title}</strong>
                {i.retracted && <span className="alert-retracted">Goal disallowed. This goal is no longer in the NHL play-by-play.</span>}
                {i.body && <span className={i.retracted ? "alert-struck" : undefined}>{i.body}</span>}
                <time>{when(i.at)}</time>
              </div>
              <div className="alert-actions">
                {i.gameId !== null && i.link?.eventId != null && !i.retracted && !i.retracts && <button type="button" onClick={() => { onClose(); openGame(i.link!.gameId, { tab: "pbp", event: i.link!.eventId! }); }}>Open play</button>}
                {i.gameId !== null && <button type="button" onClick={() => { onClose(); openGame(i.gameId!); }}>Open game</button>}
                {i.teams.map((t) => <TeamLink key={t} id={t} className="alert-team">{t}</TeamLink>)}
                {i.players.map((p) => <button key={p.id} type="button" onClick={() => { onClose(); openPlayer({ id: p.id, name: p.name }); }}>{p.name || "Player"}</button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
