import { useMemo, useState } from "react";
import { projectedStandings } from "../lib/standings-projection.mjs";
import type { Game, Team } from "../types";
import { signed, entryLine } from "../lib/model.mjs";
import { TeamLogo } from "./TeamLogo";
import { Resumes } from "./Resumes";
import { TeamLink } from "./TeamProfile";
export function Standings({
  teams,
  table,
  selected, games, baseline,
}: {
  teams: Team[];
  table: any;
  selected: string[];
  games: Game[];
  baseline: any;
}) {
  const [group,setGroup]=useState('league'), [mode,setMode]=useState('current'), [tab,setTab]=useState<'table'|'resumes'>('table');
  const projected=useMemo(()=>projectedStandings(teams,table,games,baseline),[teams,table,games,baseline]);
  const groups=group==='league'?['League']:group==='conference'?['E','W']:['Atlantic','Metropolitan','Central','Pacific'];
  const score=(id:string)=>mode==='projected'?projected[id].projected:table[id].pts;
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
      <div className="inj-seg rs-tabs" role="group" aria-label="Standings or resumés">
        <button type="button" aria-pressed={tab==='table'} onClick={()=>setTab('table')}>Standings table</button>
        <button type="button" aria-pressed={tab==='resumes'} onClick={()=>setTab('resumes')}>Resumés: who they beat, who beat them</button>
      </div>
      {tab==='resumes' ? <Resumes teams={teams} table={table} games={games} /> : <>
      <div className="chart-filters"><label>Standings view<select value={mode} onChange={e=>setMode(e.target.value)}><option value="current">Current standings</option><option value="projected">Projected final standings</option></select></label><label>Group standings<select value={group} onChange={e=>setGroup(e.target.value)}><option value="league">League</option><option value="conference">Conference</option><option value="division">Division</option></select></label></div>
      {mode==='projected' && <p className="detail-note">Projected points = current points + remaining scheduled games × blended points pace. Current pace is blended with 20 games of prior-season pace (55% baseline if unavailable). A heuristic forecast, not playoff odds; ignores opponent strength and roster changes.</p>}
      {groups.map(label=><div key={label}><h3>{label==='E'?'Eastern Conference':label==='W'?'Western Conference':label}</h3><div className="table-scroll">
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
              {mode==='projected' && <th>Projected PTS</th>}
              <th>PTS %</th>
              <th>GD</th>
              <th>Last 5</th>
              <th>Entry-line gap</th>
            </tr>
          </thead>
          <tbody>
            {teams.filter(t=>group==='league' || (group==='conference'?t.conference:t.division)===label)
              .sort(
                (a, b) =>
                  score(b.id) - score(a.id) ||
                  a.name.localeCompare(b.name),
              )
              .map((t) => {
                const s = table[t.id],
                  cohort = teams.filter(t=>group==='league' || (group==='conference'?t.conference:t.division)===label),
                  r = {rank:1+cohort.filter(other=>score(other.id)>score(t.id)).length,tied:cohort.some(other=>other.id!==t.id && Math.abs(score(other.id)-score(t.id))<1e-9)};
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
                        <TeamLogo id={t.id} size={28} />
                        <b><TeamLink id={t.id}>{t.name}</TeamLink></b>
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
                    {mode==='projected' && <td><strong>{projected[t.id].projected.toFixed(1)}</strong></td>}
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
      </div>)}
      <p className="detail-note">
        Entry line is a points-only playoff reference. Official tiebreaks,
        clinching and elimination are not inferred from this table.
      </p>
      </>}
    </section>
  );
}
