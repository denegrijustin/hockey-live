import { useMemo, useState } from "react";
import { SIT_LABEL, lineMetrics, skaterMetrics } from "../../../lib/nhlplus.mjs";
import { filterMinToi, matches, nextSort, sortRows } from "../../../lib/nhlplus-view.mjs";
import type { Ctx } from "../context";
import { Derived, Face, Loading, Logo, MinFilter, Panel, SitFilter, SortTh, TeamSelect, Unavailable, effectiveMin, teamName } from "../common";
import { fmt, fmtInt, fmtMin, fmtPct, fmtSigned } from "../shared/format";
import { MetricTip } from "../shared/MetricTip";
import type { Skater } from "../../../lib/moneypuck-types";

type Row = Record<string, any> & { id: number; name: string; team: string; pos: string };
type Col = { key: string; label: string; tip?: string; fmt: (v: any) => string; first?: "asc" | "desc" };
const INDIVIDUAL: Col[] = [
  { key: "G", label: "G", tip: "ind", fmt: fmtInt },
  { key: "A", label: "A", fmt: fmtInt },
  { key: "P", label: "P", fmt: fmtInt },
  { key: "SOG", label: "SOG", fmt: fmtInt },
  { key: "ixG", label: "ixG", tip: "ixG", fmt: (v) => fmt(v) },
  { key: "goalsVsIxG", label: "G − ixG", tip: "goalsVsX", fmt: (v) => fmtSigned(v) },
];
const ONICE: Col[] = [
  { key: "xGF", label: "xGF", tip: "onIce", fmt: (v) => fmt(v) },
  { key: "xGA", label: "xGA", first: "asc", fmt: (v) => fmt(v) },
  { key: "xGPct", label: "xG%", tip: "xGPct", fmt: (v) => fmtPct(v) },
  { key: "CFPct", label: "CF%", tip: "CFPct", fmt: (v) => fmtPct(v) },
];
const PAGE = 50;

export function PlayersView({ ctx }: { ctx: Ctx }) {
  const { s, set } = ctx;
  return (
    <>
      <div className="np-filters">
        <div className="segmented np-seg" role="group" aria-label="Player tables">
          <button type="button" aria-pressed={s.pTab === "skaters"} onClick={() => set({ pTab: "skaters" })}>Skaters</button>
          <button type="button" aria-pressed={s.pTab === "lines"} onClick={() => set({ pTab: "lines" })}>Lines &amp; pairings</button>
        </div>
      </div>
      {s.pTab === "skaters" ? <Skaters ctx={ctx} /> : <Lines ctx={ctx} />}
    </>
  );
}

