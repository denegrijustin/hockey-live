import type { Game } from "../types";
import { rivalryForGame, rivalryContext, verifiedAllTime } from "../lib/rivalries.mjs";
import allTimeRecords from "../data/rivalry-records.json";
import { approvedRivalryMedia, RIVALRY_MEDIA_CANDIDATES } from "../lib/rivalry-media.mjs";
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
  const context = rivalryContext(allGames, game);
  const approvedImages = approvedRivalryMedia(RIVALRY_MEDIA_CANDIDATES, rivalry.id);
  const recent = context?.lastTen ?? [];
  const official = allTimeRecords.rivalries.find(record => record.id === rivalry.id);
  const awayRegular = verifiedAllTime(official?.regular_season[game.away]);
  const homeRegular = verifiedAllTime(official?.regular_season[game.home]);
  const awayPlayoffs = verifiedAllTime(official?.playoffs[game.away]);
  const homePlayoffs = verifiedAllTime(official?.playoffs[game.home]);
  const validOfficial = Boolean(awayRegular && homeRegular && awayPlayoffs && homePlayoffs);
  return (
    <section className="rivalry-panel" aria-label={`Rivalry history: ${rivalry.name}`} data-testid="rivalry-panel">
      <div className="rivalry-panel-head">
        <div><span className="rivalry-eyebrow">RIVALRY HISTORY</span><h3>{rivalry.name}</h3></div>
        <span className="rivalry-team-line">{game.away} / {game.home}</span>
      </div>
      <p>{rivalry.history}</p>
      {validOfficial && awayRegular && homeRegular && awayPlayoffs && homePlayoffs && (
        <section className="rivalry-all-time" aria-label="Official franchise head-to-head records">
          <div className="rivalry-record-title"><strong>All-time franchise record</strong><span>Official NHL Records · {allTimeRecords.retrieved_on}</span></div>
          <div className="rivalry-record-grid">
            <div>
              <span>Regular season</span>
              <div className="rivalry-record-line"><strong>{game.away}</strong><b>{awayRegular.wins}-{awayRegular.losses}-{awayRegular.ties}-{awayRegular.overtime_losses}</b></div>
              <div className="rivalry-record-line"><strong>{game.home}</strong><b>{homeRegular.wins}-{homeRegular.losses}-{homeRegular.ties}-{homeRegular.overtime_losses}</b></div>
              <small>Wins–Losses–Ties–OT losses · {awayRegular.games} games</small>
            </div>
            <div>
              <span>Playoff games</span>
              <div className="rivalry-record-line"><strong>{game.away}</strong><b>{awayPlayoffs.wins}-{awayPlayoffs.losses}</b></div>
              <div className="rivalry-record-line"><strong>{game.home}</strong><b>{homePlayoffs.wins}-{homePlayoffs.losses}</b></div>
              <small>{awayPlayoffs.games} completed playoff games</small>
            </div>
          </div>
          <p className="rivalry-record-scope">Franchise history includes predecessor identities and relocations where applicable. Counts reflect the NHL Records snapshot retrieved on {allTimeRecords.retrieved_on}; later games are excluded.</p>
          <a className="rivalry-source" href={allTimeRecords.source_url} target="_blank" rel="noreferrer">NHL Records — official source ↗</a>
        </section>
      )}
      {approvedImages.map(asset => <figure key={asset.source_url} className="rivalry-photo"><img src={asset.asset_url || undefined} alt={asset.caption} loading="lazy" /><figcaption>{asset.caption} · {asset.photographer} · {asset.license} · <a href={asset.source_url} target="_blank" rel="noreferrer">Photo source</a></figcaption></figure>)}
      {context && <div className="rivalry-live-context">
        <p className="rivalry-current-story">{context.story}</p>
        <div className="rivalry-facts">
          <div><span>Season series</span><strong>{game.away} {context.currentSeason.wins[game.away]} – {context.currentSeason.wins[game.home]} {game.home}</strong></div>
          {recent.length > 0 && <div><span>Last {recent.length} meetings</span><strong>{game.away} {context.lastTenWins[game.away]} – {context.lastTenWins[game.home]} {game.home}</strong></div>}
          {context.streak.team && <div><span>Active head-to-head streak</span><strong>{context.streak.team} · {context.streak.games} win{context.streak.games === 1 ? "" : "s"}</strong></div>}
        </div>
        {context.recentPlayoffs.length > 0 && <p className="rivalry-playoff-note">Recent playoff games in loaded history: {context.recentPlayoffs.length} (not an all-time series total).</p>}
      </div>}
      {recent.length > 0 && (
        <details className="rivalry-meetings">
          <summary>Last {recent.length} completed meetings <small>· loaded seasons only</small></summary>
          <ul>{recent.map(g => (
            <li key={g.id}>
              <time dateTime={g.date}>{g.date}</time>
              <span>{g.away} {g.awayScore} – {g.homeScore} {g.home}</span>
              {g.type === 3 && <em>Playoffs</em>}
            </li>
          ))}</ul>
        </details>
      )}
      {rivalry.source && <a className="rivalry-source" href={rivalry.source} target="_blank" rel="noreferrer">Historical source ↗</a>}
      {!validOfficial && <small className="rivalry-disclaimer">All-time franchise statistics temporarily unavailable pending verification.</small>}
    </section>
  );
}
