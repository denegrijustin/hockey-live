import { useId, useMemo, useState } from "react";
import type { GameFeed, Team } from "../types";
import { useGameShots } from "../lib/moneypuck-client";
import { buildRecap } from "../lib/game-recap.mjs";
import { TeamLogo } from "./TeamLogo";
import "./game-recap.css";

type Recap = ReturnType<typeof buildRecap>;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const f2 = (v: number) => v.toFixed(2);
const last = (name: string | null) => (name ? name.split(" ").slice(-1)[0] : "");

function Deserved({ r, home, away }: { r: Recap; home: Team; away: Team }) {
  const a = Math.round(r.deserved.away * 100), h = 100 - a;
  return (
    <section className="gr-deserved" aria-label={`Deserved to win: ${away.id} ${a} percent, ${home.id} ${h} percent`}>
      <h4>Deserved to win <small>from the chances each side created</small></h4>
      <div className="gr-dbar"><b>{away.id} {a}%</b><span role="presentation"><i style={{ width: `${a}%` }} /><i /></span><b>{h}% {home.id}</b></div>
    </section>
  );
}

/** Expected goals building up through the game, one line a team, a gold dot for each goal. */
function Race({ r, home, away }: { r: Recap; home: Team; away: Team }) {
  const W = 340, H = 190, L = 26, R = 56, T = 14, B = 26;
  const max = Math.max(1, Math.ceil(Math.max(r.xg.home, r.xg.away, ...r.marks.map((m) => m.v)) + 0.4));
  const x = (t: number) => L + (t / r.series.end) * (W - L - R);
  const y = (v: number) => H - B - (v / max) * (H - T - B);
  const path = (pts: { t: number; v: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const periods = [1200, 2400, 3600].filter((t) => t <= r.series.end);
  const ticks = Array.from({ length: max + 1 }, (_, i) => i);
  return (
    <section className="gr-race" aria-label={`Expected goals race: ${away.id} ${f2(r.xg.away)}, ${home.id} ${f2(r.xg.home)}`}>
      <h4>Expected goals race <small>gold dot = goal</small></h4>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${away.id} ${f2(r.xg.away)} expected goals, ${home.id} ${f2(r.xg.home)}`}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="gr-grid" /><text x={L - 5} y={y(v) + 4} className="gr-ax" textAnchor="end">{v}</text></g>)}
        {periods.slice(0, -1).map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={T} y2={H - B} className="gr-sep" />)}
        {[["1st", 0, 1200], ["2nd", 1200, 2400], ["3rd", 2400, 3600]].map(([n, a, b]) => <text key={n as string} x={x(((a as number) + Math.min(b as number, r.series.end)) / 2)} y={H - 8} className="gr-ax" textAnchor="middle">{n}</text>)}
        <path d={path(r.series.away)} className="gr-line away" />
        <path d={path(r.series.home)} className="gr-line home" />
        {r.marks.map((m) => <g key={m.n}><circle cx={x(m.t)} cy={y(m.v)} r="7" className={`gr-goal ${m.home ? "home" : "away"}`} /><text x={x(m.t)} y={y(m.v) + 4} className="gr-goal-n" textAnchor="middle">{m.n}</text></g>)}
        <text x={W - R + 4} y={y(r.xg.away) + (r.xg.away > r.xg.home ? -3 : 11)} className="gr-end away">{away.id} {f2(r.xg.away)}</text>
        <text x={W - R + 4} y={y(r.xg.home) + (r.xg.home > r.xg.away ? -3 : 11)} className="gr-end home">{home.id} {f2(r.xg.home)}</text>
      </svg>
    </section>
  );
}

/** One team's attempts at the net it attacked: dot size is the chance, a gold ring is a goal, a hollow dot missed. */
function AttemptMap({ r, side, team }: { r: Recap; side: "home" | "away"; team: Team }) {
  const id = useId();
  const mine = r.list.filter((a: any) => a.home === (side === "home"));
  return (
    <section className={`gr-map ${side}`} aria-label={`${team.id} attempts`}>
      <h4>{team.id} attempts</h4>
      <svg viewBox="0 0 85 84" role="img" aria-label={`${team.id}: ${mine.length} unblocked attempts, ${mine.filter((a: any) => a.goal).length} goals`}>
        <defs><clipPath id={id}><path d="M0 0H85V84H0z" /></clipPath></defs>
        <rect x="0.5" y="0.5" width="84" height="83" rx="26" className="gr-ice" />
        <g clipPath={`url(#${id})`}>
          <line x1="0" x2="85" y1="3" y2="3" className="gr-gline" />
          <path d="M36.5 3h12v4.5h-12z" className="gr-net" />
          <path d="M36.5 3a6 6 0 0 0 12 0" className="gr-crease" />
          {[20.5, 64.5].map((cx) => <g key={cx}><circle cx={cx} cy="23" r="15" className="gr-cir" /><circle cx={cx} cy="23" r="1" className="gr-dot0" /></g>)}
          <line x1="0" x2="85" y1="67" y2="67" className="gr-bline" />
        </g>
        {mine.map((a: any, i: number) => {
          const px = 42.5 + a.y, py = 3 + Math.max(0, Math.min(79, 89 - a.x));
          const rad = 1.3 + Math.sqrt(a.xg) * 7;
          return a.goal
            ? <circle key={i} cx={px} cy={py} r={rad + 0.8} className={`gr-shot goal ${side}`} />
            : <circle key={i} cx={px} cy={py} r={rad} className={`gr-shot ${side}${a.sog ? "" : " miss"}`} />;
        })}
      </svg>
    </section>
  );
}

function Compare({ r, home, away }: { r: Recap; home: Team; away: Team }) {
  const rows: { label: string; a: number | null; h: number | null; fmt: (v: number) => string }[] = [
    { label: "Shot attempts", a: r.attempts.away, h: r.attempts.home, fmt: String },
    { label: "Shots on goal", a: r.sog.away, h: r.sog.home, fmt: String },
    { label: "Expected goals", a: r.xg.away, h: r.xg.home, fmt: f2 },
    { label: "xG per attempt", a: r.xgPerAttempt.away, h: r.xgPerAttempt.home, fmt: (v) => v.toFixed(3).replace(/^0/, "") },
    ...(r.faceoffs ? [{ label: "Faceoffs won", a: r.faceoffs.away, h: r.faceoffs.home, fmt: String }] : []),
    ...(r.hits ? [{ label: "Hits", a: r.hits.away, h: r.hits.home, fmt: String }] : []),
  ];
  return (
    <section className="gr-compare" aria-label={`Team numbers, ${away.id} against ${home.id}`}>
      {rows.filter((x) => x.a != null && x.h != null).map((x) => {
        const total = (x.a as number) + (x.h as number) || 1;
        return (
          <div key={x.label} className="gr-row">
            <b>{x.fmt(x.a as number)}</b>
            <span className="gr-rlabel">{x.label}</span>
            <b>{x.fmt(x.h as number)}</b>
            <span className="gr-bars" role="presentation"><i className="away" style={{ width: `${((x.a as number) / total) * 100}%` }} /><i className="home" style={{ width: `${((x.h as number) / total) * 100}%` }} /></span>
          </div>
        );
      })}
    </section>
  );
}

function Stars({ r, game, home, away }: { r: Recap; game: GameFeed; home: Team; away: Team }) {
  const [bad, setBad] = useState<Record<number, boolean>>({});
  if (r.performers) {
    return (
      <section className="gr-stars" aria-label="Stars of the game">
        <div className="gr-star-row">
          {r.performers.stars.map((s: any, i: number) => (
            <div key={`${s.kind}${s.id}`} className="gr-star">
              {bad[s.id] ? <span className="gr-ph">{s.name.split(" ").map((p: string) => p[0]).join("").slice(0, 2)}</span> : <img src={`https://assets.nhle.com/mugs/nhl/${game.season}/${s.team}/${s.id}.png`} alt="" width="52" height="52" loading="lazy" onError={() => setBad((b) => ({ ...b, [s.id]: true }))} />}
              <small>{"★".repeat(i + 1)} {["1st", "2nd", "3rd"][i]} star</small>
              <b>{s.name}</b>
              <span>{s.team === home.id ? home.id : away.id} · {s.kind === "goalie" ? `${s.saves} saves on ${s.faced}, ${s.gsax >= 0 ? "+" : "−"}${Math.abs(s.gsax).toFixed(1)} GSAx` : `${s.goals}G · ${f2(s.xg)} xG`}</span>
            </div>
          ))}
        </div>
        <div className="gr-goalies">
          {r.performers.goalies.map((g: any) => (
            <div key={g.id}><b>{g.name}</b><span>{g.saves}/{g.faced} · {g.svPct != null ? g.svPct.toFixed(3).replace(/^0/, "") : "–"} · {f2(g.xga)} xGA</span><strong className={g.gsax >= 0 ? "pos" : "neg"}>{g.gsax >= 0 ? "+" : "−"}{Math.abs(g.gsax).toFixed(2)} GSAx</strong></div>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="gr-stars" aria-label="Best chances">
      <h4>Best chances so far</h4>
      <ol className="gr-chances">
        {r.topChances.map((c: any, i: number) => <li key={i}><TeamLogo id={c.team} size={20} /><b>{c.player ?? "Unknown shooter"}</b><span>{c.goal ? "goal" : c.sog ? "saved" : "missed"} · {f2(c.xg)} xG</span></li>)}
      </ol>
    </section>
  );
}

function Goals({ r }: { r: Recap }) {
  if (!r.goals.length) return null;
  const top = Math.max(0.35, ...r.goals.map((g: any) => g.xg));
  return (
    <section className="gr-goals" aria-label="Goals">
      <h4>Goals <small>bar = expected goals of the shot that scored</small></h4>
      <ol>
        {r.goals.map((g: any) => (
          <li key={g.n} className={g.home ? "home" : "away"}>
            <span className="gr-when">{g.when}</span><i aria-hidden="true" /><b>{g.team}</b><span className="gr-who">{g.player ?? "Goal"}</span>
            <span className="gr-xgbar" role="presentation"><i style={{ width: `${Math.min(100, (g.xg / top) * 100)}%` }} /></span>
            <em>{g.en ? "EN" : g.xg.toFixed(2).replace(/^0/, "")}</em>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The game recap: who deserved to win, how the chances built up, where each team shot from, the numbers side by side, the stars and the goals. It reads the
 * live game feed, so it fills in as the game is played; a finished game MoneyPuck has uses MoneyPuck's own expected goals.
 */
export function GameRecap({ data, home, away }: { data: GameFeed | null; home: Team; away: Team }) {
  const over = !!data && ["OFF", "FINAL"].includes(data.state);
  const mp = useGameShots(data?.season ?? 0, data?.id ?? 0, over);
  const recap = useMemo(() => (data ? buildRecap({ game: data, mp: over ? mp.data : null }) : null), [data, mp.data, over]);
  if (!data || !recap || recap.list.length < 3) return null;
  const live = ["LIVE", "CRIT"].includes(data.state);
  return (
    <section className="game-recap" data-testid="game-recap" data-source={recap.source} aria-label="Game recap">
      <div className="mini-heading">GAME RECAP <span>{live ? "Updating as it is played" : over ? "Final" : ""}</span></div>
      <Deserved r={recap} home={home} away={away} />
      <Race r={recap} home={home} away={away} />
      <div className="gr-mid">
        <AttemptMap r={recap} side="away" team={away} />
        <Compare r={recap} home={home} away={away} />
        <AttemptMap r={recap} side="home" team={home} />
      </div>
      <Stars r={recap} game={data} home={home} away={away} />
      <Goals r={recap} />
      <p className="gr-note">
        {recap.source === "moneypuck"
          ? "Expected goals (xG) from MoneyPuck's model. Deserved to win: every attempt weighed by its chance, a tie after regulation split evenly."
          : "Expected goals (xG) are estimated from where each shot was taken (distance and angle), so they run rougher than MoneyPuck's model and update as the game is played. Blocked shots have no location and are left out of the maps and xG."}
        {" "}Dot size is the chance; a gold ring is a goal; a hollow dot missed the net.
      </p>
    </section>
  );
}
