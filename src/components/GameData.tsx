import { useChartUnit } from "../lib/chartUnit";
import { gameFlow, playMinute } from "../lib/pulse.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Game, GameFeed, Team } from "../types";
import { useFeed } from "../lib/polling";
import { isLive } from "../lib/game-data.mjs";
import { LogoImage, TeamLogo } from "./TeamLogo";
import { useGameShots } from "../lib/moneypuck-client";
import { attemptsOf, HIGH_XG } from "../lib/game-recap.mjs";
export function useVisible() {
  const ref = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "100px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}
/** One fetch of the game feed for a small card, shared by everything on the card that draws from it (the flow chart, the ice view, the goal flash). */
export function useCardFeed(game: Game, enabled = true) {
  const { ref, visible } = useVisible();
  const played = ["LIVE", "CRIT", "OFF", "FINAL"].includes(game.state);
  const { data } = useFeed<GameFeed>(
    enabled && visible && played ? `/api/game/${game.id}?score=${game.awayScore ?? "x"}-${game.homeScore ?? "x"}` : null,
    isLive(game) ? 30000 : 3600000,
  );
  return { ref, data };
}

export function CompactGameFlow({ data, home, away }: { data: GameFeed | null; home: Team; away: Team }) {
  return data?.plays?.length ? <GameFlowChart data={data} home={home} away={away} compact /> : null;
}

function flowTimeLabel(minute: number, gameType: number) {
  const seconds = Math.max(0, Math.round(minute * 60));
  const overtimeLength = gameType === 3 ? 1200 : 300;
  const period = seconds <= 3600 ? Math.max(1, Math.ceil(Math.max(1, seconds) / 1200)) : 4 + Math.floor((seconds - 3601) / overtimeLength);
  const inPeriod = seconds <= 3600 ? seconds - (period - 1) * 1200 : seconds - 3600 - (period - 4) * overtimeLength;
  return `${period <= 3 ? `P${period}` : `OT${period - 3}`} ${Math.floor(inPeriod / 60)}:${String(inPeriod % 60).padStart(2, "0")} elapsed`;
}

function smoothFlowPath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index++) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    const control1 = { x: current.x + (next.x - previous.x) / 6, y: current.y + (next.y - previous.y) / 6 };
    const control2 = { x: next.x - (after.x - current.x) / 6, y: next.y - (after.y - current.y) / 6 };
    path += ` C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${next.x} ${next.y}`;
  }
  return path;
}

function fullGameMinutes(data: GameFeed, elapsed: number) {
  if (data.type === 3 && (data.period ?? 0) > 3)
    return Math.max(60, Math.ceil(elapsed / 20) * 20);
  if (elapsed > 60 || ["OT", "SO"].includes(data.periodType ?? "")) return 65;
  return 60;
}

