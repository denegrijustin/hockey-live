import { Gauge } from "../Gauge";
import { useGameCenter } from "./GameCenterContext";
import { useGameBox } from "../../hooks/useGameBox";
import { comparisonRows, periodRows, DASH } from "../../lib/gc-stats.mjs";
import { Src, BoxNotice } from "./StatsBits";

/**
 * Game Center "Team Stats": team comparison (Gauge rows where a bar helps: shots, faceoff %, hits; a compact table for the rest) and the period table.
 * Official = NHL boxscore / right-rail team stats; Derived = summed from player lines or counted from play-by-play. See docs/phase5-stats.md.
 */
export default function TeamStatsPane() {
  const { game, plays } = useGameCenter();
  const state = useGameBox();
  const { box } = state;
  const rows = comparisonRows(box);
  const gauges = rows.filter((r) => r.bar), table = rows.filter((r) => !r.bar);
  const per = periodRows(box, plays, game.home, game.away);
  return (
    <div className="gcs" data-testid="gc-team-stats" aria-label="Team stats">
      <BoxNotice {...state} />
      {box && (
        <>
          {gauges.length > 0 && (
            <div className="gcs-gauges gauge-grid">
              {gauges.map((r) => (
                <div key={r.key} className="gauge-item" data-testid={`gc-gauge-${r.key}`}>
                  <Gauge stretch size="compact" away={r.away ?? 0} home={r.home ?? 0} awayId={game.away} homeId={game.home} label={r.label} percent={r.percent} lowerBetter={r.lowerBetter} awayText={r.awayText} homeText={r.homeText} />
                  <Src kind={r.source} />
                </div>
              ))}
            </div>
          )}
          <table className="gcs-cmp" data-testid="gc-team-table">
            <caption>Team comparison</caption>
            <thead>
              <tr><th scope="col">{game.away}</th><th scope="col" className="label">Stat</th><th scope="col">{game.home}</th></tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.key} data-stat={r.key}>
                  <td className={r.leader === "away" ? "lead" : ""}>{r.awayText}</td>
                  <th scope="row" className="label">{r.label}<Src kind={r.source} /></th>
                  <td className={r.leader === "home" ? "lead" : ""}>{r.homeText}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.some((r) => r.awayText === DASH && r.homeText === DASH) && <p className="gcs-note">A dash means the NHL has not published that number for this game.</p>}
        </>
      )}
      {per.rows.length > 0 && (
        <table className="gcs-per" data-testid="gc-period-table">
          <caption>By period<Src kind={per.source} /></caption>
          <thead>
            <tr><th scope="col">Period</th><th scope="col" colSpan={2}>Goals {game.away}–{game.home}</th><th scope="col" colSpan={2}>Shots {game.away}–{game.home}</th></tr>
          </thead>
          <tbody>
            {per.rows.map((r) => (
              <tr key={r.key} data-period={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.goals?.away ?? DASH}</td><td>{r.goals?.home ?? DASH}</td>
                <td>{r.shots?.away ?? DASH}</td><td>{r.shots?.home ?? DASH}</td>
              </tr>
            ))}
            <tr data-period="total">
              <th scope="row">Total</th>
              <td>{per.total.goals?.away ?? DASH}</td><td>{per.total.goals?.home ?? DASH}</td>
              <td>{per.total.shots?.away ?? DASH}</td><td>{per.total.shots?.home ?? DASH}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="gcs-note">Official: published by the NHL. Derived: counted by Iceboard (team hits, blocks, penalty minutes, takeaways and giveaways summed from the player lines; goals and shots by period counted from play-by-play, shootout excluded).</p>
    </div>
  );
}
