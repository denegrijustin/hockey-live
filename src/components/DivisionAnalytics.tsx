import { useMemo, useState } from "react";
import type { Team } from "../types";
import { useMoneyPuck } from "../lib/moneypuck-client";
import { analyticsRows, cellColors, divisionView, formatMetric, METRICS, ordinal, sortRows } from "../lib/division-analytics.mjs";
import { compareStandings } from "../lib/standings-view.mjs";
import { TeamLink } from "./TeamProfile";
import { TeamLogo } from "./TeamLogo";
import "./division-analytics.css";

const DIVISIONS = ["Atlantic", "Metropolitan", "Central", "Pacific"] as const;
type SortKey = "pos" | "team" | "pts" | "gd" | "xg" | "goals" | "gsax" | "special" | "xgRank";

/** Column headers: two lines, as in the table's design. */
const COLS: { key: SortKey; head: [string, string?]; tip?: string; cls?: string }[] = [
  { key: "pts", head: ["PTS"], cls: "an-pts", tip: "Points" },
  ...METRICS.map((m) => ({
    key: m.key as SortKey,
    head: (m.key === "gd" ? ["GOAL DIFF", "A GAME"] : m.key === "xg" ? ["5V5 XG", "SHARE"] : m.key === "goals" ? ["5V5 GOAL", "SHARE"] : m.key === "gsax" ? ["GSAX"] : ["SPECIAL", "TEAMS"]) as [string, string?],
    tip: m.tip,
  })),
  { key: "xgRank", head: ["DIVISION RANK", "ON 5V5 PLAY"], cls: "an-rank", tip: "Rank inside the division by 5v5 expected-goals share. The arrow compares it with the standings position" },
];

/**
 * The division's standings with the analytics next to them: points, goal differential a game, 5v5 expected-goals share, 5v5 goal share, goals saved above expected and
 * net special-teams goals, each tile coloured by the team's rank among all the teams in the league, and the rank on 5v5 play inside the division with an arrow against
 * the standings position. A column header sorts by that column (click again to reverse).
 */
