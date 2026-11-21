import { useEffect, useMemo, useRef, useState } from "react";
import type { Game, Team } from "../types";
import { changeMulti, closeMulti } from "../hooks/useMultiRoute";
import { isLive } from "../lib/game-data.mjs";
import { MAX_GAMES } from "../lib/multi-route.mjs";
import { finished } from "../lib/model.mjs";
import { gameStatus } from "../lib/game-status.mjs";
import { Icon } from "./icons";
import "./multi-view.css";

/** "EDM 2–0 FLA · 2nd 17:38": one line that names a game in a picker. */
function label(g: Game) {
  const st = gameStatus(g);
  const score = g.awayScore != null && g.homeScore != null && (isLive(g) || finished(g)) ? ` ${g.awayScore}–${g.homeScore} ` : " at ";
  return `${g.away}${score}${g.home} · ${st.short ?? st.label}`;
}

const ORDINAL = ["first", "second", "third", "fourth"];

/**
 * Up to four Game Centers: two side by side, three or four in a grid (stacked on a narrow screen). Each pane is its own copy of the app showing one game's Game Center (an embedded page), so the two scroll,
 * switch tabs and update independently: scroll one down and the other stays where it was. A pane's bar picks which game it shows; with one game chosen a second pane asks for one, and "Add a game" opens another empty pane (up to four).
 */
export default function MultiView({ ids, games, teams }: { ids: number[]; games: Game[]; teams: Team[] }) {
  const root = useRef<HTMLDivElement>(null);
  const first = games.find((g) => g.id === ids[0]);
  const pool = useMemo(() => {
    const day = first?.date;
    return games
      .filter((g) => g.type !== 0 && (g.date === day || isLive(g)))
      .sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || a.start.localeCompare(b.start));
  }, [games, first?.date]);
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    root.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMulti(); };
    window.addEventListener("keydown", onKey);
    document.documentElement.classList.add("mv-open");
    return () => { window.removeEventListener("keydown", onKey); document.documentElement.classList.remove("mv-open"); prev?.focus?.({ preventScroll: true }); };
  }, []);
  // an extra empty pane, opened by "Add a game" (one game chosen always has one)
  const [adding, setAdding] = useState(false);
  const slots: (number | null)[] = ids.length < 2 || (adding && ids.length < MAX_GAMES) ? [...ids, null] : ids;
  const set = (slot: number, id: number | null) => {
    const next: (number | null)[] = [...ids]; next[slot] = id;
    const clean = next.filter((x): x is number => x != null && Number.isFinite(x));
    if (slot >= ids.length) setAdding(false);
    changeMulti(clean.length ? clean : ids);
  };
  const remove = (slot: number) => { const next = ids.filter((_, i) => i !== slot); changeMulti(next.length ? next : ids.slice(0, 1)); };
  return (
    <div ref={root} className="mv" role="dialog" aria-modal="true" aria-label="Multi-view: games side by side" tabIndex={-1} data-testid="multi-view">
      <header className="mv-top">
        <h2><Icon name="columns" size={20} /> Multi-view</h2>
        <span className="mv-hint">Each game scrolls on its own</span>
        {ids.length >= 2 && ids.length < MAX_GAMES && !adding && <button type="button" className="mv-add" onClick={() => setAdding(true)} data-testid="mv-add"><span aria-hidden="true">+</span> Add a game</button>}
        <button type="button" className="mv-close" aria-label="Close multi-view" onClick={closeMulti}><Icon name="close" size={20} /></button>
      </header>
      <div className="mv-panes" data-count={slots.length}>
        {slots.map((id, slot) => {
          const g = id != null ? games.find((x) => x.id === id) : null;
          return (
            <section className="mv-pane" key={slot} data-slot={slot} aria-label={g ? `${name(g.away)} at ${name(g.home)}` : "Choose a game"}>
              <div className="mv-bar">
                <label>
                  <span className="sr-only">Game {slot + 1}</span>
                  <select value={id ?? ""} onChange={(e) => set(slot, e.target.value ? Number(e.target.value) : null)} data-testid={`mv-pick-${slot}`}>
                    {id == null && <option value="">Choose a game…</option>}
                    {id != null && !pool.some((p) => p.id === id) && g && <option value={id}>{label(g)}</option>}
                    {pool.filter((p) => p.id === id || !ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
                  </select>
                </label>
                {slot > 0 && id != null && <button type="button" className="mv-x" aria-label={`Remove the ${ORDINAL[slot]} game`} onClick={() => remove(slot)}><Icon name="close" size={16} /></button>}
                {id == null && adding && <button type="button" className="mv-x" aria-label="Cancel adding a game" onClick={() => setAdding(false)}><Icon name="close" size={16} /></button>}
              </div>
              {id != null ? (
                <iframe key={id} className="mv-frame" title={g ? `${g.away} at ${g.home} Game Center` : "Game Center"} src={`/?view=games&game=${id}&embed=1`} data-testid={`mv-frame-${slot}`} />
              ) : (
                <div className="mv-empty" data-testid="mv-empty"><p>Pick a game to watch beside {ids.length > 1 ? "these" : "this one"}.</p></div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
