import type { Game, GameFeed } from '../types';
import { projectGame } from '../lib/projection.mjs';
export function Projection({ game, before, baseline, feed, error }: { game: Game; before: any; baseline: any; feed?: GameFeed | null; error?: string | null }) {
  const p = projectGame(game, before, baseline, feed);
  if (!p) return null;
  const home = Math.round(p.homeWin * 100), away = 100 - home;
  const winner = home === away ? 'Too close to call' : `${home > away ? game.home : game.away} favored`;
  return <section className="projection" aria-label={p.live ? 'Live winner projection' : 'Pregame projection'}>
    <div className="mini-heading">{p.live ? 'LIVE PROJECTION' : 'PREGAME PROJECTION'}<span>Model estimate</span></div>
    <div className="prediction-head"><strong>{winner}</strong>{!p.live && p.score && <b>{game.away} {p.score.away} – {p.score.home} {game.home}</b>}</div>
    <div className="prediction-labels"><span>{game.away} {away}%</span><span>{game.home} {home}%</span></div>
    <div className="comparison-track" role="img" aria-label={`${game.away} ${away} percent, ${game.home} ${home} percent estimated win chance`}><i style={{ width: `${away}%`, background: '#73d9c1' }}/><i style={{ flex: 1, background: '#f2bc67' }}/></div>
    <p className="detail-note">{p.live ? p.overtime ? 'Overtime: next-goal estimate from team strength.' : 'Score + time remaining · season strength · recent form · shot momentum' : 'Most likely final score · includes an OT / shootout winner'}</p>
    {p.live && <p className="feed-time">{error ? 'Detailed feed delayed; estimate may be stale.' : 'Updates with the live feed · feed delays possible'}</p>}
    <details className="inner-details"><summary>How this estimate works</summary><p className="detail-note">Season goals for and against are blended with 20 games of prior-season context (or a 3-goal league baseline). Last five games add a small form adjustment; home ice adds 0.12 goals. Live estimates use the score, regulation time remaining and a capped shot adjustment, including the last ten minutes when available. Tied regulation outcomes receive an estimated OT / shootout winner. Uncalibrated Poisson model; excludes lineups, goalie changes, penalties and empty-net tactics. Percentages are estimates, not guarantees. The most likely score can differ from the favored team because many scorelines contribute to win chance.</p></details>
  </section>;
}
