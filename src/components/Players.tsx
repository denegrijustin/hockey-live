import { useEffect, useState } from "react";
import { loadPlayers } from "../lib/api";
import { skaterImpact, goalieImpact, signed } from "../lib/model.mjs";
import type { Team, PlayerData, PlayerSeason } from "../types";
export function Players({ teams, season }: { teams: Team[]; season: number }) {
  const [data, setData] = useState<PlayerData[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [sort, setSort] = useState("impact"),
    [minimum, setMinimum] = useState(5),
    [retry, setRetry] = useState(0),
    [goalies, setGoalies] = useState(false);
  const key = teams.map((t) => t.id).join(",");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData([]);
    let next = 0;
    const output: PlayerData[] = [];
    Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < teams.length) {
          const t = teams[next++];
          output.push(await loadPlayers(season, t.id, controller.signal));
        }
      }),
    )
      .then(() => {
        if (!controller.signal.aborted) setData(output);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Some player summaries could not be loaded. Please retry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, season, retry]);
  const skaters = data
    .flatMap((d) => d.skaters)
    .filter((p) => p.gp >= minimum)
    .sort((a, b) =>
      sort === "impact"
        ? skaterImpact(b) / b.gp - skaterImpact(a) / a.gp
        : sort === "negative"
          ? skaterImpact(a) / a.gp - skaterImpact(b) / b.gp
          : b.goals + b.assists - (a.goals + a.assists),
    );
  const keepers = data
    .flatMap((d) => d.goalies)
    .filter((p) => p.gp >= minimum)
    .sort((a, b) => (b.savePct ?? 0) - (a.savePct ?? 0));
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">WHO IS MOVING THE NEEDLE?</p>
          <h2>Player contributions</h2>
          <p>
            {String(season).slice(0, 4)}–{String(season).slice(6)} regular
            season · team stints, not confirmed current rosters
          </p>
        </div>
        <div className="chart-filters">
          <label>
            Minimum games
            <select
              value={minimum}
              onChange={(e) => setMinimum(+e.target.value)}
            >
              <option value={1}>1 game</option>
              <option value={5}>5 games</option>
              <option value={20}>20 games</option>
            </select>
          </label>
          <label>
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="impact">Highest index / game</option>
              <option value="negative">Lowest index / game</option>
              <option value="points">Most points</option>
            </select>
          </label>
        </div>
      </div>
      <div className="segmented">
        <button aria-pressed={!goalies} onClick={() => setGoalies(false)}>
          Skaters
        </button>
        <button aria-pressed={goalies} onClick={() => setGoalies(true)}>
          Goalies
        </button>
      </div>
      <p className="detail-note">
        {goalies
          ? "Goalie contribution compares saves with a fixed .900 benchmark; shot quality is not modeled."
          : "Index = G + 0.7A + 0.1SOG + 0.25(+/−) − 0.1PIM. Positive and negative describe box-score contributions, not WAR or causal win impact."}
      </p>
      {loading ? (
        <div className="empty" role="status">
          Loading selected teams…
        </div>
      ) : error ? (
        <div className="empty">
          <p>{error}</p>
          <button onClick={() => setRetry((x) => x + 1)}>Retry</button>
        </div>
      ) : !skaters.length && !keepers.length ? (
        <div className="empty">
          <strong>No players meet these filters.</strong>
          <p>Lower the minimum or select a season with completed games.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              {goalies ? (
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th>GP</th>
                  <th>SV%</th>
                  <th>Saves vs .900</th>
                </tr>
              ) : (
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th>POS</th>
                  <th>GP</th>
                  <th>G</th>
                  <th>A</th>
                  <th>PTS</th>
                  <th>SOG</th>
                  <th>+/−</th>
                  <th>PIM</th>
                  <th>Index / GP</th>
                </tr>
              )}
            </thead>
            <tbody>
              {goalies
                ? keepers.map((p) => (
                    <tr key={`${p.team}-${p.id}`}>
                      <td>{p.name}</td>
                      <td>{p.team}</td>
                      <td>{p.gp}</td>
                      <td>{p.savePct != null ? p.savePct.toFixed(3) : "—"}</td>
                      <td>
                        {goalieImpact(p) !== null
                          ? signed(goalieImpact(p)!, 2)
                          : "Unavailable"}
                      </td>
                    </tr>
                  ))
                : skaters.map((p) => (
                    <PlayerRow key={`${p.team}-${p.id}`} p={p} />
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function PlayerRow({ p }: { p: PlayerSeason }) {
  const impact = skaterImpact(p) / p.gp;
  return (
    <tr>
      <td>
        <strong>{p.name}</strong>
      </td>
      <td>{p.team}</td>
      <td>{p.position}</td>
      <td>{p.gp}</td>
      <td>{p.goals}</td>
      <td>{p.assists}</td>
      <td>{p.goals + p.assists}</td>
      <td>{p.shots}</td>
      <td className={p.plusMinus >= 0 ? "positive" : "negative"}>
        {signed(p.plusMinus)}
      </td>
      <td>{p.pim}</td>
      <td>
        <b className={`index-badge ${impact >= 0 ? "positive" : "negative"}`}>
          {signed(impact, 2)}
        </b>
      </td>
    </tr>
  );
}
