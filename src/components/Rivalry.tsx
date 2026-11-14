import type { Game } from "../types";
import { rivalryForGame, recentHeadToHead } from "../lib/rivalries.mjs";
import "./rivalry.css";

/** Compact label for schedule rows, tiles, and game cards. */
export function RivalryTag({ game }: { game: Game }) {
  const rivalry = rivalryForGame(game);
  if (!rivalry) return null;
  return <span className="rivalry-tag" title={rivalry.history} data-testid="rivalry-tag">Rivalry · {rivalry.name}</span>;
}

/** Editorial rivalry history with a strictly scoped, snapshot-based recent history. */
export function RivalryPanel({ game, allGames }: { game: Game; allGames: Game[] }) {
  const rivalry = rivalryForGame(game);
  if (!rivalry) return null;
  const recent = recentHeadToHead(allGames, game, 5);
  return (
    <section className="rivalry-panel" aria-label={`Rivalry history: ${rivalry.name}`} data-testid="rivalry-panel">
      <div className="rivalry-panel-head">
        <div><span className="rivalry-eyebrow">RIVALRY HISTORY</span><h3>{rivalry.name}</h3></div>
        <span className="rivalry-team-line">{game.away} / {game.home}</span>
      </div>
      <p>{rivalry.history}</p>
      {recent.length > 0 && (
        <div className="rivalry-meetings">
          <strong>Recent meetings <small>· available loaded seasons only</small></strong>
          <ul>{recent.map(g => (
            <li key={g.id}>
              <time dateTime={g.date}>{g.date}</time>
              <span>{g.away} {g.awayScore} – {g.homeScore} {g.home}</span>
            </li>
          ))}</ul>
        </div>
      )}
      {rivalry.source && <a className="rivalry-source" href={rivalry.source} target="_blank" rel="noreferrer">Historical source ↗</a>}
      <small className="rivalry-disclaimer">Historical all-time W–L is hidden until independently reconciled against NHL game results.</small>
    </section>
  );
}