function Skaters({ ctx }: { ctx: Ctx }) {
  const { s, set, skaters, season } = ctx;
  const [limit, setLimit] = useState(PAGE);
  const sitLabel = SIT_LABEL[s.sit];
  const all: Row[] = useMemo(() => (skaters.data?.skaters ?? []).flatMap((p: Skater) => {
    const m = skaterMetrics(p.sit[s.sit]);
    return m ? [{ id: p.id, name: p.name, team: p.team, pos: p.pos, gp: m.gp, toi: m.toi, toiPerGame: m.toiPerGame, ...m.individual, ...m.onIce } as Row] : [];
  }), [skaters.data, s.sit]);
  const minMin = effectiveMin("skater", s.sit, s.pMin);
  const rows = useMemo(() => filterMinToi(all, minMin * 60)
    .filter((r) => (s.pPos === "all" ? true : s.pPos === "D" ? r.pos === "D" : r.pos !== "D"))
    .filter((r) => s.pTeam === "all" || r.team === s.pTeam)
    .filter((r) => matches(s.pQuery, r.name)), [all, minMin, s.pPos, s.pTeam, s.pQuery]);
  const sorted = useMemo(() => sortRows(rows, s.pSort.key, s.pSort.dir, (r: Row, k) => (k === "name" ? r.name : r[k])), [rows, s.pSort]);
  const onSort = (key: string, first: "asc" | "desc") => { set({ pSort: nextSort(s.pSort, key, first) }); setLimit(PAGE); };
  if (skaters.state === "loading") return <Loading what="skater data" />;
  if (!skaters.data) return <Unavailable what="Skater data" onRetry={skaters.retry} />;
  const sortHead = (key: string, label: string, first: "asc" | "desc") => (
    <th rowSpan={2} scope="col" className="np-sticky np-th" aria-sort={s.pSort.key === key ? (s.pSort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <span className="np-th-in"><button type="button" className="np-sortbtn" onClick={() => onSort(key, first)}>{label}<i aria-hidden="true">{s.pSort.key === key ? (s.pSort.dir === "asc" ? "▲" : "▼") : ""}</i></button></span>
    </th>
  );
  return (
    <>
      <div className="np-filters">
        <SitFilter sit={s.sit} onChange={(sit) => set({ sit })} />
        <label className="np-field"><span className="np-field-label">Position</span>
          <select aria-label="Position" value={s.pPos} onChange={(e) => { set({ pPos: e.target.value as any }); setLimit(PAGE); }}>
            <option value="all">All skaters</option><option value="F">Forwards</option><option value="D">Defensemen</option>
          </select>
        </label>
        <TeamSelect all label="Team" value={s.pTeam} onChange={(pTeam) => { set({ pTeam }); setLimit(PAGE); }} />
        <MinFilter kind="skater" sit={s.sit} value={s.pMin} onChange={(pMin) => { set({ pMin }); setLimit(PAGE); }} />
        <label className="np-field"><span className="np-field-label">Find a player</span>
          <input type="search" aria-label="Find a player" placeholder="Name" value={s.pQuery} onChange={(e) => { set({ pQuery: e.target.value }); setLimit(PAGE); }} />
        </label>
        <span className="np-count" role="status">{rows.length} of {all.length} skaters</span>
      </div>
      <Panel id="np-skaters" title={`Skaters · ${sitLabel}`} sub={<>Individual numbers are the player's own; on-ice numbers count everything while he was out there, whoever shot. Rates and shares are <Derived />.</>}>
        <div className="table-scroll np-table-wrap">
          <table className="np-table" aria-label={`Skaters, ${sitLabel}`}>
            <thead>
              <tr className="np-groups">
                {sortHead("name", "Player", "asc")}
                <th rowSpan={2} className="np-th">Pos</th>
                <SortTh col="gp" label="GP" tip="gp" sort={s.pSort} onSort={onSort} rowSpan={2} />
                <SortTh col="toi" label="TOI (min)" tip="toi" sort={s.pSort} onSort={onSort} rowSpan={2} />
                <th colSpan={INDIVIDUAL.length} scope="colgroup" className="np-group"><MetricTip id="ind">Individual</MetricTip></th>
                <th colSpan={ONICE.length} scope="colgroup" className="np-group"><MetricTip id="onIce">On-ice</MetricTip></th>
              </tr>
              <tr>
                {INDIVIDUAL.map((c) => <SortTh key={c.key} col={c.key} label={c.label} tip={c.key === "G" ? undefined : c.tip} sort={s.pSort} onSort={onSort} firstDir={c.first ?? "desc"} />)}
                {ONICE.map((c) => <SortTh key={c.key} col={c.key} label={c.label} tip={c.key === "xGF" ? undefined : c.tip} sort={s.pSort} onSort={onSort} firstDir={c.first ?? "desc"} />)}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, limit).map((r) => (
                <tr key={`${r.id}-${r.team}`} data-player={r.id}>
                  <th scope="row" className="np-sticky"><span className="np-player"><Face id={r.id} team={r.team} name={r.name} season={ctx.season} /><span><b>{r.name}</b><small><Logo team={r.team} size={14} />{r.team}</small></span></span></th>
                  <td>{r.pos}</td>
                  <td className="np-num" data-col="gp">{fmtInt(r.gp)}</td>
                  <td className="np-num" data-col="toi">{fmtMin(r.toi)}</td>
                  {[...INDIVIDUAL, ...ONICE].map((c) => <td key={c.key} className="np-num" data-col={c.key}>{c.fmt(r[c.key])}</td>)}
                </tr>
              ))}
              {!sorted.length && <tr><td colSpan={4 + INDIVIDUAL.length + ONICE.length + 1} className="np-none">No skaters match these filters in {sitLabel}.</td></tr>}
            </tbody>
          </table>
        </div>
        {sorted.length > limit && <button type="button" className="np-more" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, sorted.length - limit)} more · {limit} of {sorted.length}</button>}
      </Panel>
    </>
  );
}

const LINE_COLS: Col[] = [
  { key: "gp", label: "GP", tip: "gp", fmt: fmtInt },
  { key: "toi", label: "TOI (min)", tip: "toi", fmt: fmtMin },
  { key: "xGF60", label: "xGF/60", tip: "xGF60", fmt: (v) => fmt(v) },
  { key: "xGA60", label: "xGA/60", tip: "xGA60", first: "asc", fmt: (v) => fmt(v) },
  { key: "xGPct", label: "xG%", tip: "xGPct", fmt: (v) => fmtPct(v) },
  { key: "GF", label: "GF", tip: "GF", fmt: fmtInt },
  { key: "GA", label: "GA", tip: "GA", first: "asc", fmt: fmtInt },
  { key: "CFPct", label: "CF%", tip: "CFPct", fmt: (v) => fmtPct(v) },
];