export function GameFlowChart({ data, home, away, compact = false }: { data: GameFeed; home: Team; away: Team; compact?: boolean }) {
  const flow = gameFlow(data);
  const [inspect, setInspect] = useState<number | null>(null);
  const chartRef = useChartUnit<SVGSVGElement>(360);
  const over = ["OFF", "FINAL"].includes(data.state);
  const mp = useGameShots(data.season ?? 0, data.id ?? 0, over);
  const chances = useMemo(() => (data.plays?.length ? attemptsOf(data, over ? mp.data : null).list.filter((a: any) => a.xg >= HIGH_XG) : []), [data, mp.data, over]);
  if (!flow?.points.length) return null;
  const width = 360, height = compact ? 64 : 142, left = compact ? 8 : 28, right = compact ? 352 : 350;
  const center = compact ? 25 : 65;
  const amplitude = compact ? 17 : 48;
  const elapsed = Math.max(0, flow.points.at(-1)!.minute);
  const end = fullGameMinutes(data, elapsed);
  const max = Math.max(1, ...flow.points.map((point: any) => Math.abs(point.value)));
  const x = (minute: number) => left + (minute / end) * (right - left);
  const y = (value: number) => center - (value / max) * amplitude;
  const selected = inspect == null ? flow.points.at(-1)! : flow.points.reduce((best: any, point: any) => Math.abs(point.minute - inspect) < Math.abs(best.minute - inspect) ? point : best);
  const leader = Math.abs(selected.value) < 0.05 ? null : selected.value > 0 ? home : away;
  const windowEvents = (data.plays ?? []).filter((play: any) => {
    const minute = playMinute(play, data.type);
    return minute != null && minute <= selected.minute && minute >= Math.max(0, selected.minute - flow.windowMinutes) && ["goal", "shot-on-goal", "missed-shot", "blocked-shot"].includes(play.type);
  });
  const eventSummary = [
    ["goal", "goal"], ["shot-on-goal", "SOG"], ["missed-shot", "miss"], ["blocked-shot", "block"],
  ].map(([type, label]) => {
    const count = windowEvents.filter((event: any) => event.type === type).length;
    return count ? `${count} ${label}${count === 1 || label === "SOG" ? "" : "s"}` : null;
  }).filter(Boolean).join(" · ");
  const inspectAt = (event: React.PointerEvent<SVGSVGElement>) => {
    if (compact) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    setInspect(Math.max(0, Math.min(elapsed, ((point.x - left) / (right - left)) * end)));
  };
  const id = `flow-${data.id}-${compact ? "compact" : "detail"}`;
  const curve = smoothFlowPath(flow.points.map((point: any) => ({ x: x(point.minute), y: y(point.value) })));
  const ticks = Array.from({ length: Math.floor(Math.min(60, end) / 20) + 1 }, (_, index) => index * 20);
  if (end > 60) ticks.push(end);
  return <div className={compact ? "compact-game-flow" : "game-flow"} data-testid={compact ? "compact-game-flow" : "game-flow"}>
    <div className="flow-readout">
      <span title="Iceboard metric: shot-attempt pressure">{compact ? "MOMENTUM" : `${flowTimeLabel(selected.minute, data.type)} · ${inspect == null ? "Latest" : "Selected point"}`}</span>
      <strong>{leader ? <><TeamLogo id={leader.id} /> {leader.id} +{Math.abs(selected.value).toFixed(2)}</> : "EVEN"}</strong>
    </div>
    <svg ref={chartRef} className="game-flow-chart" viewBox={`0 0 ${width} ${height}`} role="img" data-elapsed={elapsed.toFixed(2)} data-duration={end} data-progress={(elapsed / end).toFixed(3)} aria-label={`Full-game momentum through ${flowTimeLabel(elapsed, data.type)}: ${leader ? `${leader.name} ${Math.abs(selected.value).toFixed(2)}` : "even"}`} onPointerMove={inspectAt} onPointerDown={inspectAt} onPointerLeave={(event) => { if (!compact && event.pointerType === "mouse") setInspect(null); }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={home.color}/><stop offset="50%" stopColor="var(--text-2)"/><stop offset="100%" stopColor={away.color}/></linearGradient></defs>
      {ticks.map((minute) => <g key={minute} className="flow-time-mark"><line x1={x(minute)} x2={x(minute)} y1="7" y2={height - 19}/><text x={x(minute)} y={height - 5} textAnchor={minute === 0 ? "start" : minute === end ? "end" : "middle"}>{minute === 0 ? "START" : minute === end ? `END · ${minute}m` : `${minute}m`}</text></g>)}
      <line x1={left} x2={right} y1={center} y2={center} className="flow-zero" />
      <path className="flow-line" pathLength={1} d={curve} fill="none" stroke={`url(#${id})`} strokeWidth={compact ? 3 : 3.5} strokeLinejoin="round" strokeLinecap="round" />
      {chances.map((c: any, i: number) => {
        const minute = c.t / 60;
        if (minute > elapsed + 1e-6) return null;
        const near = flow.points.reduce((best: any, point: any) => Math.abs(point.minute - minute) < Math.abs(best.minute - minute) ? point : best);
        const cy = y(near.value) + (c.home ? -1 : 1) * (compact ? 6 : 8);
        return <circle key={`hc${i}`} cx={x(minute)} cy={cy} r={compact ? 2.6 : 3.4} className={`flow-chance${c.goal ? " goal" : ""}`} data-high="1" data-goal={c.goal ? "1" : undefined}><title>{`${c.goal ? "High-chance goal" : "High-chance shot"} · ${c.xg.toFixed(2)} xG · ${c.home ? home.id : away.id}${c.player ? ` · ${c.player}` : ""}`}</title></circle>;
      })}
      <line x1={x(elapsed)} x2={x(elapsed)} y1="7" y2={height - 19} className="flow-progress" />
      <circle cx={x(elapsed)} cy={y(flow.current)} r={compact ? 3.5 : 4.5} className="flow-progress-dot" />
      {!compact && <><line x1={x(selected.minute)} x2={x(selected.minute)} y1="10" y2={height - 14} className="flow-cursor"/><LogoImage id={home.id} x={3} y={4} size={20} /><LogoImage id={away.id} x={3} y={height - 27} size={20} /></>}
    </svg>
    {!compact && <><input className="pulse-scrubber" type="range" min="0" max={Math.max(1, Math.round(elapsed * 60))} value={Math.round(selected.minute * 60)} step="1" aria-label="Game momentum timeline" aria-valuetext={`${flowTimeLabel(selected.minute, data.type)}; ${leader ? `${leader.id} momentum ${Math.abs(selected.value).toFixed(2)}` : "even momentum"}`} onChange={(event) => setInspect(Number(event.target.value) / 60)} /><p className="detail-note">{eventSummary || "No shot attempts in this five-minute window."} Iceboard metric: shot-attempt pressure (goals, shots on goal, missed and blocked shots credited to the shooter, fading across five minutes; hits and penalties are not included). It is not possession, xG or win probability. The line fills the full-game timeline as play advances. Hover, tap or use the slider to inspect received data.</p></>}
  </div>;
}
