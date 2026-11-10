import { useId, useMemo, useRef, useState } from "react";
import { useGameCenter } from "./GameCenterContext";
import { useChartUnit } from "../../lib/chartUnit";
import { gaugeColors } from "../../lib/kits";
import { useGameShots } from "../../lib/moneypuck-client";
import { chanceFlow } from "../../lib/nhlplus.mjs";
import { createFlow, describeFlow, pointAt, readoutText, periodLabel, clockAt, FLOW_WEIGHTS, FLOW_REF, FLOW_WINDOW_SEC } from "../../lib/flow.mjs";
import "./flow.css";

/**
 * Momentum pane: "Iceboard metric: shot-attempt pressure" (derived; src/lib/flow.mjs, docs/phase5-momentum.md).
 * Team-relative timeline: HOME pressure rises above the centre line (solid), AWAY below it (hatched), so the two sides
 * differ by position and pattern as well as colour. Period boundaries, goal markers, penalty markers and power-play
 * bands come from the feed (strength only from `sit`). Inspect with the slider (arrow keys), pointer or tap.
 * Optional, clearly separate: MoneyPuck xG flow for completed games.
 */
const W = 360, H = 176, L = 34, R = 352, TOP = 16, BOT = 138, MID = (TOP + BOT) / 2, AMP = (BOT - TOP) / 2 - 2;

