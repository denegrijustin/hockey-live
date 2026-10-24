import { useId } from "react";
import type { GameFeed, Team } from "../types";
import { HIGH_DANGER_FT, NET_X, iceSummary } from "../lib/ice-view.mjs";
import { LogoImage, TeamLogo } from "./TeamLogo";

const AWAY = "var(--series-away)";
const HOME = "var(--series-home)";

/**
 * The ice on a small card: where each team's shots came from, at the net they attacked, with the high-danger area shaded, and what it adds up to:
 * shots on goal, high-danger chances and the last ten minutes' pressure. For a game that has started; the away team is on the left, as on the scoreboard.
 */
export function IceView({ data, home, away }: { data: GameFeed | null; home: Team; away: Team }) {
  const clip = useId();
  if (!data) return null;
  const sum = iceSummary(data);
  if (!sum.shots.length && !data.homeShots && !data.awayShots) return null;
  const live = ["LIVE", "CRIT"].includes(data.state);
  const lastGoal = sum.goals.at(-1);
  const tilt = sum.tilt;
  const share = tilt ? Math.round(tilt.homeShare * 100) : null;
  const tiltTeam = share == null ? null : share === 50 ? null : share > 50 ? home : away;
  const tiltPct = share == null ? null : share >= 50 ? share : 100 - share;
  const row = (label: string, a: number, h: number, title: string) => (
    <div className="ice-stat" title={title}>
      <b style={{ color: AWAY }}>{a}</b>
      <span>{label}</span>
      <b style={{ color: HOME }}>{h}</b>
    </div>
  );
  return (
    <section className="ice-view" data-testid="ice-view" aria-label={`Ice view: ${away.id} ${sum.sog.away} shots on goal, ${home.id} ${sum.sog.home}; high-danger chances ${away.id} ${sum.hd.away}, ${home.id} ${sum.hd.home}${tiltTeam ? `; ${tiltTeam.id} has the shot pressure` : ""}`}>
      <div className="mini-heading">
        ICE VIEW <span>{live ? "Shot map · live" : "Shot map · final"}</span>
      </div>
      <svg className="ice-rink" viewBox="-105 -47.5 210 95" role="img" aria-label="Shots on the ice, each team at the net it attacked">
        <defs>
          <clipPath id={clip}><rect x="-100" y="-42.5" width="200" height="85" rx="24" /></clipPath>
        </defs>
        <rect x="-100" y="-42.5" width="200" height="85" rx="24" className="ice-sheet" />
        <g clipPath={`url(#${clip})`}>
          {/* the high-danger area at each net */}
          <circle cx={-NET_X} cy="0" r={HIGH_DANGER_FT} className="ice-danger" />
          <circle cx={NET_X} cy="0" r={HIGH_DANGER_FT} className="ice-danger" />
          <path d="M0 -42.5V42.5" className="ice-red" />
          <path d="M-25 -42.5V42.5M25 -42.5V42.5" className="ice-blue" />
          <path d={`M-${NET_X} -42.5V42.5M${NET_X} -42.5V42.5`} className="ice-goalline" />
          <circle cx="0" cy="0" r="15" className="ice-mark blue" />
          {[[-69, -22], [-69, 22], [69, -22], [69, 22]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="15" className="ice-mark" />)}
        </g>
        <rect x={-NET_X - 3} y="-3" width="3" height="6" className="ice-net" />
        <rect x={NET_X} y="-3" width="3" height="6" className="ice-net" />
        <LogoImage id={away.id} x={-97} y={-39} size={13} opacity={0.9} bare />
        <LogoImage id={home.id} x={84} y={-39} size={13} opacity={0.9} bare />
        {sum.shots.map((s) =>
          s.kind === "goal" ? null : (
            <circle key={s.id} cx={s.x} cy={-s.y} r={s.kind === "sog" ? 1.8 : 1.4} className={`ice-shot ${s.kind}`} style={{ "--c": s.home ? HOME : AWAY } as React.CSSProperties}>
              <title>{`${s.team} ${s.kind === "sog" ? "shot on goal" : "missed shot"}${s.player ? ` · ${s.player}` : ""} · P${s.period} ${s.time}${s.hd ? " · high danger" : ""}`}</title>
            </circle>
          ),
        )}
        {sum.goals.map((g) => (
          <g key={g.id} className={`ice-goal${g === lastGoal ? " latest" : ""}`} style={{ "--c": g.home ? HOME : AWAY } as React.CSSProperties}>
            <circle cx={g.x} cy={-g.y} r="3.6" />
            <title>{`${g.team} goal${g.player ? ` · ${g.player}` : ""} · P${g.period} ${g.time}`}</title>
          </g>
        ))}
      </svg>
      <div className="ice-stats">
        {row("Shots on goal", sum.sog.away, sum.sog.home, "Shots on goal, including goals")}
        {row("High-danger chances", sum.hd.away, sum.hd.home, `Shots on goal and goals from within ${HIGH_DANGER_FT} feet of the net (the shaded area)`)}
        {sum.attempts && row("Shot attempts", sum.attempts.away, sum.attempts.home, "Goals, shots on goal, missed and blocked shots")}
      </div>
      <p className="ice-tilt-line" data-testid="ice-tilt">
        {tiltTeam ? (
          <>
            <TeamLogo id={tiltTeam.id} size={16} /> <b>{tiltTeam.id}</b> has the pressure · {tiltPct}% of shot attempts
            <span> in the last {Math.round(tilt!.minutes)} minutes</span>
          </>
        ) : tilt ? (
          <>Even pressure in the last {Math.round(tilt.minutes)} minutes</>
        ) : (
          <>Pressure shows once there are shots to compare</>
        )}
      </p>
      <p className="ice-key" aria-hidden="true">
        <i style={{ background: AWAY }} /> {away.id} <i style={{ background: HOME }} /> {home.id} <i className="goal" /> goal <i className="danger" /> high danger
      </p>
    </section>
  );
}
