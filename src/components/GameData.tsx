import { useEffect, useRef, useState } from "react";
import type { Game, GameFeed, Team } from "../types";
import { useFeed } from "../lib/polling";
import { Projection } from "./Projection";
import { isLive } from "../lib/game-data.mjs";
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
export function ComparisonBar({
  label,
  away,
  home,
  awayColor,
  homeColor,
}: {
  label: string;
  away: number;
  home: number;
  awayColor: string;
  homeColor: string;
}) {
  const sum = away + home;
  return (
    <div className="comparison-row">
      <div>
        <b>{away}</b>
        <span>{label}</span>
        <b>{home}</b>
      </div>
      <div className="comparison-track">
        <i
          style={{
            width: `${sum ? (away / sum) * 100 : 50}%`,
            background: sum ? awayColor : "#344954",
          }}
        />
        <i style={{ flex: 1, background: sum ? homeColor : "#344954" }} />
      </div>
    </div>
  );
}
export function GameData({
  game,
  home,
  away,
  before,
  baseline,
}: {
  game: Game;
  home: Team;
  away: Team;
  before: any;
  baseline: any;
}) {
  const { ref, visible } = useVisible();
  const played = ["LIVE", "CRIT", "OFF", "FINAL"].includes(game.state);
  const { data, error } = useFeed<GameFeed>(
    visible && played ? `/api/game/${game.id}` : null,
    isLive(game) ? 30000 : 3600000,
  );
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
      <Projection game={game} before={before} baseline={baseline} feed={data} error={error} />
      {!data ? (
        <p className="detail-note">
          {error
            ? "Game statistics unavailable. Retrying automatically…"
            : "Loading game statistics…"}
        </p>
      ) : (
        <>
          <div className="mini-heading">
            {isLive(data) ? "LIVE GAME PULSE" : "GAME PULSE"}
            <span>
              {data.periodType === "OT" ? "OT" : `P${data.period ?? "—"}`} ·{" "}
              {data.intermission ? "Intermission" : (data.clock ?? "Final")}
            </span>
          </div>
          <div className="chart-key">
            <span>
              <i style={{ background: "#73d9c1" }} />
              {away.id}
            </span>
            <span>
              <i style={{ background: "#f2bc67" }} />
              {home.id}
            </span>
            <small>Cumulative shots on goal</small>
          </div>
          <ShotChart data={data} home={home} away={away} />
          <ComparisonBar
            label="Shots on goal"
            away={data.awayShots ?? 0}
            home={data.homeShots ?? 0}
            awayColor={"#73d9c1"}
            homeColor={"#f2bc67"}
          />
          {data.stats
            .filter((s) => ["hit", "blocked-shot"].includes(s.label))
            .map((s) => (
              <ComparisonBar
                key={s.label}
                label={s.label === "hit" ? "Hits" : "Blocks"}
                away={s.away}
                home={s.home}
                awayColor={"#73d9c1"}
                homeColor={"#f2bc67"}
              />
            ))}
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
                    fill={s.team === home.id ? "#f2bc67" : "#73d9c1"}
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
}: {
  data: GameFeed;
  home: Team;
  away: Team;
}) {
  const minutes = (s: GameFeed["shots"][number]) =>
    (s.period - 1) * 20 +
    Number(s.time.split(":")[0]) +
    Number(s.time.split(":")[1]) / 60;
  const end = Math.max(
      20,
      (data.period ?? 3) > 3 && data.type === 2
        ? 60 + 5 * ((data.period ?? 3) - 3)
        : (data.period ?? 3) * 20,
      ...data.shots.map(minutes),
    ),
    max = Math.max(1, data.homeShots ?? 0, data.awayShots ?? 0);
  return (
    <svg
      className="shot-chart"
      viewBox="0 0 360 115"
      role="img"
      aria-label={`${away.id} ${data.awayShots ?? 0}, ${home.id} ${data.homeShots ?? 0} shots on goal`}
    >
      <path d="M24 10V92H350" className="chart-axis" />
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
        for (const shot of data.shots.filter((s) => s.team === t.id)) {
          const x = 24 + (minutes(shot) / end) * 326;
          points.push(`${x},${92 - (count / max) * 76}`);
          count++;
          points.push(`${x},${92 - (count / max) * 76}`);
        }
        points.push(`350,${92 - (count / max) * 76}`);
        return (
          <polyline
            key={t.id}
            points={points.join(" ")}
            stroke={t.id === away.id ? "#73d9c1" : "#f2bc67"}
            fill="none"
            strokeWidth="2.5"
          />
        );
      })}
    </svg>
  );
}
