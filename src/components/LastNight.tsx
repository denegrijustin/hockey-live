import { useEffect, useMemo, useState } from "react";
import { useFeed } from "../lib/polling";
import type { Boxscore, Game, GameFeed, Team } from "../types";
import { loadBox } from "../lib/api";
import { useMoneyPuck } from "../lib/moneypuck-client";
import { bestAndWorst, finalsOn, goalieOfTheNight, lastNightDate, lineOf, nightsOf } from "../lib/last-night.mjs";
import { Skeleton } from "./Skeleton";
import { GameRecap } from "./GameRecap";
import { CompactGameFlow } from "./GameData";
import { TeamLogo } from "./TeamLogo";
import "./last-night.css";

type Night = ReturnType<typeof nightsOf>[number];
const signed = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
const initials = (name: string) => name.split(/[\s.-]+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

function Face({ src, name, size = 44 }: { src?: string; name: string; size?: number }) {
  const [bad, setBad] = useState(false);
  return src && !bad
    ? <img className="ln-face" src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBad(true)} />
    : <span className="ln-face ln-ph" style={{ width: size, height: size }} aria-hidden="true">{initials(name)}</span>;
}

/** One night as a bar that starts at zero: what added to the score goes right, what took away goes left. */
function Bar({ n, left, right }: { n: Night; left: number; right: number }) {
  const total = left + right || 1;
  const pos = [["points", n.parts.points], ["on-ice", n.parts.onIce], ["other", n.parts.other]].filter(([, v]) => (v as number) > 0) as [string, number][];
  const neg = [["on-ice", n.parts.onIce], ["penalties", n.parts.penalties], ["other", n.parts.other]].filter(([, v]) => (v as number) < 0) as [string, number][];
  let x = (left / total) * 100;
  const rects: { k: string; x: number; w: number }[] = [];
  for (const [k, v] of pos) { const w = (v / total) * 100; rects.push({ k, x, w }); x += w; }
  x = (left / total) * 100;
  for (const [k, v] of neg) { const w = (-v / total) * 100; x -= w; rects.push({ k: `${k}-neg`, x, w }); }
  const kind = (k: string) => (k.startsWith("points") ? "points" : k.startsWith("on-ice") ? "onice" : k.startsWith("penalties") ? "pen" : "other");
  return (
    <span className="ln-bar" role="img" aria-label={`${n.name}: ${signed(n.total)}. Goals and assists ${signed(n.parts.points)}, on-ice play ${signed(n.parts.onIce)}, penalties ${signed(n.parts.penalties)}, shots, blocks, hits and puck battles ${signed(n.parts.other)}`}>
      {rects.map((r) => <i key={r.k} className={`ln-seg ${kind(r.k)}`} style={{ left: `${r.x}%`, width: `${r.w}%` }} />)}
      <u style={{ left: `${(left / total) * 100}%` }} />
    </span>
  );
}