export default function MomentumPane() {
  const { game, feed, plays, error, stale, live } = useGameCenter();
  const uid = useId().replace(/:/g, "");
  const chartRef = useChartUnit<SVGSVGElement>(W);
  const gameType = feed?.type ?? game.type ?? 2;
  const engine = useMemo(() => createFlow({ home: game.home, away: game.away, gameType, roster: feed?.roster }), [game.id, game.home, game.away, gameType, feed?.roster]);
  const seen = useRef<{ engine: unknown; n: number; first: unknown; last: unknown }>({ engine: null, n: 0, first: null, last: null });
  const lastPlay = plays[plays.length - 1];
  const series: any = useMemo(() => {
    const s = seen.current;
    // append-only fast path: push only the new tail when the prefix is unchanged, otherwise hand everything over (the engine dedupes and rebuilds)
    const appendOnly = s.engine === engine && s.n <= plays.length && (s.n === 0 || (plays[0]?.id === s.first && plays[s.n - 1]?.id === s.last));
    engine.push(appendOnly ? plays.slice(s.n) : plays);
    seen.current = { engine, n: plays.length, first: plays[0]?.id ?? null, last: lastPlay?.id ?? null };
    return engine.series();
  }, [engine, plays, plays.length, lastPlay?.id, lastPlay?.order]);

  const [zoom, setZoom] = useState<number | null>(null); // period number or null = full game
  const [cursor, setCursor] = useState<number | null>(null);
  const [xgOpen, setXgOpen] = useState(false);
  const colors = useMemo(() => gaugeColors(game.away, game.home), [game.away, game.home]);

  if (!series) {
    return (
      <section className="mo" data-testid="momentum-chart" data-state="empty" aria-label="Momentum">
        <Heading />
        <p className="mo-empty">{error && !feed ? "Play-by-play could not be loaded." : "No play-by-play yet."} The shot-attempt pressure line appears once the NHL feed lists plays for this game.</p>
      </section>
    );
  }

  const zp = zoom != null ? series.periods.find((p: any) => p.period === zoom) : null;
  const v0 = zp ? zp.start : 0;
  const v1 = zp ? zp.end : series.duration;
  const x = (t: number) => L + ((t - v0) / (v1 - v0)) * (R - L);
  const y = (v: number) => MID - v * AMP;
  const inView = series.points.filter((p: any) => p.t >= v0 && p.t <= v1);
  const elapsed = Math.min(series.elapsed, v1);
  const tCur = cursor == null ? Math.min(series.elapsed, v1) : Math.min(Math.max(cursor, v0), Math.min(series.elapsed, v1));
  const sel = pointAt(series, tCur);
  const readout = readoutText(series, sel);
  const area = (sign: 1 | -1) => {
    if (!inView.length) return "";
    let d = `M ${x(inView[0].t).toFixed(1)} ${MID}`;
    for (const p of inView) d += ` L ${x(p.t).toFixed(1)} ${y(sign === 1 ? Math.max(0, p.value) : Math.min(0, p.value)).toFixed(1)}`;
    return d + ` L ${x(inView.at(-1).t).toFixed(1)} ${MID} Z`;
  };
  const goals = series.goals.filter((g: any) => g.t >= v0 && g.t <= v1);
  const pens = series.penalties.filter((p: any) => p.t >= v0 && p.t <= v1);
  const bands = series.bands.filter((b: any) => b.end > v0 && b.start < v1);
  const total = series.totals;
  const lead = series.latest.value;
  const summary = `Shot-attempt pressure, ${game.away} at ${game.home}. ${describeFlow(series)}`;
  const step = series.step as number;
  const inspectAt = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setCursor(Math.round((v0 + ((px - L) / (R - L)) * (v1 - v0)) / step) * step);
  };
  const periodTicks = series.periods.filter((p: any) => p.end > v0 && p.start < v1);
  const isFinal = ["OFF", "FINAL"].includes(game.state);

  return (
    <section className="mo" data-testid="momentum-chart" data-state={live ? "live" : isFinal ? "final" : "ready"} data-points={series.points.length} aria-label="Momentum">
      <Heading />
      {stale && <p className="mo-note" role="status">Live data may be out of date; the line shows what was last received.</p>}
      <div className="mo-controls" role="group" aria-label="Zoom to a period">
        <button type="button" className="mo-btn" aria-pressed={zoom == null} onClick={() => { setZoom(null); setCursor(null); }}>Full game</button>
        {series.periods.filter((p: any) => p.seen).map((p: any) => (
          <button key={p.period} type="button" className="mo-btn" aria-pressed={zoom === p.period} aria-label={`Zoom to the ${p.label} period`} onClick={() => { setZoom(p.period); setCursor(null); }}>{p.label}</button>
        ))}
      </div>
      <p className="mo-readout" data-testid="momentum-readout"><strong>{readout}</strong></p>
      <svg ref={chartRef} className="mo-svg" data-testid="momentum-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} onPointerMove={(e) => { if (e.pointerType === "mouse") inspectAt(e); }} onPointerDown={inspectAt}>
        <defs>
          <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={colors.away} fillOpacity="0.18" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={colors.away} strokeWidth="2.2" />
          </pattern>
        </defs>
        {elapsed < v1 && <rect className="mo-future" x={x(elapsed)} y={TOP} width={x(v1) - x(elapsed)} height={BOT - TOP} />}
        {bands.map((b: any, i: number) => {
          const home = b.team === game.home;
          const bx0 = x(Math.max(b.start, v0)), bx1 = x(Math.min(b.end, v1));
          return <g key={`b${i}`} className="mo-pp" data-team={b.team}><rect x={bx0} y={home ? TOP : MID} width={Math.max(1, bx1 - bx0)} height={(BOT - TOP) / 2} fill={home ? colors.home : colors.away} /><title>{`${b.team} power play ${b.strength}, ${clockAt(b.start, series.gameType)} to ${clockAt(b.end, series.gameType)} (to the nearest recorded event)`}</title></g>;
        })}
        {periodTicks.map((p: any) => (
          <g key={p.period} className="mo-period">
            {p.start > v0 && <line x1={x(p.start)} x2={x(p.start)} y1={TOP} y2={BOT + 4} />}
            <text x={(x(Math.max(p.start, v0)) + x(Math.min(p.end, v1))) / 2} y={H - 18} textAnchor="middle">{p.label}</text>
          </g>
        ))}
        <path d={area(1)} className="mo-home" fill={colors.home} fillOpacity="0.62" stroke={colors.home} strokeWidth="1.2" />
        <path d={area(-1)} className="mo-away" fill={`url(#${uid}-hatch)`} stroke={colors.away} strokeWidth="1.2" />
        <line className="mo-zero" x1={L} x2={R} y1={MID} y2={MID} />
        <text className="mo-side" x={4} y={TOP + 9}>{game.home}</text>
        <text className="mo-side" x={4} y={BOT - 2}>{game.away}</text>
        {goals.map((g: any, i: number) => {
          const home = g.team === game.home;
          const cy = home ? TOP + 3 : BOT - 3;
          return <g key={`g${i}`} className="mo-goal" data-team={g.team}><line x1={x(g.t)} x2={x(g.t)} y1={MID} y2={cy} /><circle cx={x(g.t)} cy={cy} r="4" fill={home ? colors.home : colors.away} /><title>{`Goal ${g.team}, ${periodLabel(g.period)} ${g.clock}${g.score ? `, ${game.away} ${g.score.away} - ${game.home} ${g.score.home}` : ""}`}</title></g>;
        })}
        {pens.map((p: any, i: number) => (
          <g key={`p${i}`} className="mo-pen" data-team={p.team}><path d={`M ${x(p.t) - 3} ${BOT + 11} h 6 l -3 -6 z`} /><title>{`Penalty ${p.team}${p.minutes ? `, ${p.minutes} min` : ""}${p.infraction ? `, ${p.infraction.replace(/-/g, " ")}` : ""}, ${periodLabel(p.period)} ${p.clock}`}</title></g>
        ))}
        <line className="mo-cursor" x1={x(tCur)} x2={x(tCur)} y1={TOP - 4} y2={BOT + 4} />
        <circle className="mo-dot" cx={x(tCur)} cy={y(sel.value)} r="3.6" />
      </svg>
      <input
        className="mo-scrub" type="range" min={v0} max={Math.max(v0 + step, Math.floor(Math.min(series.elapsed, v1)))} step={step} value={Math.round(tCur / step) * step}
        aria-label="Inspect the timeline" aria-valuetext={readout} onChange={(e) => setCursor(Number(e.target.value))}
      />
      <ul className="mo-legend" aria-label="Chart key">
        <li><span className="mo-key mo-key-home" style={{ background: colors.home }} aria-hidden="true" /> {game.home} (home) above the line</li>
        <li><span className="mo-key mo-key-away" style={{ borderColor: colors.away }} aria-hidden="true" /> {game.away} (away) below, hatched</li>
        <li><span className="mo-key mo-key-goal" aria-hidden="true" /> goal</li>
        <li><span className="mo-key mo-key-pen" aria-hidden="true" /> penalty</li>
        <li><span className="mo-key mo-key-pp" aria-hidden="true" /> power play{series.hasSit ? "" : " (no strength data in this feed)"}</li>
      </ul>
      <p className="mo-label" data-testid="momentum-label"><span className="mo-badge">Derived</span> Iceboard metric: shot-attempt pressure — not possession, not xG, not win probability.</p>
      <details className="mo-how">
        <summary>How this is calculated</summary>
        <div>
          <p>Every shot attempt is credited to the shooting team: goal {FLOW_WEIGHTS.goal.toFixed(2)} (counted once), shot on goal {FLOW_WEIGHTS["shot-on-goal"].toFixed(2)}, missed shot {FLOW_WEIGHTS["missed-shot"].toFixed(2)}, blocked shot {FLOW_WEIGHTS["blocked-shot"].toFixed(2)}. Shots with a recorded spot are weighted up to 1.6x when taken close to the net (the same high-danger zone as the shot maps); no spot, no adjustment. Hits, faceoffs, takeaways and penalties are not part of the number. Shootout attempts are left out.</p>
          <p>At each 10-second step a team&apos;s pressure is the sum of its attempts from the last {FLOW_WINDOW_SEC / 60} minutes, each fading linearly to zero as it ages. The line is (home minus away) divided by a fixed {FLOW_REF}, limited to the range -1 to +1, so values compare across games. Positive favours {game.home}.</p>
          <p>Power-play bands use the feed&apos;s skater counts and are accurate to the nearest recorded event, not the second; penalties are markers only. Overtime periods are {series.gameType === 3 ? "20" : "5"} minutes in this game type. This is an activity index from recorded shot attempts, not tracked possession.</p>
        </div>
      </details>
      <div className="mo-summary" data-testid="momentum-summary">
        <p className="mo-text">{describeFlow(series)}</p>
        <table className="mo-table">
          <caption>Shot attempts by period (weighted by the metric above)</caption>
          <thead><tr><th scope="col">Period</th><th scope="col">{game.home} (home)</th><th scope="col">{game.away} (away)</th><th scope="col">Led by</th></tr></thead>
          <tbody>
            {series.perPeriod.map((p: any) => (
              <tr key={p.period}><th scope="row">{p.label}</th><td>{p.home.att} att · {p.home.w.toFixed(1)}</td><td>{p.away.att} att · {p.away.w.toFixed(1)}</td><td>{p.leader ?? "Even"}</td></tr>
            ))}
            <tr className="mo-total"><th scope="row">Game</th><td>{total.home.att} att · {total.home.w.toFixed(1)}</td><td>{total.away.att} att · {total.away.w.toFixed(1)}</td><td>{Math.abs(total.home.w - total.away.w) < Math.max(0.15, 0.1 * (total.home.w + total.away.w)) ? "Even" : total.home.w > total.away.w ? game.home : game.away}</td></tr>
          </tbody>
        </table>
        <p className="mo-meta">Latest value {lead >= 0 ? "+" : "-"}{Math.abs(lead).toFixed(2)} ({lead > 0.05 ? game.home : lead < -0.05 ? game.away : "even"}). {series.dropped ? `${series.dropped} play(s) with an unusable clock were left out.` : ""}</p>
      </div>
      {isFinal && (
        <details className="mo-xg" onToggle={(e) => setXgOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>Expected-goals flow (MoneyPuck, completed games)</summary>
          {xgOpen && <XgFlow season={game.season} id={game.id} home={game.home} away={game.away} duration={series.duration} colors={colors} />}
        </details>
      )}
    </section>
  );
}

