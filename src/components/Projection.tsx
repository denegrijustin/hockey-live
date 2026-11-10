import { useEffect, useRef, useState } from "react";
import type { Game, GameFeed } from '../types';
import { Gauge } from './Gauge';
import './gauge.css';
import { projectGame } from '../lib/projection.mjs';
export function modelGaugeProps(game: Game, p: NonNullable<ReturnType<typeof projectGame>>) {
  const home = Math.round(p.homeWin * 100), away = 100 - home;
  // The projected final score leads; the win chance is the smaller line under it. (Without a projected score the percentages lead.)
  if (p.score) return { away: p.score.away, home: p.score.home, awayId: game.away, homeId: game.home, label: p.live ? 'Projected final score' : 'Projected final score (pregame)', awaySub: `${away}%`, homeSub: `${home}%`, needle: away / 100 };
  return { away, home, awayId: game.away, homeId: game.home, label: p.live ? 'Model win chance now' : 'Model win chance (pregame)', percent: true as const };
}
export function Projection({ game, before, baseline, feed, error, gauge = true }: { game: Game; before: any; baseline: any; feed?: GameFeed | null; error?: string | null; /** False when the Game Center shows this gauge up top beside the deserved-to-win one. */ gauge?: boolean }) {
  const p = projectGame(game, before, baseline, feed);
  const previous = useRef<{ id: number; probability: number; events: string } | null>(null);
  const [change, setChange] = useState<string | null>(null);
  const probability = p?.homeWin;
  const events = JSON.stringify((feed?.plays ?? []).filter(e => ['goal', 'penalty', 'shot-on-goal'].includes(e.type)).map(e => ({ id: e.id, type: e.type, team: e.team, player: e.player, time: e.time, period: e.period, penalty: e.penalty })));
  const latestEvent = [...(feed?.plays ?? [])].reverse().find((event) => event.type === "goal" || event.type === "penalty");
  const firstObservedChange = latestEvent
    ? `Current estimate updated after ${latestEvent.team ?? "the latest"} ${latestEvent.type === "goal" ? "goal" : `${latestEvent.penalty ?? ""} penalty`}${latestEvent.player ? ` (${latestEvent.player})` : ""} · P${latestEvent.period} ${latestEvent.time}. Percentage-point change is unavailable because this Game Center opened after the prior snapshot.`
    : "Tracking play changes from this update onward.";
  useEffect(() => {
    if (probability == null || !p?.live || !feed || error) return;
    const old = previous.current;
    if (old && old.id === game.id && (old.probability !== probability || old.events !== events)) {
      const oldEvents = JSON.parse(old.events);
      const added = JSON.parse(events).filter((e: any) => !oldEvents.some((o: any) => o.id === e.id));
      const significant = added.filter((e: any) => e.type !== 'shot-on-goal');
      const labels = significant.map((e: any) => `${e.team ?? ''} ${e.type === 'goal' ? 'goal' : `${e.penalty ?? ''} penalty`}${e.player ? ` (${e.player})` : ''} · P${e.period} ${e.time}`);
      const shots = added.filter((e: any) => e.type === 'shot-on-goal').length;
      if (shots) labels.push(`${shots} new shot${shots === 1 ? '' : 's'} on goal`);
      const delta = (probability - old.probability) * 100;
      setChange(`${game.home} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp · ${game.away} ${delta <= 0 ? '+' : ''}${(-delta).toFixed(1)} pp since previous update. ${labels.join('; ') || 'Clock, strength or feed correction'}${labels.length ? '; includes elapsed time and strength changes.' : '.'}`);
    } else if (!old || old.id !== game.id) setChange(null);
    previous.current = { id: game.id, probability, events };
  }, [probability, events, game.id, game.home, game.away, feed, error, p?.live]);
  if (!p) return null;
  const home = Math.round(p.homeWin * 100), away = 100 - home;
  const winner = home === away ? 'Too close to call' : `${home > away ? game.home : game.away} favored`;
  return <section className="projection" aria-label={p.live ? 'Live winner projection' : 'Pregame projection'}>
    <div className="mini-heading">{p.live ? 'LIVE PROJECTION' : 'PREGAME PROJECTION'}<span>Model estimate</span></div>
    <div className="prediction-head"><strong>{winner}</strong>{p.score && <b aria-label="Projected final score">{game.away} {p.score.away} – {p.score.home} {game.home}</b>}</div>
    <div className="prediction-labels"><span>{game.away} {away}%</span><span>{game.home} {home}%</span></div>
    {gauge && <div className="gauge-lone"><Gauge size={p.live || game.state === "FINAL" || game.state === "OFF" ? "compact" : "standard"} away={away} home={home} awayId={game.away} homeId={game.home} label={p.live ? "Model win chance now (score, time, shots)" : "Pregame win chance (model)"} percent /></div>}
    <p className="detail-note">{p.live ? p.factors.join(' ') : 'Most likely final score · includes an OT / shootout winner'}</p>
    {p.live && p.score && <p className="detail-note">Projected final score · most likely outcome, including OT if needed</p>}
    {p.live && <p className="prediction-change" aria-live="polite">{change ?? firstObservedChange}</p>}
    {p.live && <p className="detail-note">Injury impact unavailable: this feed does not confirm live player injuries.</p>}
    {p.live && <p className="feed-time">{error ? 'Detailed feed delayed; estimate may be stale.' : `Snapshot ${feed ? new Date(feed.updatedAt).toLocaleTimeString() : 'awaiting detailed feed'} · checks every 30s`}</p>}
    <details className="inner-details"><summary>How this estimate works</summary><p className="detail-note">Season goals for and against are blended with 20 games of prior-season context (or a 3-goal league baseline). Last five games add a small form adjustment; home ice adds 0.12 goals. Live estimates use the score, regulation time remaining and a capped shot adjustment, including the last ten minutes when available. Confirmed power plays raise the attacking goal rate by 170% (240% for a two-skater advantage) and lower the short-handed rate by 35%, only for the reported remaining advantage time. These are heuristic weights. Coincidental penalties do not receive an automatic boost. Tied regulation outcomes receive an estimated OT / shootout winner. Uncalibrated Poisson model; excludes unconfirmed injuries, lineups, goalie changes and empty-net tactics. Changes compare successive observed snapshots, not isolated causal effects of a single play. Percentages are estimates, not guarantees. The most likely score can differ from the favored team because many scorelines contribute to win chance.</p></details>
  </section>;
}