export function DivisionAnalytics({ teams, rowsMap, season, myTeam }: { teams: Team[]; rowsMap: Record<string, any>; season: number; myTeam?: string | null }) {
  const mine = teams.find((t) => t.id === myTeam)?.division;
  const [division, setDivision] = useState<string>(mine && DIVISIONS.includes(mine as never) ? mine : "Pacific");
  const [sort, setSort] = useState<{ key: SortKey; reverse: boolean }>({ key: "pos", reverse: false });
  const { data, state } = useMoneyPuck(season, "summary");
  const shortOf = (id: string) => teams.find((t) => t.id === id)?.short ?? id;
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
  const all = useMemo(() => analyticsRows(teams, rowsMap, data), [teams, rowsMap, data]);
  const view = useMemo(() => divisionView(all, division, (a: string, b: string) => compareStandings({ ...rowsMap[a], name: nameOf(a) }, { ...rowsMap[b], name: nameOf(b) })), [all, division, rowsMap]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => sortRows(view, sort.key, sort.reverse), [view, sort]);
  const haveMp = all.some((r: any) => r.xg != null);
  const pool = all.filter((r: any) => r.xg != null).length || teams.length;

  const click = (key: SortKey) => setSort((s) => (s.key === key ? { key, reverse: !s.reverse } : { key, reverse: false }));
  const th = (key: SortKey, head: string[], opts: { tip?: string; cls?: string } = {}) => {
    const on = sort.key === key;
    return (
      <th scope="col" key={key} className={`an-th${opts.cls ? ` ${opts.cls}` : ""}${on ? " on" : ""}`} aria-sort={on ? (sort.reverse ? (key === "pos" || key === "team" || key === "xgRank" ? "descending" : "ascending") : (key === "pos" || key === "team" || key === "xgRank" ? "ascending" : "descending")) : "none"}>
        <button type="button" onClick={() => click(key)} title={opts.tip}>
          <span className="an-hd">{head.map((h, i) => <span key={i}>{h}</span>)}</span>
          <i className="an-caret" aria-hidden="true">{on ? (((key === "pos" || key === "team" || key === "xgRank") !== sort.reverse) ? "▲" : "▼") : ""}</i>
        </button>
      </th>
    );
  };

  return (
    <section className="an" data-testid="division-analytics" aria-label={`${division} Division standings and analytics`}>
      <div className="an-divs" role="group" aria-label="Division">
        {DIVISIONS.map((d) => <button key={d} type="button" aria-pressed={d === division} onClick={() => setDivision(d)}>{d}</button>)}
      </div>
      <div className="an-card">
        <header className="an-title">
          <img src="/network-logos/nhln.png" alt="" width="56" height="56" />
          <span className="an-bar" aria-hidden="true" />
          <h3>{division.toUpperCase()} DIVISION</h3>
          <span className="an-bar an-bar2" aria-hidden="true" />
          <span className="an-sub">STANDINGS &amp; ANALYTICS</span>
        </header>
        <div className="an-scroll">
          <table className="an-table" data-testid="an-table">
            <caption className="sr-only">{division} Division: standings with expected-goals, goal-share, goaltending and special-teams analytics. Tile colour is the league rank of all {pool} teams. Column headers sort the table.</caption>
            <thead>
              <tr>
                {th("pos", ["#"], { cls: "an-num", tip: "Standings position in the division" })}
                {th("team", ["TEAM"], { cls: "an-team" })}
                {COLS.map((c) => th(c.key, c.head as string[], { tip: c.tip, cls: c.cls }))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} data-team={r.id} className={r.id === myTeam ? "mine" : ""}>
                  <td className="an-num"><span className="an-chip">{r.pos}</span></td>
                  <td className="an-team">
                    <div className="an-tm">
                      <TeamLogo id={r.id} size={46} />
                      <span><b><TeamLink id={r.id}><span className="an-long">{r.name}</span><span className="an-short" aria-hidden="true">{shortOf(r.id)}</span></TeamLink></b><small>{r.gp} GP<span className="an-pp"> · {r.ptsPct == null ? "—" : r.ptsPct.toFixed(3)} pts%</span></small></span>
                    </div>
                  </td>
                  <td className="an-pts"><strong>{r.pts}</strong></td>
                  {METRICS.map((m: any) => {
                    const v = r[m.key], rank = r.ranks[m.key], c = cellColors(rank, pool);
                    return (
                      <td key={m.key} className="an-cell" data-metric={m.key}>
                        <div className={`an-tile${rank == null ? " none" : ""}`} style={{ "--c1": c.c1, "--c2": c.c2, "--fg": c.fg } as React.CSSProperties} title={rank == null ? undefined : `${nameOf(r.id)}: ${m.label} ${formatMetric(m.key, v)}, ${ordinal(rank)} of ${pool} in the league`}>
                          <b>{formatMetric(m.key, v)}</b>
                          <small>{rank == null ? "" : ordinal(rank)}</small>
                        </div>
                      </td>
                    );
                  })}
                  <td className="an-rank">
                    <div className="an-rk" data-change={r.change == null ? "" : r.change > 0 ? "up" : r.change < 0 ? "down" : "same"} title={r.xgRank == null ? undefined : `${ordinal(r.xgRank)} in the division on 5v5 expected-goals share; standings position ${r.pos}`}>
                      <b>{r.xgRank ?? "—"}</b>
                      {r.change != null && (r.change === 0 ? <i className="same" aria-label="no change">=</i> : <i className={r.change > 0 ? "up" : "down"}><span aria-hidden="true">{r.change > 0 ? "▲" : "▼"}</span> {Math.abs(r.change)}<span className="sr-only">{r.change > 0 ? " places better than the standings" : " places worse than the standings"}</span></i>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="an-legend">
        <div className="an-key">
          <h4>CELL COLOUR = LEAGUE RANK <span>(ALL {pool} TEAMS)</span></h4>
          <span className="an-scale" aria-hidden="true" />
          <p><span>1st<br />(Best)</span><span>{ordinal(pool)}<br />(Worst)</span></p>
        </div>
        <div className="an-note">
          <h4>DIVISION RANK ON 5V5 PLAY</h4>
          <p>Division rank by 5v5 xG share compared to standings position. Arrow shows the change in rank (<b className="up">▲</b> up, <b className="down">▼</b> down, = no change).</p>
        </div>
      </div>
      {!haveMp && <p className="an-state" role="status">{state === "loading" || state === "idle" ? "Loading the MoneyPuck numbers…" : "MoneyPuck numbers are not available right now, so only the standings columns are filled in."}</p>}
      <p className="an-foot">Standings from completed games. 5v5 shares, goals saved above expected and special-teams goals from MoneyPuck. Special teams is the net goals for minus against on the power play and the penalty kill, per game.</p>
    </section>
  );
}