function Heading() {
  return <h3 className="mo-title">Momentum <span className="mo-sub">shot-attempt pressure</span></h3>;
}

/** Separate source: cumulative xG from MoneyPuck shots. Never mixed with the pressure line above. */
function XgFlow({ season, id, home, away, duration, colors }: { season: number; id: number; home: string; away: string; duration: number; colors: { home: string; away: string } }) {
  const mp = useGameShots(season ?? 0, id ?? 0, true);
  const shots = mp.data?.shots;
  if (!shots) return <p className="mo-note">{mp.state === "loading" ? "Loading MoneyPuck shot data…" : "Expected-goals data is not available for this game (MoneyPuck keeps shot detail for recent completed games only)."}</p>;
  const pts = chanceFlow(shots, home, away, {}) as { t: number; home: number; away: number }[];
  const top = Math.max(0.5, ...pts.map((p) => Math.max(p.home, p.away)));
  const X = (t: number) => L + (Math.min(t, duration) / duration) * (R - L);
  const Y = (v: number) => 110 - (v / top) * 90;
  const path = (k: "home" | "away") => pts.map((p, i) => `${i ? "L" : "M"} ${X(p.t).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="mo-xg-body" data-testid="momentum-xg">
      <p className="mo-label"><span className="mo-badge">MoneyPuck</span> Cumulative expected goals (xG). A separate source from the pressure line; not momentum and not win probability.</p>
      <svg className="mo-svg mo-svg-xg" viewBox={`0 0 ${W} 124`} role="img" aria-label={`Cumulative expected goals: ${home} ${last.home.toFixed(2)}, ${away} ${last.away.toFixed(2)}`}>
        <line className="mo-zero" x1={L} x2={R} y1={110} y2={110} />
        <path d={path("home")} fill="none" stroke={colors.home} strokeWidth="2.4" />
        <path d={path("away")} fill="none" stroke={colors.away} strokeWidth="2.4" strokeDasharray="5 3" />
      </svg>
      <p className="mo-meta">{home} (solid) {last.home.toFixed(2)} xG · {away} (dashed) {last.away.toFixed(2)} xG</p>
    </div>
  );
}
