import type { Team } from "../types";
import { pointsRank, signed, entryLine } from "../lib/model.mjs";
export function Standings({
  teams,
  table,
  selected,
}: {
  teams: Team[];
  table: any;
  selected: string[];
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">THE BIGGER PICTURE</p>
          <h2>League standings</h2>
          <p>
            Rebuilt from completed regular-season results. Your selected teams
            are highlighted.
          </p>
        </div>
        <span className="muted-label">Points rank · ties shared</span>
      </div>
      <div className="table-scroll">
        <table className="standings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>Division</th>
              <th>GP</th>
              <th>W</th>
              <th>L</th>
              <th>OT</th>
              <th>PTS</th>
              <th>PTS %</th>
              <th>GD</th>
              <th>Last 5</th>
              <th>Entry-line gap</th>
            </tr>
          </thead>
          <tbody>
            {[...teams]
              .sort(
                (a, b) =>
                  table[b.id].pts - table[a.id].pts ||
                  a.name.localeCompare(b.name),
              )
              .map((t) => {
                const s = table[t.id],
                  r = pointsRank(table, t.id);
                return (
                  <tr
                    key={t.id}
                    className={selected.includes(t.id) ? "highlighted" : ""}
                  >
                    <td>
                      {r.tied ? "T" : ""}
                      {r.rank}
                    </td>
                    <td>
                      <div className="table-team">
                        <img src={`/logos/${t.id}.svg`} alt="" />
                        <b>{t.name}</b>
                      </div>
                    </td>
                    <td>{t.division}</td>
                    <td>{s.gp}</td>
                    <td>{s.w}</td>
                    <td>{s.l}</td>
                    <td>{s.ot}</td>
                    <td>
                      <strong>{s.pts}</strong>
                    </td>
                    <td>
                      {s.gp
                        ? ((s.pts / (s.gp * 2)) * 100).toFixed(1) + "%"
                        : "—"}
                    </td>
                    <td className={s.gf - s.ga >= 0 ? "positive" : "negative"}>
                      {signed(s.gf - s.ga)}
                    </td>
                    <td>
                      <div className="form-row">
                        {s.results.slice(-5).map((r: any, i: number) => (
                          <span className={r.outcome} key={i}>
                            {r.outcome === "OT" ? "O" : r.outcome}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {s.gp
                        ? signed(s.pts - entryLine(table, t.id, teams))
                        : "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <p className="detail-note">
        Entry line is a points-only playoff reference. Official tiebreaks,
        clinching and elimination are not inferred from this table.
      </p>
    </section>
  );
}
