import type { PlayerGame } from "../../lib/api";
import { openGame } from "../../lib/open-game";
import { fmtRatio, pointStreak, goalStreak, rangeLabel } from "../../lib/player-stats.mjs";
import { Skeleton } from "../Skeleton";
import { TrendSpark } from "./TrendSpark";

const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dash = (v: unknown) => (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v)) ? "—" : String(v));
const pts = (g: PlayerGame) => g.points ?? (g.goals !== undefined && g.assists !== undefined ? g.goals + g.assists : null);

/** The last 5 or 10 games played: date, opponent, key stats, a trend chart and a link into each game's Game Center. */
export function RecentGames({ games, goalie, n, setN, pending, failed, unavailable, onLeave }: { games: PlayerGame[]; goalie: boolean; n: 5 | 10; setN: (n: 5 | 10) => void; pending: boolean; failed: boolean; unavailable: boolean; onLeave: () => void }) {
  const timeframe = rangeLabel(games, n) ?? `Last ${n} games played`;
  const ps = pointStreak(games), gs = goalStreak(games);
  return (
    <section className="pp-recent" aria-label="Recent games">
      <div className="pp-recent-head">
        <h3>Recent games</h3>
        <div className="segmented" role="group" aria-label="Number of games">
          {([5, 10] as const).map((k) => <button key={k} type="button" aria-pressed={n === k} onClick={() => setN(k)}>Last {k}</button>)}
        </div>
      </div>
      {pending ? <Skeleton rows={1} kind="row" label="Loading recent games" /> : unavailable ? <p className="pp-note">No games played this season yet, or the NHL has not published a game list.</p> : (
        <>
          <p className="pp-note">{timeframe}{!goalie && ps >= 2 ? ` · ${ps}-game point streak` : ""}{!goalie && gs >= 2 ? ` · ${gs}-game goal streak` : ""}</p>
          {failed && <p className="pp-note">The full game log is unavailable; showing the last 5.</p>}
          <TrendSpark kind={goalie ? "sv" : "points"} timeframe={timeframe} labels={games.map((g) => day(g.gameDate))} values={games.map((g) => (goalie ? ((g.shotsAgainst ?? 0) > 0 && typeof g.savePctg === "number" ? g.savePctg : null) : pts(g)))} />
          <div className="table-scroll">
            <table className="pp-table">
              <thead>
                <tr><th>Game</th>{goalie ? <><th>Dec</th><th>SA</th><th>GA</th><th>SV%</th></> : <><th>G</th><th>A</th><th>P</th><th>+/−</th><th>SOG</th><th>TOI</th></>}</tr>
              </thead>
              <tbody>
                {[...games].reverse().map((g, i) => {
                  const label = `${day(g.gameDate)} ${g.homeRoadFlag === "R" ? "@" : "vs"} ${g.opponentAbbrev ?? "—"}`;
                  return (
                    <tr key={g.gameId ?? `${g.gameDate}-${i}`}>
                      <th scope="row">{g.gameId ? <button type="button" className="pp-game" aria-label={`Open Game Center: ${label}`} onClick={() => { onLeave(); openGame(g.gameId!); }}>{label}</button> : label}</th>
                      {goalie ? <><td>{dash(g.decision)}</td><td>{dash(g.shotsAgainst)}</td><td>{dash(g.goalsAgainst)}</td><td>{(g.shotsAgainst ?? 0) > 0 ? fmtRatio(g.savePctg, "sv") : "—"}</td></> : <><td>{dash(g.goals)}</td><td>{dash(g.assists)}</td><td>{dash(pts(g))}</td><td>{dash(g.plusMinus)}</td><td>{dash(g.shots)}</td><td>{dash(g.toi)}</td></>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
