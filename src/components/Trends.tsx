import { useEffect, useMemo, useState } from "react";
import { playoffTrend, rollingSeries } from "../lib/model.mjs";
import type { Game, Team } from "../types";
export function Trends({
  teams,
  table,
  season,
  games,
  leagueTeams,
  baseline,
  currentSeason,
}: {
  teams: Team[];
  table: any;
  season: number;
  games: Game[];
  leagueTeams: Team[];
  baseline: any;
  currentSeason: number;
}) {
  const [metric, setMetric] = useState("playoffs"),
    [window, setWindow] = useState(5),
    [hover, setHover] = useState<number | null>(null);
  const current = season === currentSeason;
  useEffect(() => {
    if (!current && metric === "playoffs") setMetric("difference");
  }, [current, metric]);
  const playoffHistory = useMemo(
    () => playoffTrend(games, leagueTeams, baseline),
    [games, leagueTeams, baseline],
  );
  const series = useMemo(
    () =>
      teams.map((t) => ({
        team: t,
        data:
          metric === "playoffs"
            ? playoffHistory[t.id]
            : rollingSeries(table[t.id], metric, window),
      })),
    [teams, table, metric, window, playoffHistory],
  );
  const values = series.flatMap((s) => s.data.map((p: any) => p.value));
  const minimum = metric === "playoffs" ? 0 : Math.min(0, ...values),
    maximum = metric === "playoffs" ? 100 : Math.max(metric === "points" ? 1 : 2, ...values);
  const range = maximum - minimum || 1;
  const maxGames = Math.max(1, ...series.map((s) => s.data.length));
  const x = (i: number) => 55 + (i / Math.max(1, maxGames - 1)) * 900,
    y = (v: number) => 245 - ((v - minimum) / range) * 205;
  const tickIndexes = [
    ...new Set(
      [0, 0.25, 0.5, 0.75, 1].map((position) =>
        Math.round(position * (maxGames - 1)),
      ),
    ),
  ];
  return (
    <section className="panel trend-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">FOLLOW THE DIRECTION</p>
          <h2>{metric === "playoffs" ? "Playoff outlook" : "Team momentum"}</h2>
          <p>
            {metric === "playoffs"
              ? "Current season only · estimated chance after every game"
              : "Rolling game averages"} · {String(season).slice(0, 4)}–
            {String(season).slice(6)}
          </p>
        </div>
        <div className="chart-filters">
          <label>
            Metric
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {current && <option value="playoffs">Playoff chance</option>}
              <option value="difference">Goal differential</option>
              <option value="gf">Goals for</option>
              <option value="ga">Goals against</option>
              <option value="points">Points percentage</option>
            </select>
          </label>
          {metric !== "playoffs" && <label>
            Window
            <select
              value={window}
              onChange={(e) => setWindow(Number(e.target.value))}
            >
              <option value={1}>Game by game</option>
              <option value={5}>5-game average</option>
              <option value={10}>10-game average</option>
            </select>
          </label>}
        </div>
      </div>
      {!values.length ? (
        <div className="empty">
          <strong>No regular-season results yet.</strong>
          <p>
            Select the previous season for team trends, or explore upcoming
            games.
          </p>
        </div>
      ) : (
        <>
          <div className="chart-legend">
            {teams.map((t) => (
              <span key={t.id}>
                <i style={{ background: t.color }} />
                {t.id}
                {hover !== null && (
                  <b>
                    {series
                      .find((s) => s.team.id === t.id)
                      ?.data[hover]?.value.toFixed(metric === "playoffs" ? 0 : 2) ?? "—"}
                    {metric === "playoffs" ? "%" : ""}
                  </b>
                )}
              </span>
            ))}
          </div>
          <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
            <svg
              viewBox="0 0 1000 290"
              role="img"
              aria-label={
                metric === "playoffs"
                  ? "Estimated playoff chance by game number"
                  : `${window}-game ${metric} averages by game number`
              }
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHover(
                  Math.max(
                    0,
                    Math.min(
                      maxGames - 1,
                      Math.round(
                        ((((e.clientX - rect.left) / rect.width) * 1000 - 55) /
                          900) *
                          (maxGames - 1),
                      ),
                    ),
                  ),
                );
              }}
            >
              {Array.from({ length: 5 }, (_, i) => {
                const v = minimum + (range * i) / 4;
                return (
                  <g key={i}>
                    <line
                      x1="55"
                      x2="955"
                      y1={y(v)}
                      y2={y(v)}
                      stroke="#243641"
                      strokeDasharray="3 5"
                    />
                    <text x="40" y={y(v) + 4} textAnchor="end">
                      {metric === "playoffs"
                        ? Math.round(v) + "%"
                        : metric === "points"
                        ? Math.round(v * 100) + "%"
                        : v.toFixed(1)}
                    </text>
                  </g>
                );
              })}
              {series.map((s) => (
                <polyline
                  key={s.team.id}
                  fill="none"
                  stroke={s.team.color}
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                  points={s.data
                    .map((p: any, i: number) => `${x(i)},${y(p.value)}`)
                    .join(" ")}
                >
                  <title>{s.team.name}</title>
                </polyline>
              ))}
              {metric === "playoffs" &&
                series.map((s) => {
                  const index = s.data.length - 1;
                  const point = s.data[index];
                  return point ? (
                    <g
                      key={`${s.team.id}-latest`}
                    >
                      <circle
                        cx={x(index)}
                        cy={y(point.value)}
                        r={point.live ? 14 : 13}
                        fill="#10212c"
                        stroke={s.team.color}
                        strokeWidth="3"
                      />
                      <image
                        href={`/logos/${s.team.id}.svg`}
                        x={x(index) - 9}
                        y={y(point.value) - 9}
                        width="18"
                        height="18"
                        aria-hidden="true"
                      />
                      <title>{`${s.team.name}: ${point.value.toFixed(1)}%${point.live ? " live" : ""}`}</title>
                    </g>
                  ) : null;
                })}
              {hover !== null && (
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1="25"
                  y2="245"
                  stroke="#91a8b4"
                  strokeDasharray="4 4"
                />
              )}
              {tickIndexes.map((index) => (
                <text
                  x={x(index)}
                  y="275"
                  textAnchor="middle"
                  key={index}
                >
                  Game {metric === "playoffs" ? index : index + 1}
                </text>
              ))}
            </svg>
          </div>
          <p className="detail-note">
            Aligned by team game number, not calendar date. {metric === "playoffs"
              ? "The final point moves during live games as the score and live win estimate change."
              : "Early windows use available games only."} Hover to inspect;
            exact values are in the table below.
          </p>
          <details className="inner-details">
            <summary>View trend data table</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Date</th>
                    <th>Game</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {series.flatMap((s) =>
                    s.data.map((p: any, i: number) => (
                      <tr key={`${s.team.id}-${i}`}>
                        <td>{s.team.id}</td>
                        <td>{p.date}</td>
                        <td>{metric === "playoffs" ? p.game : i + 1}</td>
                        <td>
                          {metric === "playoffs"
                            ? p.value.toFixed(1) + (p.live ? "% · LIVE" : "%")
                            : metric === "points"
                            ? (p.value * 100).toFixed(1) + "%"
                            : p.value.toFixed(2)}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