/** Best and worst nights, each a bar of what built the score. Used for the whole night and for one game. */
function NightsChart({ best, worst, title }: { best: Night[]; worst: Night[]; title: string }) {
  const shown = [...best, ...worst];
  const right = Math.max(1, ...shown.map((n) => Math.max(0, n.parts.points) + Math.max(0, n.parts.onIce) + Math.max(0, n.parts.other)));
  const left = Math.max(0.6, ...shown.map((n) => Math.max(0, -n.parts.onIce) + Math.max(0, -n.parts.penalties) + Math.max(0, -n.parts.other)));
  return (
              <section className="ln-chart" aria-label={title}>
          <header><h3>{title}</h3><p>What built each game score</p></header>
          <ul className="ln-legend">
            <li><i className="ln-seg points" />Goals + assists</li><li><i className="ln-seg onice" />On-ice play (plus-minus)</li><li><i className="ln-seg pen" />Penalties</li><li><i className="ln-seg other" />Shots, blocks, hits, takeaways</li>
          </ul>
          {([["Best", best], ["Worst", worst]] as const).filter(([, rows]) => rows.length).map(([title, rows]) => (
            <div key={title} className="ln-group">
              <h4>{title}<span>Game score</span></h4>
              <ol>
                {rows.map((n) => (
                  <li key={`${title}${n.gameId}-${n.id}`}>
                    <Face src={n.headshot} name={n.name} size={36} />
                    <span className="ln-who"><b>{n.name}</b><small>{n.team} · {lineOf(n)}</small></span>
                    <Bar n={n} left={left} right={right} />
                    <strong className={`ln-gs ${n.total >= 0 ? "pos" : "neg"}`}>{signed(n.total)}</strong>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <p className="ln-note">Game score is built from the box score: 0.75 per goal, 0.62 per assist, 0.075 per shot on goal, 0.05 per block, 0.15 per plus-minus point (standing in for goals for and against while on the ice), −0.075 per penalty minute, and small amounts for hits, takeaways and giveaways. Skaters with 8+ minutes only. It is our own box-score version of a game score, so it will not match models that also count shot attempts on the ice.</p>
        </section>
  );
}

/** The day before: every final, the best and worst individual nights, and the goalie of the night. */
export function LastNight({ games, teams, season, current = true }: { games: Game[]; teams: Team[]; season: number; current?: boolean }) {
  const date = useMemo(() => lastNightDate(games), [games]);
  const finals = useMemo(() => (date ? finalsOn(games, date) : []), [games, date]);
  const [boxes, setBoxes] = useState<Boxscore[] | null>(null);
  const ids = finals.map((f) => f.id).join(",");
  const mp = useMoneyPuck(season, "games", { enabled: finals.length > 0, watchAge: current });
  useEffect(() => {
    let live = true;
    setBoxes(null);
    if (!finals.length) return;
    Promise.all(finals.map((f) => loadBox(f.id).catch(() => null))).then((all) => { if (live) setBoxes(all.filter(Boolean) as Boxscore[]); });
    return () => { live = false; };
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const nights = useMemo(() => (boxes ? nightsOf(boxes) : []), [boxes]);
  const { best, worst } = useMemo(() => bestAndWorst(nights, 5), [nights]);
  const goalie = useMemo(() => goalieOfTheNight(mp.data, finals.map((f) => f.id)), [mp.data, ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.short ?? id;

  if (!date) return <section className="panel ln" aria-label="Last night in the NHL"><h2>Last night in the NHL</h2><p className="detail-note">No games have been finished before today yet.</p></section>;
  const label = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const [open, setOpen] = useState<number | null>(null);
  const openFinal = finals.find((f) => f.id === open);
  if (openFinal) return <GameNight final={openFinal} box={boxes?.find((b) => b.id === openFinal.id) ?? null} loading={boxes === null} teams={teams} label={label} onBack={() => setOpen(null)} />;
  return (
    <section className="panel ln" aria-labelledby="ln-title" data-testid="last-night">
      <header className="ln-head">
        <h2 id="ln-title">Last night in the NHL</h2>
        <p>{label} · {finals.length} {finals.length === 1 ? "game" : "games"}</p>
      </header>
      <div className="ln-top">
        <section className="ln-finals" aria-label="Final scores">
          <h3>Final scores <span>Tap a game</span></h3>
          <ol>
            {finals.map((f) => {
              const aw = f.awayScore > f.homeScore;
              return (
                <li key={f.id} data-game-id={f.id}>
                  <button type="button" className="ln-gamebtn" aria-label={`${nameOf(f.away)} ${f.awayScore}, ${nameOf(f.home)} ${f.homeScore}, final${f.end ? ` in ${f.end}` : ""}. Open the game: best and worst nights, shot chart and analysis.`} onClick={() => setOpen(f.id)}>
                  <span className={`ln-side${aw ? " win" : ""}`}><TeamLogo id={f.away} size={26} /><b>{f.away}</b></span>
                  <span className="ln-score"><strong className={aw ? "win" : ""}>{f.awayScore}</strong><i>–</i><strong className={aw ? "" : "win"}>{f.homeScore}</strong>{f.end && <small>{f.end}</small>}</span>
                  <span className={`ln-side home${aw ? "" : " win"}`}><b>{f.home}</b><TeamLogo id={f.home} size={26} /></span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="ln-best" aria-label="Best nights">
          <h3>Best nights <span>Game score</span></h3>
          {boxes === null ? <Skeleton rows={3} label="Loading the box scores" /> : best.length ? (
            <ol>
              {best.map((n) => (
                <li key={`${n.gameId}-${n.id}`} data-player={n.id}>
                  <Face src={n.headshot} name={n.name} />
                  <span className="ln-who"><b>{n.name}</b><small>{n.team} · {lineOf(n)}{n.shots ? ` · ${n.shots} SOG` : ""}</small></span>
                  <strong className="ln-gs pos">{signed(n.total)}</strong>
                </li>
              ))}
            </ol>
          ) : <p className="detail-note">Box scores are not available for these games yet.</p>}
          {goalie && (
            <div className="ln-goalie" data-testid="goalie-of-the-night">
              <TeamLogo id={goalie.team} size={36} />
              <span className="ln-who"><small>GOALIE OF THE NIGHT</small><b>{goalie.name}</b><small>{goalie.team} · {goalie.saves} of {goalie.shots} saved</small></span>
              <strong className="ln-gs pos">{signed(goalie.gsax)}<small>saved above expected</small></strong>
            </div>
          )}
        </section>
      </div>
      {boxes !== null && nights.length > 0 && <NightsChart best={best} worst={worst} title="Best and worst nights" />}
    </section>
  );
}

/** One game from last night: its own best and worst nights, then the recap (deserved to win, shot maps, numbers, periods, stars, goals) and the win-probability flow. */
function GameNight({ final, box, loading, teams, label, onBack }: { final: ReturnType<typeof finalsOn>[number]; box: Boxscore | null; loading: boolean; teams: Team[]; label: string; onBack: () => void }) {
  const home = teams.find((t) => t.id === final.home)!, away = teams.find((t) => t.id === final.away)!;
  const { data: feed } = useFeed<GameFeed>(`/api/game/${final.id}`, 3_600_000);
  const nights = useMemo(() => (box ? nightsOf([box]) : []), [box]);
  const { best, worst } = useMemo(() => bestAndWorst(nights, 5), [nights]);
  return (
    <section className="panel ln ln-game" aria-labelledby="lg-title" data-testid="last-night-game" data-game-id={final.id}>
      <button type="button" className="ln-back" onClick={onBack}>← All of last night</button>
      <header className="ln-gamehead">
        <span className="ln-side"><TeamLogo id={away.id} size={44} /><b>{away.id}</b></span>
        <h2 id="lg-title" className="ln-bigscore" aria-label={`${away.name} ${final.awayScore}, ${home.name} ${final.homeScore}`}><strong className={final.awayScore > final.homeScore ? "win" : ""}>{final.awayScore}</strong><i>–</i><strong className={final.homeScore > final.awayScore ? "win" : ""}>{final.homeScore}</strong><small>Final{final.end ? ` / ${final.end}` : ""}</small></h2>
        <span className="ln-side home"><b>{home.id}</b><TeamLogo id={home.id} size={44} /></span>
      </header>
      <p className="ln-gamedate">{away.name} at {home.name} · {label}</p>
      {loading ? <Skeleton rows={3} label="Loading the box score" /> : nights.length > 0 ? <NightsChart best={best} worst={worst} title="This game: best and worst nights" /> : <p className="detail-note">The box score for this game is not available yet.</p>}
      {feed?.plays?.length ? <div className="ln-flow"><CompactGameFlow data={feed} home={home} away={away} /></div> : null}
      <GameRecap data={feed ?? null} home={home} away={away} />
    </section>
  );
}
