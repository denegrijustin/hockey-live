import { useMemo } from "react";
import { finished } from "../../../lib/model.mjs";
import { isLive } from "../../../lib/game-data.mjs";
import { SIT_LABEL, goalieMetrics } from "../../../lib/nhlplus.mjs";
import { filterMinToi, nextSort, sortRows, upcomingGames } from "../../../lib/nhlplus-view.mjs";
import type { Ctx } from "../context";
import { Derived, Face, Loading, Logo, MinFilter, Panel, SitFilter, SortTh, Unavailable, effectiveMin, teamName } from "../common";
import { ScatterChart } from "../charts/ScatterChart";
import { CompareRow } from "../shared/CompareRow";
import { useStarters } from "../shared/useStarters";
import { fmt, fmtInt, fmtMin, fmtSigned, fmtSv } from "../shared/format";
import { MetricTip } from "../shared/MetricTip";
import type { Game } from "../../../types";
import type { Goalie } from "../../../lib/moneypuck-types";

type Row = Record<string, any> & { id: number; name: string; team: string };
type Col = { key: string; label: string; tip?: string; fmt: (v: any) => string; first?: "asc" | "desc" };
const TOTALS: Col[] = [
  { key: "gp", label: "GP", tip: "gp", fmt: fmtInt },
  { key: "toi", label: "TOI (min)", tip: "toi", fmt: fmtMin },
  { key: "SOG", label: "Shots faced", fmt: fmtInt },
  { key: "xGA", label: "xGA", tip: "xG", fmt: (v) => fmt(v) },
  { key: "GA", label: "GA", tip: "GA", fmt: fmtInt },
  { key: "gsax", label: "GSAx", tip: "gsax", fmt: (v) => fmtSigned(v) },
  { key: "hdGsax", label: "HD GSAx", tip: "hdGsax", fmt: (v) => fmtSigned(v) },
];
const RATES: Col[] = [
  { key: "gsaxPer60", label: "GSAx/60", tip: "gsaxPer60", fmt: (v) => fmtSigned(v) },
  { key: "svPct", label: "SV%", tip: "svPct", fmt: fmtSv },
  { key: "xSvPct", label: "xSV%", tip: "xSvPct", fmt: fmtSv },
  { key: "SOGPer60", label: "Shots faced/60", tip: "sogPer60", fmt: (v) => fmt(v, 1) },
];