function Lines({ ctx }: { ctx: Ctx }) {
  const { s, set, lines, skaters, season } = ctx;
  const [limit, setLimit] = useState(40);
  const byId = useMemo(() => new Map((skaters.data?.skaters ?? []).map((p) => [p.id, p])), [skaters.data]);
  const all = useMemo(() => (lines.data?.lines ?? []).map((l) => ({ ...lineMetrics(l), id: l.id, name: l.name, team: l.team, type: l.type, players: l.players })), [lines.data]);
  const minMin = effectiveMin("line", "5on5", s.lMin);
  const rows = useMemo(() => filterMinToi(all, minMin * 60).filter((r) => r.type === s.lType && (s.lTeam === "all" || r.team === s.lTeam)), [all, minMin, s.lType, s.lTeam]);
  const sorted = useMemo(() => sortRows(rows, s.lSort.key, s.lSort.dir, (r: any, k) => (k === "name" ? r.name : r[k])), [rows, s.lSort]);
  const onSort = (key: string, first: "asc" | "desc") => { set({ lSort: nextSort(s.lSort, key, first) }); setLimit(40); };
  if (lines.state === "loading") return <Loading what="line data" />;
  if (!lines.data) return <Unavailable what="Line data" onRetry={lines.retry} />;
  const title = s.lType === "line" ? "Forward lines" : "Defense pairings";
  return (
    <>
      <div className="np-filters">
        <div className="segmented np-seg" role="group" aria-label="Lines or pairings">
          <button type="button" aria-pressed={s.lType === "line"} onClick={() => { set({ lType: "line" }); setLimit(40); }}>Forward lines</button>
          <button type="button" aria-pressed={s.lType === "pairing"} onClick={() => { set({ lType: "pairing" }); setLimit(40); }}>Defense pairings</button>
        </div>
        <TeamSelect all label="Team" value={s.lTeam} onChange={(lTeam) => { set({ lTeam }); setLimit(40); }} />
        <MinFilter kind="line" sit="5on5" value={s.lMin} onChange={(lMin) => { set({ lMin }); setLimit(40); }} label="Min. time together" />
        <span className="np-count" role="status">{rows.length} of {all.filter((r) => r.type === s.lType).length}</span>
      </div>
      <Panel id="np-lines" title={`${title} · 5-on-5`} sub={<>MoneyPuck publishes lines and pairings for 5-on-5 only. Rates divide by the time the group played together. <Derived /></>}>
        <div className="table-scroll np-table-wrap">
          <table className="np-table" aria-label={`${title}, 5-on-5`}>
            <thead>
              <tr>
                <SortTh col="name" label={s.lType === "line" ? "Line" : "Pairing"} sort={s.lSort} onSort={onSort} firstDir="asc" className="np-sticky" />
                <th scope="col" className="np-th">Team</th>
                {LINE_COLS.map((c) => <SortTh key={c.key} col={c.key} label={c.label} tip={c.tip} sort={s.lSort} onSort={onSort} firstDir={c.first ?? "desc"} />)}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, limit).map((r) => (
                <tr key={r.id} data-line={r.id}>
                  <th scope="row" className="np-sticky">
                    <span className="np-linemates">
                      {r.players.map((pid: number) => {
                        const p = byId.get(pid);
                        return <span key={pid} className="np-player np-player-sm">{p ? <Face id={pid} team={p.team === r.team ? r.team : p.team} name={p.name} season={season} size={26} /> : <span className="np-face np-face-fallback" style={{ width: 26, height: 26 }} />}<b>{p?.name ?? `#${pid}`}</b></span>;
                      })}
                    </span>
                  </th>
                  <td><Logo team={r.team} size={16} /> {r.team}</td>
                  {LINE_COLS.map((c) => <td key={c.key} className="np-num" data-col={c.key}>{c.fmt((r as any)[c.key])}</td>)}
                </tr>
              ))}
              {!sorted.length && <tr><td colSpan={LINE_COLS.length + 2} className="np-none">No {title.toLowerCase()} have {minMin} min together yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {sorted.length > limit && <button type="button" className="np-more" onClick={() => setLimit((n) => n + 40)}>Show 40 more · {limit} of {sorted.length}</button>}
      </Panel>
    </>
  );
}
