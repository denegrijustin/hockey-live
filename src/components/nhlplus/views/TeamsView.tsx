import { useMemo } from "react";
import { teamTable, leagueAverage, rankBy, SIT_LABEL } from "../../../lib/nhlplus.mjs";
import { filterMinToi, nextSort, sortRows } from "../../../lib/nhlplus-view.mjs";
import type { Ctx } from "../context";
import { Derived, Loading, Logo, MinFilter, Panel, SitFilter, SortTh, Unavailable, effectiveMin, teamName } from "../common";
import { ScatterChart } from "../charts/ScatterChart";
import { RankBars } from "../charts/RankBars";
import { TEAM_METRICS, metricDef } from "../metrics";
import { fmt, fmtInt, fmtMin, fmtPct, fmtSigned } from "../shared/format";
import { MetricTip } from "../shared/MetricTip";

type Row = Record<string, any> & { team: string };
type Col = { key: string; label: string; tip?: string; fmt: (v: any) => string };
const COLS: Col[] = [
  { key: "gp", label: "GP", tip: "gp", fmt: fmtInt },
  { key: "toi", label: "TOI (min)", tip: "toi", fmt: fmtMin },
  { key: "xGF60", label: "xGF/60", tip: "xGF60", fmt: (v) => fmt(v) },
  { key: "xGA60", label: "xGA/60", tip: "xGA60", fmt: (v) => fmt(v) },
  { key: "xGPct", label: "xG%", tip: "xGPct", fmt: (v) => fmtPct(v) },
  { key: "xGF", label: "xGF", tip: "xG", fmt: (v) => fmt(v) },
  { key: "xGA", label: "xGA", tip: "xG", fmt: (v) => fmt(v) },
  { key: "GF", label: "GF", tip: "GF", fmt: fmtInt },
  { key: "GA", label: "GA", tip: "GA", fmt: fmtInt },
  { key: "goalsVsXFor", label: "GF − xGF", tip: "goalsVsX", fmt: (v) => fmtSigned(v, 1) },
  { key: "shPct", label: "Sh%", tip: "shPct", fmt: (v) => fmtPct(v) },
  { key: "svPct", label: "Sv%", tip: "svPct", fmt: (v) => fmtPct(v) },
  { key: "CF", label: "CF", tip: "CF", fmt: fmtInt },
  { key: "CA", label: "CA", tip: "CF", fmt: fmtInt },
  { key: "CFPct", label: "CF%", tip: "CFPct", fmt: (v) => fmtPct(v) },
];

