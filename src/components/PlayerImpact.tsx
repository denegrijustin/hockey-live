import { useEffect, useState } from "react";
import { loadBox, loadPlayers } from "../lib/api";
import { skaterImpact, goalieImpact, signed } from "../lib/model.mjs";
import type { Game, Boxscore, PlayerData, PlayerSeason } from "../types";
export function PlayerImpact({
  game,
  sourceSeason,
}: {
  game: Game;
  sourceSeason: number;
}) {
  const past = ["OFF", "FINAL"].includes(game.state);
  const [data, setData] = useState<Boxscore | null>(null),
    [context, setContext] = useState<PlayerData[]>([]),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setContext([]);
    setError("");
    const task = past
      ? loadBox(game.id).then((d) => {
          if (active) setData(d);
        })
      : Promise.all([
          loadPlayers(sourceSeason, game.away),
          loadPlayers(sourceSeason, game.home),
        ]).then((d) => {
          if (active) setContext(d);
        });
    task.catch(() => {
      if (active) setError("Player data is temporarily unavailable.");
    });
    return () => {
      active = false;
    };
  }, [game.id, past, sourceSeason, attempt]);
  if (error)
    return (
      <div className="inline-error">
        {error} <button onClick={() => setAttempt((x) => x + 1)}>Retry</button>
      </div>
    );
  if (!data && !context.length)
    return (
      <p className="loading" role="status">
        Loading NHL player contributions…
      </p>
    );
  if (data) {
    const skaters = data.players
      .filter((p) => p.position !== "G")
      .sort((a, b) => skaterImpact(b) - skaterImpact(a));
    const goalies = data.players.filter(
      (p) => p.position === "G" && goalieImpact(p) !== null,
    );
    return (
      <>
        <p className="detail-note">
          Actual box-score index · positive / negative contribution. See
          methodology for weights.
        </p>
        <div className="impact-list">
          {[
            ...skaters.filter((p) => skaterImpact(p) > 0).slice(0, 3),
            ...skaters
              .filter((p) => skaterImpact(p) < 0)
              .slice(-3)
              .reverse(),
          ].map((p) => (
            <div className="impact-row" key={p.id}>
              <span className="impact-avatar">{p.team}</span>
              <div>
                <strong>{p.name}</strong>
                <small>
                  {p.goals} G · {p.assists} A · {p.shots} SOG ·{" "}
                  {signed(p.plusMinus ?? 0)} +/− · {p.pim} PIM
                </small>
              </div>
              <b className={skaterImpact(p) >= 0 ? "positive" : "negative"}>
                {signed(skaterImpact(p), 2)}
              </b>
            </div>
          ))}
        </div>
        {!skaters.some((p) => skaterImpact(p) < 0) && (
          <p className="detail-note">
            No skater recorded a negative index in this game.
          </p>
        )}
        <details className="inner-details">
          <summary>All player contributions ({skaters.length})</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th>TOI</th>
                  <th>G</th>
                  <th>A</th>
                  <th>+/−</th>
                  <th>Index</th>
                </tr>
              </thead>
              <tbody>
                {skaters.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.team}</td>
                    <td>{p.toi}</td>
                    <td>{p.goals}</td>
                    <td>{p.assists}</td>
                    <td>{signed(p.plusMinus ?? 0)}</td>
                    <td
                      className={skaterImpact(p) >= 0 ? "positive" : "negative"}
                    >
                      {signed(skaterImpact(p), 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        {goalies.length > 0 && (
          <>
            <h5>Goalies · saves vs .900 benchmark</h5>
            {goalies.map((p) => (
              <div className="goalie-line" key={p.id}>
                <span>
                  {p.name} · {p.saves}/{p.shotsAgainst} saves
                </span>
                <b className={goalieImpact(p)! >= 0 ? "positive" : "negative"}>
                  {signed(goalieImpact(p)!, 2)}
                </b>
              </div>
            ))}
          </>
        )}
      </>
    );
  }
  return (
    <>
      <p className="detail-note">
        {String(sourceSeason).slice(0, 4)}–{String(sourceSeason).slice(6)}{" "}
        regular-season context. Historical contribution per game; this is not a
        projected lineup or future-game impact.
      </p>
      {context.map((d, i) => (
        <div key={[game.away, game.home][i]}>
          <h5>{[game.away, game.home][i]} contributors</h5>
          {d.skaters.length === 0 ? (
            <p className="detail-note">
              No regular-season player statistics published for this season yet.
            </p>
          ) : (
            <>
              {[...d.skaters]
                .filter((p) => p.gp >= 5)
                .sort((a, b) => skaterImpact(b) / b.gp - skaterImpact(a) / a.gp)
                .slice(0, 3)
                .map((p) => (
                  <ContextRow p={p} key={p.id} />
                ))}
              {[...d.skaters]
                .filter((p) => p.gp >= 5 && skaterImpact(p) < 0)
                .sort((a, b) => skaterImpact(a) / a.gp - skaterImpact(b) / b.gp)
                .slice(0, 2)
                .map((p) => (
                  <ContextRow p={p} key={p.id} />
                ))}
              {!d.skaters.some((p) => p.gp >= 5 && skaterImpact(p) < 0) && (
                <p className="detail-note">
                  No negative index among players with 5+ games.
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </>
  );
}
function ContextRow({ p }: { p: PlayerSeason }) {
  const score = skaterImpact(p) / p.gp;
  return (
    <div className="impact-row">
      <div>
        <strong>{p.name}</strong>
        <small>
          {p.gp} GP · {p.goals} G · {p.assists} A · {signed(p.plusMinus)} +/−
        </small>
      </div>
      <b className={score >= 0 ? "positive" : "negative"}>
        {signed(score, 2)}
        <small>/ game</small>
      </b>
    </div>
  );
}
