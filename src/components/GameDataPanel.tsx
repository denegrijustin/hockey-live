import { useState, useMemo, type ComponentProps } from "react";
import type { Game, GameFeed, Team } from "../types";
import { useGameFeedData } from "../lib/use-game-feed";
import { Projection } from "./Projection";
import { isLive } from "../lib/game-data.mjs";
import { LogoImage, TeamLogo } from "./TeamLogo";
import { Gauge } from "./Gauge";
import { gameFlow, iceTilt, playMinute, pulseMinute } from "../lib/pulse.mjs";
import { useChartUnit } from "../lib/chartUnit";
import { useVisible, GameFlowChart } from "./GameData";
import "./gauge.css";
/** One head-to-head number, drawn as a gas gauge. */
export function ComparisonBar({ label, away, home, awayId, homeId, format, size = "sm" }: { label: string; away: number; home: number; awayId: string; homeId: string; format?: (v: number) => string; size?: ComponentProps<typeof Gauge>["size"]; awayColor?: string; homeColor?: string }) {
  return <Gauge size={size} away={away} home={home} awayId={awayId} homeId={homeId} label={label} format={format} />;
}
export function GameData({
  game,
  home,
  away,
  before,
  baseline,
  eager = false,
}: {
  game: Game;
  home: Team;
  away: Team;
  before: any;
  baseline: any;
  /** Load at once instead of when scrolled into view (the Game Center is already open on it). */
  eager?: boolean;
}) {
  const { ref, visible: seen } = useVisible();
  const visible = eager || seen;
  const played = ["LIVE", "CRIT", "OFF", "FINAL"].includes(game.state);
  const { data, error } = useGameFeedData(visible && played ? game : null);
  if (!played)
    return (
      <div ref={ref} className="form-chart">
        <Projection game={game} before={before} baseline={baseline} />
        <div className="mini-heading">
          RECENT FORM <span>Last 5 regular-season games</span>
        </div>
        {[away, home].map((t) => {
          const recent = before[t.id]?.results ?? [],
            rows = (
              recent.length ? recent : (baseline?.[t.id]?.results ?? [])
            ).slice(-5);
          return (
            <div className="form-team" key={t.id}>
              <b>{t.id}</b>
              <div className="form-results">
                {rows.length ? (
                  rows.map((r: any, i: number) => (
                    <span
                      key={i}
                      className={
                        r.outcome === "W"
                          ? "form-win"
                          : r.outcome === "OT"
                            ? "form-ot"
                            : "form-loss"
                      }
                      title={`${r.date}: ${r.gf}–${r.ga}`}
                    >
                      {r.outcome}
                      <small>
                        {r.gf}–{r.ga}
                      </small>
                    </span>
                  ))
                ) : (
                  <span className="detail-note">No results yet</span>
                )}
              </div>
              <small>
                {recent.length ? "Current season" : "Previous season"}
              </small>
            </div>
          );
        })}
      </div>
    );
  return (
    <div ref={ref} className="game-data">
      <Projection game={game} before={before} baseline={baseline} feed={data} error={error} gauge={!eager} />
      {!data ? (
        <p className="detail-note">
          {error
            ? "Game statistics unavailable. Retrying automatically…"
            : "Loading game statistics…"}
        </p>
      ) : (
        <>
          <div className="mini-heading">
            {isLive(data) ? "LIVE GAME FLOW" : "GAME FLOW"}
            <span>
              {data.periodType === "OT" ? "OT" : `P${data.period ?? "—"}`} ·{" "}
              {data.intermission ? "Intermission" : (data.clock ?? "Final")}
            </span>
          </div>
          <GameFlowChart data={data} home={home} away={away} />
          <div className="mini-heading">HITS <span>Cumulative</span></div>
          {data.plays ? <ShotChart data={data} home={home} away={away} metric="hits" /> : <p className="detail-note">Hit timeline unavailable in this saved snapshot.</p>}
          <div className="mini-heading">SHOTS ON GOAL <span>Cumulative · same time scale</span></div>
          <ShotChart data={data} home={home} away={away} />
          <IceTilt data={data} />
          <div className="gauge-grid game-stat-gauges">
            <div className="gauge-item"><ComparisonBar
              size="compact"
              label="Shots on goal"
              away={data.awayShots ?? 0}
              home={data.homeShots ?? 0}
              awayId={away.id}
              homeId={home.id}
            /></div>
            {data.stats
              .filter((s) => ["hit", "blocked-shot"].includes(s.label))
              .map((s) => (
                <div key={s.label} className="gauge-item"><ComparisonBar
                  size="compact"
                  label={s.label === "hit" ? "Hits" : "Blocks"}
                  away={s.away}
                  home={s.home}
                  awayId={away.id}
                  homeId={home.id}
                /></div>
              ))}
          </div>
          <p className="feed-time">
            {error ||
              `Received ${new Date(data.updatedAt).toLocaleTimeString()}${isLive(data) ? " · checks every 30s" : ""}`}
          </p>
          <details className="inner-details">
            <summary>Shot map & scoring</summary>
            <svg
              className="shot-map"
              viewBox="-105 -47.5 210 95"
              role="img"
              aria-label="Shots on goal at recorded rink coordinates"
            >
              <rect x="-100" y="-42.5" width="200" height="85" rx="24" />
              <path d="M0 -42.5V42.5 M-25 -42.5V42.5 M25 -42.5V42.5" />
              <circle cx="0" cy="0" r="15" className="rink-circle" />
              {data.shots
                .filter((s) => s.x !== null && s.y !== null)
                .map((s) => (
                  <circle
                    key={s.id}
                    cx={s.x!}
                    cy={-s.y!}
                    r={s.type === "goal" ? 3 : 1.5}
                    fill={s.team === home.id ? "var(--series-home)" : "var(--series-away)"}
                    stroke={s.type === "goal" ? "white" : "none"}
                  >
                    <title>
                      {s.team} {s.type} P{s.period} {s.time}
                    </title>
                  </circle>
                ))}
            </svg>
            <p className="detail-note">
              Recorded rink coordinates; teams switch ends. Larger outlined dots
              are goals. Shootout attempts are excluded.
            </p>
            {data.goals.length ? (
              <ol className="goal-list">
                {data.goals.map((g) => (
                  <li key={g.id}>
                    <b>{g.team}</b> {g.player ?? "Goal"}{" "}
                    <span>
                      P{g.period} · {g.time}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="detail-note">No goals recorded.</p>
            )}
          </details>
        </>
      )}
    </div>
  );
}


function ShotChart({
  data,
  home,
  away,
  metric = "shots",
}: {
  metric?: "shots" | "hits";
  data: GameFeed;
  home: Team;
  away: Team;
}) {
  const [inspectTime, setInspectTime] = useState<number | null>(null);
  const chartRef = useChartUnit<SVGSVGElement>(360);
  const events = metric === "shots" ? data.shots : (data.plays ?? []).filter(p=>p.type === 'hit');
  const minutes = (s: any) => playMinute(s,data.type) ?? 0;
  const elapsed = pulseMinute(data) ?? Math.max(0,...events.map(minutes));
  const end = Math.max(20, Math.ceil(elapsed / 20) * 20);
  const countFor = (id:string) => events.filter(s=>s.team===id && minutes(s)<=elapsed).length;
  const max = Math.max(1,countFor(home.id),countFor(away.id));
  const at = Math.min(elapsed, inspectTime ?? elapsed);
  const totalAt = (id:string) => events.filter(s=>s.team===id && minutes(s)<=at + 1e-8).length;
  const seconds=Math.round(at*60);
  const periodLength = data.type===3 ? 1200 : 300;
  const period=seconds<=3600 ? Math.max(1,Math.ceil(seconds/1200)) : 4+Math.floor((seconds-3600-1)/periodLength);
  const inPeriod=seconds<=3600 ? seconds-(period-1)*1200 : seconds-3600-(period-4)*periodLength;
  const timeLabel=`${period<=3?`P${period}`:`OT${period-3}`} ${Math.floor(inPeriod/60)}:${String(inPeriod%60).padStart(2,'0')} elapsed`;
  const inspect = (event: React.PointerEvent<SVGSVGElement>) => {
    const matrix=event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    setInspectTime(Math.round(Math.max(0,Math.min(elapsed,(point.x-24)/326*end))*60)/60);
  };
  return (
    <div className="interactive-pulse" data-metric={metric}>
    <div className="pulse-readout" aria-live="off">
      <small>{timeLabel} · {inspectTime == null ? 'Latest' : 'Selected point'}</small>
      <div>{[away,home].map((team,i)=><span key={team.id}><TeamLogo id={team.id} size={26} alt={team.name} /><b>{team.id}</b><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={i?'4 3':undefined}/></svg><strong>{totalAt(team.id)} {metric === 'hits'?'hits':'SOG'}</strong></span>)}</div>
    </div>
    <svg
      ref={chartRef}
      onPointerMove={inspect}
      onPointerDown={inspect}
      onPointerLeave={event=>{if(event.pointerType==='mouse') setInspectTime(null);}}
      className={`shot-chart ${metric === "hits" ? "hit-chart" : ""}`}
      viewBox="0 0 360 115"
      role="img"
      aria-label={`${away.id} ${countFor(away.id)}, ${home.id} ${countFor(home.id)} ${metric === "hits" ? "hits" : "shots on goal"}`}
    >
      <path d="M24 10V92H350" className="chart-axis" />
      <text x="20" y="15" textAnchor="end">{max}</text>
      <text x="20" y="92" textAnchor="end">0</text>
      {[20, 40, 60]
        .filter((n) => n <= end)
        .map((n) => (
          <g key={n}>
            <line
              x1={24 + (n / end) * 326}
              x2={24 + (n / end) * 326}
              y1="10"
              y2="92"
            />
            <text x={24 + (n / end) * 326} y="108" textAnchor="end">
              {n}m
            </text>
          </g>
        ))}
      {[away, home].map((t) => {
        let count = 0;
        const points = ["24,92"];
        for (const shot of events.filter((s) => s.team === t.id && minutes(s)<=elapsed).sort((a,b)=>minutes(a)-minutes(b))) {
          const x = 24 + (minutes(shot) / end) * 326;
          points.push(`${x},${92 - (count / max) * 76}`);
          count++;
          points.push(`${x},${92 - (count / max) * 76}`);
        }
        points.push(`${24 + elapsed/end*326},${92 - (count / max) * 76}`);
        return (
          <polyline
            key={t.id}
            points={points.join(" ")}
            stroke={t.id === away.id ? "var(--series-away)" : "var(--series-home)"}
            fill="none"
            strokeWidth="2.5"
            strokeDasharray={t.id === home.id ? "5 3" : undefined}
          />
        );
      })}
      <line x1={24+at/end*326} x2={24+at/end*326} y1="10" y2="92" stroke="var(--text-4)" strokeDasharray="2 3" />
    </svg>
    <input className="pulse-scrubber" type="range" min="0" max={Math.max(1,Math.round(elapsed*60))} value={seconds} step="1" aria-label={`${metric === 'hits' ? 'Hits' : 'Shots'} timeline time`} aria-valuetext={`${timeLabel}; ${away.id} ${totalAt(away.id)}, ${home.id} ${totalAt(home.id)}`} onChange={e=>setInspectTime(Number(e.target.value)/60)} />
    <small className="detail-note">Hover, tap or use the slider to inspect totals.</small>
    </div>
  );
}

function IceTilt({data}:{data:GameFeed}) {
 const tilt=iceTilt(data);
 if (!tilt) return <p className="detail-note">Ice-tilt estimate unavailable in this snapshot.</p>;
 const h=tilt.homeShare==null?null:Math.round(tilt.homeShare*100);
 return <div className="ice-tilt"><div className="mini-heading">ICE TILT <span>Shot-pressure proxy · all strengths</span></div>
 <div className="prediction-labels"><span>{data.away} {h==null?'—':`${100-h}%`}</span><span>{data.home} {h==null?'—':`${h}%`}</span></div>
 <div className="gauge-lone"><ComparisonBar size="standard" label="Unblocked attempts" away={tilt.away} home={tilt.home} awayId={data.away} homeId={data.home} /></div>
 <p className="detail-note">{h==null?'No unblocked attempts in this window.':`${h===50?'Even pressure':`${h>50?data.home:data.away} has more shot pressure`}.`} Last {tilt.minutes.toFixed(1)} playing minutes: shots on goal + missed shots (goals counted once). Includes power plays. This estimates pressure, not measured offensive-zone possession or live NHL EDGE zone time.</p></div>;
}