export function TeamsView({ ctx }: { ctx: Ctx }) {
  const { s, set, summary, toggleTeam } = ctx;
  const sitLabel = SIT_LABEL[s.sit];
  const all: Row[] = useMemo(() => (summary.data ? teamTable(summary.data, s.sit) : []), [summary.data, s.sit]);
  const minMin = effectiveMin("team", s.sit, s.teamMin);
  const rows = useMemo(() => filterMinToi(all, minMin * 60), [all, minMin]);
  const avg = useMemo(() => ({ xGF60: leagueAverage(all, "xGF60"), xGA60: leagueAverage(all, "xGA60") }), [all]);
  const def = metricDef(s.teamMetric);
  const metricAvg = useMemo(() => leagueAverage(all, def.key), [all, def.key]);
  const ranks = useMemo(() => rankBy(all, "xGPct") as Record<string, number | null>, [all]);
  const sorted = useMemo(
    () => sortRows(rows, s.teamSort.key, s.teamSort.dir, (r: Row, k) => (k === "team" ? teamName(r.team) : r[k])),
    [rows, s.teamSort],
  );
  const onSort = (key: string, firstDir: "asc" | "desc") => set({ teamSort: nextSort(s.teamSort, key, firstDir) });
  if (summary.state === "loading") return <Loading what="team data" />;
  if (!summary.data) return <Unavailable what="Team data" onRetry={summary.retry} />;
  const unit = `${sitLabel} time`;
  const rankLine = (t: string) => (ranks[t] != null ? `xG share rank ${ranks[t]} of ${all.length}` : "xG share rank –");
  return (
    <>
      <div className="np-filters">
        <SitFilter sit={s.sit} onChange={(sit) => set({ sit })} />
        <MinFilter kind="team" sit={s.sit} value={s.teamMin} onChange={(teamMin) => set({ teamMin })} />
        <span className="np-count" role="status">{rows.length} of {all.length} teams</span>
        {s.highlight.length > 0 && <button type="button" className="np-clear" onClick={() => set({ highlight: [] })}>Clear highlight ({s.highlight.length})</button>}
      </div>
      <div className="np-grid2">
        <Panel id="np-scatter" title={`Expected goals created vs. allowed · ${sitLabel}`} sub={<>Per 60 minutes of {unit}. <Derived /> Click a logo to highlight a team.</>}>
          <ScatterChart
            ariaLabel={`Expected goals created versus allowed per 60, ${sitLabel}, one logo per team`}
            points={rows.map((r) => ({
              key: r.team, x: r.xGF60, y: r.xGA60, team: r.team, label: teamName(r.team),
              lines: [`${sitLabel}`, `xG for/60: ${fmt(r.xGF60)}`, `xG against/60: ${fmt(r.xGA60)}`, `${fmtInt(r.gp)} GP · ${fmtMin(r.toi)} min`, rankLine(r.team)],
            }))}
            xLabel="xG created per 60 (xG for)" yLabel="xG allowed per 60 (xG against)" xBetterNote="more is better →" yBetterNote="fewer is better ↑"
            xFmt={(v) => v.toFixed(1)} yFmt={(v) => v.toFixed(1)} invertY avgX={avg.xGF60} avgY={avg.xGA60}
            avgXText={`Avg ${fmt(avg.xGF60)}`} avgYText={`Avg ${fmt(avg.xGA60)}`}
            highlight={s.highlight} onToggle={toggleTeam}
          />
        </Panel>
        <Panel id="np-bars" title={`${def.label} · ${sitLabel}`} sub={<>{def.unit} · <Derived /></>}
          actions={
            <label className="np-field"><span className="np-field-label"><MetricTip id={def.tip}>Metric</MetricTip></span>
              <select aria-label="Ranked metric" value={s.teamMetric} onChange={(e) => set({ teamMetric: e.target.value })}>
                {TEAM_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
          }>
          <RankBars
            ariaLabel={`${def.label} by team, ${sitLabel}`} metricLabel={def.label} higherIsBetter={def.higherIsBetter}
            avg={metricAvg} avgText={def.fmt(metricAvg)} highlight={s.highlight} onToggle={toggleTeam}
            items={rows.map((r) => ({ key: r.team, label: teamName(r.team), team: r.team, value: r[def.key] ?? null, text: def.fmt(r[def.key] ?? null), lines: [`${def.label}: ${def.fmt(r[def.key] ?? null)}`, `${fmtInt(r.gp)} GP`, `${fmtMin(r.toi)} min of ${sitLabel}`] }))}
          />
        </Panel>
      </div>
      <Panel id="np-table" title={`Team statistics · ${sitLabel}`} sub={<>Totals and per-60 rates over {unit}; GP and time on ice show the sample. Rates, shares and Sh%/Sv% are <Derived />.</>}>
        <div className="table-scroll np-table-wrap">
          <table className="np-table" aria-label={`Team statistics, ${sitLabel}`}>
            <thead>
              <tr>
                <SortTh col="team" label="Team" sort={s.teamSort} onSort={onSort} firstDir="asc" className="np-sticky" />
                {COLS.map((c) => <SortTh key={c.key} col={c.key} label={c.label} tip={c.tip} sort={s.teamSort} onSort={onSort} firstDir={c.key === "xGA60" || c.key === "GA" || c.key === "CA" || c.key === "xGA" ? "asc" : "desc"} />)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const on = s.highlight.includes(r.team);
                return (
                  <tr key={r.team} className={on ? "highlighted" : ""} data-team={r.team}>
                    <th scope="row" className="np-sticky">
                      <button type="button" className="np-teambtn" aria-pressed={on} onClick={() => toggleTeam(r.team)} title={`Highlight ${teamName(r.team)}`}>
                        <Logo team={r.team} /><b>{r.team}</b><span className="np-teamname">{teamName(r.team)}</span>
                      </button>
                    </th>
                    {COLS.map((c) => <td key={c.key} className="np-num" data-col={c.key}>{c.fmt(r[c.key])}</td>)}
                  </tr>
                );
              })}
              {!sorted.length && <tr><td colSpan={COLS.length + 1} className="np-none">No teams have {minMin} min of {sitLabel} time yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
