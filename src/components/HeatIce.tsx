import { useId, useMemo } from "react";
import type { GameFeed, Team } from "../types";
import { HIGH_DANGER_FT, NET_X } from "../lib/ice-view.mjs";
import { heatGrid, hotZones, iceTiltReading } from "../lib/heat-ice.mjs";
import { TeamLogo } from "./TeamLogo";

const AWAY = "var(--series-away)";
const HOME = "var(--series-home)";

/**
 * The ice as a heat map: where each team's attempts are coming from (cooling as the game goes on, so it shows where it is hot NOW), which way the ice is tilting
 * (the last ten minutes' share of attempts) and who is gaining on the ten minutes before. The away team is on the left, as on the shot map.
 */
export function HeatIce({ data, home, away }: { data: GameFeed | null; home: Team; away: Team }) {
  const clip = useId();
  const model = useMemo(() => {
    if (!data) return null;
    const grid = heatGrid(data as never);
    if (grid.shots < 3) return null;
    return { grid, zones: hotZones(grid, data as never), tilt: iceTiltReading(data as never) };
  }, [data]);
  if (!model) return null;
  const { grid, zones, tilt } = model;
  const live = !!tilt?.live || ["LIVE", "CRIT"].includes(data?.state ?? "");
  const cells: { x: number; y: number; o: number; home: boolean }[] = [];
  for (let i = 0; i < grid.home.length; i++) {
    const h = grid.home[i], a = grid.away[i], v = Math.max(h, a);
    const o = Math.min(0.85, Math.pow(v / grid.max, 0.8) * 0.85);
    if (o < 0.06) continue;
    cells.push({ x: (i % grid.cols) * 5 - 100, y: Math.floor(i / grid.cols) * 5 - 42.5, o, home: h >= a });
  }
  const pressed = tilt?.team ? (tilt.team === home.id ? "home" : "away") : null;
  const strength = tilt ? Math.min(1, Math.abs(tilt.share - 0.5) * 2.4) : 0;
  const teamOf = (id: string) => (id === home.id ? home : away);
  const zoneText = [zones.away && `${away.id} from ${zones.away.zone}`, zones.home && `${home.id} from ${zones.home.zone}`].filter(Boolean).join(" · ");
  const label = `Heat map: ${tilt?.team ? `${tilt.team} is tilting the ice, ${tilt.pct}% of attempts` : "even pressure"}${tilt?.gaining ? `; ${tilt.gaining.team} is gaining` : ""}${zoneText ? `; hottest: ${zoneText}` : ""}`;
  return (
    <section className="heat-ice" data-testid="heat-ice" aria-label={label}>
      <div className="mini-heading">HEAT &amp; TILT <span>{live ? "Where it is hot now" : "Whole game"}</span></div>
      <svg className="ice-rink heat-rink" viewBox="-105 -47.5 210 95" role="img" aria-label={label}>
        <defs>
          <clipPath id={clip}><rect x="-100" y="-42.5" width="200" height="85" rx="24" /></clipPath>
          <linearGradient id={`${clip}-tilt`} x1={pressed === "away" ? "0" : "1"} x2={pressed === "away" ? "1" : "0"} y1="0" y2="0">
            <stop offset="0" stopColor={pressed === "away" ? AWAY : HOME} stopOpacity={0.28 * strength} />
            <stop offset="0.7" stopColor={pressed === "away" ? AWAY : HOME} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="-100" y="-42.5" width="200" height="85" rx="24" className="ice-sheet" />
        <g clipPath={`url(#${clip})`}>
          <circle cx={-NET_X} cy="0" r={HIGH_DANGER_FT} className="ice-danger" />
          <circle cx={NET_X} cy="0" r={HIGH_DANGER_FT} className="ice-danger" />
          <path d="M0 -42.5V42.5" className="ice-red" />
          <path d="M-25 -42.5V42.5M25 -42.5V42.5" className="ice-blue" />
          <path d={`M-${NET_X} -42.5V42.5M${NET_X} -42.5V42.5`} className="ice-goalline" />
          <circle cx="0" cy="0" r="15" className="ice-mark blue" />
          {pressed && <rect x="-100" y="-42.5" width="200" height="85" fill={`url(#${clip}-tilt)`} />}
          <g className="heat-cells">
            {cells.map((c) => <rect key={`${c.x}:${c.y}`} x={c.x} y={c.y} width="5" height="5" fill={c.home ? HOME : AWAY} opacity={c.o} />)}
          </g>
        </g>
        <rect x={-NET_X - 3} y="-3" width="3" height="6" className="ice-net" />
        <rect x={NET_X} y="-3" width="3" height="6" className="ice-net" />
        {pressed && (
          <g className="tilt-chevrons" opacity={0.35 + 0.5 * strength} fill="none" stroke={pressed === "home" ? HOME : AWAY} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {[0, 1, 2].map((i) => {
              const dir = pressed === "home" ? 1 : -1, x = dir * (22 + i * 9);
              return <path key={i} d={`M${x - dir * 3} -6 L${x + dir * 3} 0 L${x - dir * 3} 6`} />;
            })}
          </g>
        )}
      </svg>
      <ul className="heat-notes">
        <li className="heat-tilt" data-testid="ice-tilt-reading">
          {tilt ? (
            tilt.team ? <><TeamLogo id={tilt.team} size={16} /> <b>{teamOf(tilt.team).short}</b> {live ? "tilting the ice" : "controlled the ice"} · {tilt.pct}% of attempts{tilt.minutes ? ` in the last ${tilt.minutes} min` : ""}</> : <>Ice is even · neither team is pressing{tilt.minutes ? ` (last ${tilt.minutes} min)` : ""}</>
          ) : <>Not enough attempts yet to say which way the ice is tilting</>}
        </li>
        {tilt?.gaining && <li className="heat-gain" data-testid="ice-gaining"><span aria-hidden="true">▲</span> <b>{teamOf(tilt.gaining.team).short}</b> gaining · +{tilt.gaining.points} points of attempt share on the 10 minutes before</li>}
        {zoneText && <li className="heat-zones">Hottest: {zoneText}</li>}
      </ul>
      <p className="ice-key" aria-hidden="true"><i style={{ background: AWAY }} /> {away.id} <i style={{ background: HOME }} /> {home.id} · brighter = more attempts{live ? ", older ones cool" : ""}</p>
    </section>
  );
}
