import { lazy, Suspense, useRef, useState, type KeyboardEvent } from "react";
import type { Game, Team } from "../../types";
import { openGame } from "../../lib/open-game";
import { PageHeader } from "../PageHeader";
import { SavedGames } from "./SavedGames";
import "../../saved-games.css";

const PlayersWatchlist = lazy(() => import("./PlayersWatchlist").then((m) => ({ default: m.PlayersWatchlist })));

const TABS = [["players", "Players"], ["games", "Games"]] as const;
type Tab = (typeof TABS)[number][0];

/** Following: the players and games you keep an eye on (device-local). Tabs follow the WAI-ARIA pattern: arrows, Home and End move between them. */
export function Following({ games = [], teams = [], analysis = null, onOpenGame = openGame }: { games?: Game[]; teams?: Team[]; analysis?: any; onOpenGame?: (id: number) => void }) {
  const [tab, setTab] = useState<Tab>("players");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex(([id]) => id === tab);
    const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next][0]);
    refs.current[TABS[next][0]]?.focus();
  };
  return (
    <section aria-label="Following">
      <PageHeader title="Following" eyebrow="MY ICEBOARD" />
      <div className="fw-tabs" role="tablist" aria-label="Following" onKeyDown={onKey}>
        {TABS.map(([id, label]) => (
          <button key={id} ref={(el) => { refs.current[id] = el; }} type="button" role="tab" id={`fw-tab-${id}`} aria-selected={tab === id} aria-controls={`fw-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`fw-panel-${tab}`} aria-labelledby={`fw-tab-${tab}`}>
        {tab === "players" ? (
          <Suspense fallback={<p role="status">Loading players…</p>}><PlayersWatchlist /></Suspense>
        ) : (
          <SavedGames games={games} teams={teams} analysis={analysis} onOpenGame={onOpenGame} />
        )}
      </div>
    </section>
  );
}
