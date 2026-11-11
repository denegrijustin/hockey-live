import { useMemo } from "react";
import type { Game, Team } from "../../types";
import { useSavedGames } from "../../hooks/useSavedGames";
import { byStartThenId, isCalledOff } from "../../lib/game-data.mjs";
import { finished } from "../../lib/model.mjs";
import { teamRanks } from "../../lib/ranks.mjs";
import { GameCardView } from "../GameCardView";
import { SaveGameButton } from "../SaveGameButton";
import "../../saved-games.css";

type Props = { games: Game[]; teams: Team[]; analysis: any; onOpenGame: (id: number) => void };
const dayText = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "date unknown");

/** Saved games, resolved by id against the loaded season (live scores and status come from the same merged snapshot as everywhere else). */
export function SavedGames({ games, teams, analysis, onOpenGame }: Props) {
  const { saved, remove, removeMany } = useSavedGames();
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g] as const)), [games]);
  const season = games[0]?.season;
  const teamOf = (id: string) => teams.find((t) => t.id === id);
  const rows = useMemo(() => {
    const found: Game[] = [], missing: typeof saved = [];
    for (const s of saved) { const g = byId.get(s.id); if (g) found.push(g); else missing.push(s); }
    found.sort(byStartThenId);
    return { open: found.filter((g) => !finished(g)), done: found.filter(finished).reverse(), missing: missing.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id) };
  }, [saved, byId]);

  if (!saved.length) {
    return (
      <div className="sb-empty" data-testid="saved-empty">
        <p>No saved games yet. Use the bookmark on a game card or in the Game Center to keep a game here.</p>
        <p className="sg-device">Saved on this device only.</p>
      </div>
    );
  }
  const card = (g: Game) => {
    const away = teamOf(g.away), home = teamOf(g.home);
    if (!away || !home) return null;
    const off = isCalledOff(g);
    const kind = String(g.scheduleState).toUpperCase();
    return (
      <li className="sg-item" key={g.id} data-saved-game={g.id}>
        <GameCardView
          variant="compact" game={g} away={away} home={home} ranks={analysis?.before?.[g.id] ? teamRanks(analysis.before[g.id], teams) : null} onOpen={() => onOpenGame(g.id)}
          actions={<SaveGameButton game={g} awayName={away.name} homeName={home.name} />}
        />
        <p className="sg-note">{dayText(g.date)}{off ? ` · ${kind === "PPD" ? "Postponed" : kind === "CNCL" ? "Cancelled" : "Suspended"}` : ""}</p>
      </li>
    );
  };
  return (
    <div data-testid="saved-games">
      <p className="sg-device">Saved on this device only.</p>
      {rows.open.length > 0 && <ul className="sg-list" aria-label="Saved upcoming and live games">{rows.open.map(card)}</ul>}
      {rows.missing.length > 0 && (
        <ul className="sg-list" aria-label="Saved games not in the schedule" style={{ marginTop: 8 }}>
          {rows.missing.map((s) => (
            <li className="sg-missing" key={s.id} data-saved-missing={s.id}>
              <p>
                <b>Schedule changed or removed</b>
                {s.away || "?"} at {s.home || "?"} · {dayText(s.date)}{season && s.season && s.season !== season ? " · saved from another season" : ""}
              </p>
              <button type="button" className="sg-remove" aria-label={`Remove saved game ${s.away} at ${s.home}`} onClick={() => remove(s.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {rows.done.length > 0 && (
        <section className="sg-finished" aria-label="Finished saved games">
          <div className="sg-head">
            <h2>Finished</h2>
            <button type="button" onClick={() => removeMany(rows.done.map((g) => g.id))}>Remove all finished</button>
          </div>
          <ul className="sg-list">{rows.done.map(card)}</ul>
        </section>
      )}
    </div>
  );
}