export function GoalieView({ ctx }: { ctx: Ctx }) {
  const { s, set, summary, season, appGames } = ctx;
  const sitLabel = SIT_LABEL[s.sit];
  const all: Row[] = useMemo(
    () => (summary.data?.goalies ?? []).flatMap((g: Goalie) => { const m = goalieMetrics(g.sit[s.sit]); return m ? [{ id: g.id, name: g.name, team: g.team, ...m } as Row] : []; }),
    [summary.data, s.sit],
  );
  const minMin = effectiveMin("goalie", s.sit, s.gMin);
  const rows = useMemo(() => filterMinToi(all, minMin * 60).filter((r) => (r.gp ?? 0) >= s.gMinGp), [all, minMin, s.gMinGp]);
  const sorted = useMemo(() => sortRows(rows, s.gSort.key, s.gSort.dir, (r: Row, k) => (k === "name" ? r.name : r[k])), [rows, s.gSort]);
  const cmpIds = useMemo(() => {
    const valid = s.gCmp.filter((id) => rows.some((r) => r.id === id));
    return valid.length ? valid : sortRows(rows, "toi", "desc").slice(0, 2).map((r) => r.id);
  }, [s.gCmp, rows]);
  const toggleCmp = (id: number) => set({ gCmp: cmpIds.includes(id) ? cmpIds.filter((x) => x !== id) : [...cmpIds, id].slice(-2) });
  const onSort = (key: string, first: "asc" | "desc") => set({ gSort: nextSort(s.gSort, key, first) });
  const upcoming = useMemo(() => upcomingGames(appGames, (g: Game) => finished(g) || isLive(g), 6), [appGames]);
  if (summary.state === "loading") return <Loading what="goalie data" />;
  if (!summary.data) return <Unavailable what="Goalie data" onRetry={summary.retry} />;
  const pair = cmpIds.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as Row[];
  const [x, y] = pair;
  const side = (r: Row | undefined, key: string, f: (v: any) => string, sub?: string) => ({ team: r?.name ?? "", value: (r?.[key] as number | null) ?? null, text: f(r?.[key] ?? null), sub });
  return (
    <>
      <div className="np-filters">
        <SitFilter sit={s.sit} onChange={(sit) => set({ sit })} />
        <MinFilter kind="goalie" sit={s.sit} value={s.gMin} onChange={(gMin) => set({ gMin })} label="Min. minutes" />
        <label className="np-field"><span className="np-field-label">Min. games</span>
          <select aria-label="Minimum games" value={s.gMinGp} onChange={(e) => set({ gMinGp: +e.target.value })}>
            {[0, 1, 2, 3, 5].map((n) => <option key={n} value={n}>{n ? `${n}+` : "Any"}</option>)}
          </select>
        </label>
        <span className="np-count" role="status">{rows.length} of {all.length} goalies</span>
      </div>
      {upcoming.length > 0 && (
        <Panel id="np-starters" title={`Starters · ${sitLabel}`} sub={<>Upcoming games. Confirmed once the NHL box score names the goalie, otherwise projected. Season numbers in {sitLabel}.</>}>
          <ul className="np-starter-strip">
            {upcoming.map((g) => <StarterGame key={g.id} ctx={ctx} game={g} />)}
          </ul>
        </Panel>
      )}
      <div className="np-grid2">
        <Panel id="np-g-chart" title={`Goals saved above expected vs. shots faced · ${sitLabel}`} sub={<>Each logo is a goalie. Total <MetricTip id="gsax">goals saved above expected</MetricTip> rises with workload, so read it beside shots faced. <Derived /></>}>
          <ScatterChart
            ariaLabel={`Goals saved above expected versus shots faced, ${sitLabel}, one logo per goalie`}
            points={rows.map((r) => ({ key: String(r.id), x: r.SOG, y: r.gsax, team: r.team, label: `${r.name} (${r.team})`, lines: [sitLabel, `GSAx: ${fmtSigned(r.gsax)}`, `Shots faced: ${fmtInt(r.SOG)}`, `${fmtInt(r.gp)} GP · ${fmtMin(r.toi)} min`] }))}
            xLabel="Shots on goal faced" yLabel="Goals saved above expected" xFmt={(v) => String(Math.round(v))} yFmt={(v) => fmtSigned(v, 1)}
            avgY={0} avgYText="0 = as expected" dimOthers={false} highlight={cmpIds.map(String)} onToggle={(k) => toggleCmp(+k)}
          />
        </Panel>
        <Panel id="np-g-cmp" title={`Goalie comparison · ${sitLabel}`} sub="Pick two goalies in the table (Compare column).">
          {x && y ? (
            <>
              <div className="np-cmp-head"><span><Face id={x.id} team={x.team} name={x.name} season={season} size={30} />{x.name}</span><span>{y.name}<Face id={y.id} team={y.team} name={y.name} season={season} size={30} /></span></div>
              <CompareRow compact label="GSAx" tip="gsax" unit="total" left={side(x, "gsax", (v) => fmtSigned(v), `${fmtInt(x.gp)} GP · ${fmtMin(x.toi)} min`)} right={side(y, "gsax", (v) => fmtSigned(v), `${fmtInt(y.gp)} GP · ${fmtMin(y.toi)} min`)} />
              <CompareRow compact label="GSAx" tip="gsaxPer60" unit="per 60" left={side(x, "gsaxPer60", (v) => fmtSigned(v))} right={side(y, "gsaxPer60", (v) => fmtSigned(v))} />
              <CompareRow compact label="Save %" tip="svPct" diffDigits={3} left={side(x, "svPct", fmtSv)} right={side(y, "svPct", fmtSv)} />
              <CompareRow compact label="Expected save %" tip="xSvPct" diffDigits={3} left={side(x, "xSvPct", fmtSv)} right={side(y, "xSvPct", fmtSv)} />
              <CompareRow compact label="Shots faced" tip="sogPer60" unit="per 60" higherIsBetter={false} left={side(x, "SOGPer60", (v) => fmt(v, 1))} right={side(y, "SOGPer60", (v) => fmt(v, 1))} />
              <CompareRow compact label="High-danger GSAx" tip="hdGsax" unit="total" left={side(x, "hdGsax", (v) => fmtSigned(v))} right={side(y, "hdGsax", (v) => fmtSigned(v))} />
            </>
          ) : <div className="np-empty">Two goalies are needed for a comparison.</div>}
        </Panel>
      </div>
      <Panel id="np-g-table" title={`Goalies · ${sitLabel}`} sub={<>Totals count what happened; rates divide by the minutes played in {sitLabel}. GSAx, SV% and the rates are <Derived />.</>}>
        <div className="table-scroll np-table-wrap">
          <table className="np-table" aria-label={`Goalies, ${sitLabel}`}>
            <thead>
              <tr className="np-groups">
                <th rowSpan={2} className="np-cmpcol">Compare</th>
                <th rowSpan={2} scope="col" className="np-sticky np-th" aria-sort={s.gSort.key === "name" ? (s.gSort.dir === "asc" ? "ascending" : "descending") : "none"}><span className="np-th-in"><button type="button" className="np-sortbtn" onClick={() => onSort("name", "asc")}>Goalie<i aria-hidden="true">{s.gSort.key === "name" ? (s.gSort.dir === "asc" ? "▲" : "▼") : ""}</i></button></span></th>
                <th colSpan={TOTALS.length} scope="colgroup" className="np-group">Totals</th>
                <th colSpan={RATES.length} scope="colgroup" className="np-group">Rates</th>
              </tr>
              <tr>
                {[...TOTALS, ...RATES].map((c) => <SortTh key={c.key} col={c.key} label={c.label} tip={c.tip} sort={s.gSort} onSort={onSort} firstDir={c.key === "GA" || c.key === "xGA" || c.key === "SOGPer60" ? "asc" : "desc"} />)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const on = cmpIds.includes(r.id);
                return (
                  <tr key={r.id} className={on ? "highlighted" : ""} data-goalie={r.id}>
                    <td className="np-cmpcol"><input type="checkbox" checked={on} onChange={() => toggleCmp(r.id)} aria-label={`Compare ${r.name}`} /></td>
                    <th scope="row" className="np-sticky"><span className="np-player"><Face id={r.id} team={r.team} name={r.name} season={season} /><span><b>{r.name}</b><small><Logo team={r.team} size={14} />{r.team}</small></span></span></th>
                    {[...TOTALS, ...RATES].map((c) => <td key={c.key} className="np-num" data-col={c.key}>{c.fmt(r[c.key])}</td>)}
                  </tr>
                );
              })}
              {!sorted.length && <tr><td colSpan={TOTALS.length + RATES.length + 2} className="np-none">No goalies match the minimums for {sitLabel}.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function StarterGame({ ctx, game }: { ctx: Ctx; game: Game }) {
  const { season, summary, s } = ctx;
  const teams = useMemo(() => [game.away, game.home], [game.away, game.home]);
  const starters = useStarters(game, teams, season);
  const goalies = summary.data?.goalies ?? [];
  const cell = (t: string) => {
    const st = starters[t];
    const g = st?.id ? goalies.find((x) => x.id === st.id) : null;
    const m = g ? goalieMetrics(g.sit[s.sit]) : null;
    return (
      <div className="np-sg-side" data-team={t}>
        <Logo team={t} size={20} />
        <div>
          <b>{st?.name ?? "Starter unknown"}</b>
          <small><span className={`np-chip np-${st?.status ?? "unknown"}`}>{st?.status === "confirmed" ? "Confirmed" : st?.status === "projected" ? "Projected" : "Unknown"}</span>
            {m ? ` GSAx ${fmtSigned(m.gsax)} · SV% ${fmtSv(m.svPct)} · ${fmtInt(m.gp)} GP` : st?.id ? " no MoneyPuck row" : ""}</small>
        </div>
      </div>
    );
  };
  return <li className="np-sg"><span className="np-sg-when">{game.away} at {game.home}<small>{game.date}</small></span>{cell(game.away)}{cell(game.home)}</li>;
}
