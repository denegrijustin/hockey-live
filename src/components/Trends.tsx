import { useMemo, useState } from "react";
import { rollingSeries } from "../lib/model.mjs";
import type { Team } from "../types";
export function Trends({
  teams,
  table,
  season,
}: {
  teams: Team[];
  table: any;
  season: number;
}) {
  const [metric, setMetric] = useState("difference"),
    [window, setWindow] = useState(5),
    [hover, setHover] = useState<number | null>(null);
  const series = useMemo(
    () =>
      teams.map((t) => ({
        team: t,
        data: rollingSeries(table[t.id], metric, window),
      })),
    [teams, table, metric, window],
  );
  const values = series.flatMap((s) => s.data.map((p: any) => p.value));
  const minimum = Math.min(0, ...values),
    maximum = Math.max(metric === "points" ? 1 : 2, ...values);
  const range = maximum - minimum || 1;
  const maxGames = Math.max(1, ...series.map((s) => s.data.length));
  const x = (i: number) => 55 + (i / Math.max(1, maxGames - 1)) * 900,
    y = (v: number) => 245 - ((v - minimum) / range) * 205;
  return (
    <section className="panel trend-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">FOLLOW THE DIRECTION</p>
          <h2>Team momentum</h2>
          <p>
            Rolling game averages · {String(season).slice(0, 4)}–
            {String(season).slice(6)}
          </p>
        </div>
        <div className="chart-filters">
          <label>
            Metric
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="difference">Goal differential</option>
              <option value="gf">Goals for</option>
              <option value="ga">Goals against</option>
              <option value="points">Points percentage</option>
            </select>
          </label>
          <label>
            Window
            <select
              value={window}
              onChange={(e) => setWindow(Number(e.target.value))}
            >
              <option value={1}>Game by game</option>
              <option value={5}>5-game average</option>
              <option value={10}>10-game average</option>
            </select>
          </label>
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
                      ?.data[hover]?.value.toFixed(2) ?? "—"}
                  </b>
                )}
              </span>
            ))}
          </div>
          <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
            <svg
              viewBox="0 0 1000 290"
              role="img"
              aria-label={`${window}-game ${metric} averages by game number`}
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
                      {metric === "points"
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
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <text
                  x={x(Math.round(t * (maxGames - 1)))}
                  y="275"
                  textAnchor="middle"
                  key={t}
                >
                  Game {Math.round(t * (maxGames - 1)) + 1}
                </text>
              ))}
            </svg>
          </div>
          <p className="detail-note">
            Aligned by team game number, not calendar date. Early windows use
            available games only. Hover to inspect; exact values are in the
            table below.
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
                        <td>{i + 1}</td>
                        <td>
                          {metric === "points"
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
