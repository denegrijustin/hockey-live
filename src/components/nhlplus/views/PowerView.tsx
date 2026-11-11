import { useMemo } from "react";
import { powerRankings, luckNote } from "../../../lib/power-rankings.mjs";
import { nextSort, sortRows } from "../../../lib/nhlplus-view.mjs";
import type { Ctx } from "../context";
import { Derived, Loading, Logo, Panel, SortTh, Unavailable, teamName } from "../common";
import { fmtInt, fmtPct, fmtSigned } from "../shared/format";
import "./power.css";

type Row = ReturnType<typeof powerRankings>["rows"][number];
const COLS: { key: "power" | "chances" | "goaltending" | "finishing"; label: string; long: string; tip: string }[] = [
  { key: "power", label: "Power", long: "Power score", tip: "Goal differential per game: scoring chances + goaltending + finishing." },
  { key: "chances", label: "Chances", long: "Scoring chances", tip: "Expected goals for minus against, per game: the quality of shots a team creates and allows." },
  { key: "goaltending", label: "Goalie", long: "Goaltending", tip: "Goals saved beyond what the shots were expected to allow, per game." },
  { key: "finishing", label: "Finish", long: "Finishing", tip: "Goals scored beyond what the shots were expected to score, per game." },
];

/** Power rankings: every team, with its goal differential split into chances, goaltending and finishing. Heat shows how far from even each part is. */
export function PowerView({ ctx }: { ctx: Ctx }) {
  const { s, set, summary, toggleTeam } = ctx;
  const sit = s.powerSit;
  const { rows, maxAbs } = useMemo((): { rows: Row[]; maxAbs: Record<string, number> } => (summary.data ? powerRankings(summary.data.teams, sit) : { rows: [], maxAbs: {} }), [summary.data, sit]);
  const sorted = useMemo(
    () => sortRows(rows, s.powerSort.key, s.powerSort.dir, (r: Row, k: string) => (k === "team" ? teamName(r.team) : (r as any)[k])),
    [rows, s.powerSort],
  );
  const onSort = (key: string, firstDir: "asc" | "desc") => set({ powerSort: nextSort(s.powerSort, key, firstDir) });
  if (summary.state === "loading") return <Loading what="team data" />;
  if (!summary.data) return <Unavailable what="Team data" onRetry={summary.retry} />;
  const sitLabel = sit === "all" ? "all situations" : "5-on-5";
  return (
    <>
      <div className="np-filters">
        <div className="np-field">
          <span className="np-field-label">Situation</span>
          <div className="segmented np-seg" role="group" aria-label="Situation">
            {([["all", "All"], ["5on5", "5-on-5"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={sit === id} onClick={() => set({ powerSit: id })}>{label}</button>)}
          </div>
        </div>
        <span className="np-count" role="status">{rows.length} teams · sorted by {COLS.find((c) => c.key === s.powerSort.key)?.long ?? (s.powerSort.key === "team" ? "team" : "xG%")}</span>
        {s.highlight.length > 0 && <button type="button" className="np-clear" onClick={() => set({ highlight: [] })}>Clear highlight ({s.highlight.length})</button>}
      </div>
      <Panel id="np-power" title={`Power rankings · ${sitLabel}`} sub={<>Goals per game. Power score = scoring chances + goaltending + finishing. <Derived /> Tap a team to highlight it; tap a heading to sort.</>}>
        <div className="pw-wrap">
          <table className="pw-table" aria-label={`Power rankings, ${sitLabel}`}>
            <thead>
              <tr>
                <th scope="col" className="pw-rank"><span className="sr-only">Power rank</span><span aria-hidden="true">#</span></th>
                <SortTh col="team" label="Team" sort={s.powerSort} onSort={onSort} firstDir="asc" className="pw-teamh" />
                {COLS.map((c) => <SortTh key={c.key} col={c.key} label={c.label} title={`${c.long}: ${c.tip}`} sort={s.powerSort} onSort={onSort} />)}
                <SortTh col="xGPct" label="xG%" title="Share of the expected goals in the team's games" sort={s.powerSort} onSort={onSort} className="pw-xg" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: Row) => {
                const on = s.highlight.includes(r.team);
                const note = luckNote(r);
                return (
                  <tr key={r.team} className={on ? "highlighted" : ""} data-team={r.team}>
                    <td className="pw-rank">{r.rank}</td>
                    <th scope="row" className="pw-team">
                      <button type="button" className="np-teambtn" aria-pressed={on} onClick={() => toggleTeam(r.team)} title={`Highlight ${teamName(r.team)}${note ? ` · ${note}` : ""}`}>
                        <Logo team={r.team} size={26} /><span className="pw-name"><b>{r.team}</b><span className="np-teamname">{teamName(r.team)}</span></span>
                      </button>
                    </th>
                    {COLS.map((c) => {
                      const v = r[c.key];
                      const a = Math.min(1, Math.abs(v) / (maxAbs[c.key] || 1));
                      return <td key={c.key} className={`pw-num ${v >= 0 ? "pos" : "neg"}`} data-col={c.key} style={{ ["--a" as any]: a.toFixed(3) }} title={`${c.long}: ${fmtSigned(v)} goals per game`}>{fmtSigned(v)}</td>;
                    })}
                    <td className="pw-num pw-xg" data-col="xGPct">{fmtPct(r.xGPct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="pw-note">Each team played {fmtInt(Math.min(...rows.map((r: Row) => r.gp)))}–{fmtInt(Math.max(...rows.map((r: Row) => r.gp)))} games; a short sample is noisy. When Goalie or Finish is large, results are running ahead of (or behind) the chances, so the Chances column is the steadier read. Source: MoneyPuck team totals, calculated here; this is not MoneyPuck’s own power model.</p>
      </Panel>
    </>
  );
}
