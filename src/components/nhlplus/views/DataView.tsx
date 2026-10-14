import { Fragment, useMemo, useState } from "react";
import { MONEYPUCK, seasonYear, sourceUrls } from "../../../lib/moneypuck.mjs";
import { SIT_LABEL } from "../../../lib/nhlplus.mjs";
import { matches, nextSort, refreshMessage, sortRows } from "../../../lib/nhlplus-view.mjs";
import type { Sit } from "../../../lib/moneypuck-types";
import type { Ctx } from "../context";
import { Loading, Logo, Panel, SitFilter, SortTh, Unavailable, teamName } from "../common";
import { DASH } from "../shared/format";
import type { NpState } from "../state";

type SitRow = any;
type Def = { key: string; label: string; unit: string; field: string; get: (r: SitRow) => number | null | undefined; main?: boolean };
type Derived = { label: string; unit: string; formula: string };

const d = (key: string, label: string, unit: string, field: string, get: Def["get"], main = false): Def => ({ key, label, unit, field, get, main });
const TEAM_DEFS: Def[] = [
  d("gp", "Games played", "games", "games_played", (r) => r.gp, true), d("toi", "Time on ice", "seconds", "iceTime", (r) => r.toi, true),
  d("xGF", "Expected goals for", "xG", "xGoalsFor", (r) => r.xGF, true), d("xGA", "Expected goals against", "xG", "xGoalsAgainst", (r) => r.xGA, true),
  d("GF", "Goals for", "goals", "goalsFor", (r) => r.GF, true), d("GA", "Goals against", "goals", "goalsAgainst", (r) => r.GA, true),
  d("SOGF", "Shots on goal for", "shots", "shotsOnGoalFor", (r) => r.SOGF, true), d("SOGA", "Shots on goal against", "shots", "shotsOnGoalAgainst", (r) => r.SOGA, true),
  d("CF", "Shot attempts for", "attempts", "shotAttemptsFor", (r) => r.CF, true), d("CA", "Shot attempts against", "attempts", "shotAttemptsAgainst", (r) => r.CA, true),
  d("hdxGF", "High-danger xG for", "xG", "highDangerxGoalsFor", (r) => r.hdxGF), d("hdxGA", "High-danger xG against", "xG", "highDangerxGoalsAgainst", (r) => r.hdxGA),
  d("hdGF", "High-danger goals for", "goals", "highDangerGoalsFor", (r) => r.hdGF), d("hdGA", "High-danger goals against", "goals", "highDangerGoalsAgainst", (r) => r.hdGA),
  d("hdSF", "High-danger shots for", "attempts", "highDangerShotsFor", (r) => r.hdSF), d("hdSA", "High-danger shots against", "attempts", "highDangerShotsAgainst", (r) => r.hdSA),
  d("penF", "Penalties taken", "penalties", "penaltiesFor", (r) => r.penF), d("penA", "Penalties drawn", "penalties", "penaltiesAgainst", (r) => r.penA),
  d("pimF", "Penalty minutes taken", "minutes", "penalityMinutesFor", (r) => r.pimF), d("pimA", "Penalty minutes drawn", "minutes", "penalityMinutesAgainst", (r) => r.pimA),
  d("srcX", "xG% as published", "0–1", "xGoalsPercentage", (r) => r.src?.xGoalsPercentage), d("srcC", "Corsi% as published", "0–1", "corsiPercentage", (r) => r.src?.corsiPercentage),
  d("srcF", "Fenwick% as published", "0–1", "fenwickPercentage", (r) => r.src?.fenwickPercentage),
];
const GOALIE_DEFS: Def[] = [
  d("gp", "Games played", "games", "games_played", (r) => r.gp, true), d("toi", "Time on ice", "seconds", "icetime", (r) => r.toi, true),
  d("SOG", "Shots on goal faced", "shots", "ongoal", (r) => r.SOG, true), d("xGA", "Expected goals against", "xG", "xGoals", (r) => r.xGA, true), d("GA", "Goals against", "goals", "goals", (r) => r.GA, true),
  d("xReb", "Expected rebounds", "rebounds", "xRebounds", (r) => r.xRebounds), d("reb", "Rebounds", "rebounds", "rebounds", (r) => r.rebounds),
  d("ldAtt", "Low-danger attempts faced", "attempts", "lowDangerShots", (r) => r.ld?.att), d("ldxGA", "Low-danger xG against", "xG", "lowDangerxGoals", (r) => r.ld?.xGA), d("ldGA", "Low-danger goals against", "goals", "lowDangerGoals", (r) => r.ld?.GA),
  d("mdAtt", "Medium-danger attempts faced", "attempts", "mediumDangerShots", (r) => r.md?.att), d("mdxGA", "Medium-danger xG against", "xG", "mediumDangerxGoals", (r) => r.md?.xGA), d("mdGA", "Medium-danger goals against", "goals", "mediumDangerGoals", (r) => r.md?.GA),
  d("hdAtt", "High-danger attempts faced", "attempts", "highDangerShots", (r) => r.hd?.att), d("hdxGA", "High-danger xG against", "xG", "highDangerxGoals", (r) => r.hd?.xGA), d("hdGA", "High-danger goals against", "goals", "highDangerGoals", (r) => r.hd?.GA),
];
const SKATER_DEFS: Def[] = [
  d("gp", "Games played", "games", "games_played", (r) => r.gp, true), d("toi", "Time on ice", "seconds", "icetime", (r) => r.toi, true), d("shifts", "Shifts", "shifts", "shifts", (r) => r.shifts),
  d("gameScore", "Game score", "points", "gameScore", (r) => r.gameScore),
  d("G", "Goals", "goals", "I_F_goals", (r) => r.ind?.G, true), d("A1", "Primary assists", "assists", "I_F_primaryAssists", (r) => r.ind?.A1), d("A2", "Secondary assists", "assists", "I_F_secondaryAssists", (r) => r.ind?.A2),
  d("P", "Points", "points", "I_F_points", (r) => r.ind?.P, true), d("SOG", "Shots on goal", "shots", "I_F_shotsOnGoal", (r) => r.ind?.SOG, true), d("SA", "Shot attempts", "attempts", "I_F_shotAttempts", (r) => r.ind?.SA),
  d("ixG", "Individual xG", "xG", "I_F_xGoals", (r) => r.ind?.xG, true), d("hits", "Hits", "hits", "I_F_hits", (r) => r.ind?.hits), d("take", "Takeaways", "count", "I_F_takeaways", (r) => r.ind?.take), d("give", "Giveaways", "count", "I_F_giveaways", (r) => r.ind?.give),
  d("pen", "Penalties", "penalties", "penalties", (r) => r.ind?.pen), d("pim", "Penalty minutes", "minutes", "I_F_penalityMinutes", (r) => r.ind?.pim), d("penDrawn", "Penalties drawn", "penalties", "penaltiesDrawn", (r) => r.ind?.penDrawn),
  d("onxGF", "On-ice xG for", "xG", "OnIce_F_xGoals", (r) => r.on?.xGF, true), d("onxGA", "On-ice xG against", "xG", "OnIce_A_xGoals", (r) => r.on?.xGA, true),
  d("onGF", "On-ice goals for", "goals", "OnIce_F_goals", (r) => r.on?.GF), d("onGA", "On-ice goals against", "goals", "OnIce_A_goals", (r) => r.on?.GA),
  d("onCF", "On-ice shot attempts for", "attempts", "OnIce_F_shotAttempts", (r) => r.on?.CF), d("onCA", "On-ice shot attempts against", "attempts", "OnIce_A_shotAttempts", (r) => r.on?.CA),
  d("onX", "On-ice xG% as published", "0–1", "onIce_xGoalsPercentage", (r) => r.on?.src?.xGoalsPercentage), d("offX", "Off-ice xG% as published", "0–1", "offIce_xGoalsPercentage", (r) => r.off?.src?.xGoalsPercentage),
];
const LINE_DEFS: Def[] = [
  d("gp", "Games played", "games", "games_played", (r) => r.gp, true), d("toi", "Time together", "seconds", "icetime", (r) => r.toi, true),
  d("xGF", "Expected goals for", "xG", "xGoalsFor", (r) => r.xGF, true), d("xGA", "Expected goals against", "xG", "xGoalsAgainst", (r) => r.xGA, true),
  d("GF", "Goals for", "goals", "goalsFor", (r) => r.GF, true), d("GA", "Goals against", "goals", "goalsAgainst", (r) => r.GA, true),
  d("SOGF", "Shots on goal for", "shots", "shotsOnGoalFor", (r) => r.SOGF), d("SOGA", "Shots on goal against", "shots", "shotsOnGoalAgainst", (r) => r.SOGA),
  d("CF", "Shot attempts for", "attempts", "shotAttemptsFor", (r) => r.CF), d("CA", "Shot attempts against", "attempts", "shotAttemptsAgainst", (r) => r.CA),
  d("srcX", "xG% as published", "0–1", "xGoalsPercentage", (r) => r.src?.xGoalsPercentage), d("srcC", "Corsi% as published", "0–1", "corsiPercentage", (r) => r.src?.corsiPercentage),
];
const DERIVED: Record<string, Derived[]> = {
  teams: [
    { label: "xG for / against per 60", unit: "xG/60", formula: "xGoalsFor (or Against) ÷ iceTime × 3600" }, { label: "xG share", unit: "%", formula: "xGoalsFor ÷ (xGoalsFor + xGoalsAgainst)" },
    { label: "Shooting % / Save %", unit: "%", formula: "goals ÷ shotsOnGoal; 1 − goalsAgainst ÷ shotsOnGoalAgainst" }, { label: "Shot-attempt share (CF%)", unit: "%", formula: "shotAttemptsFor ÷ (for + against)" },
  ],
  goalies: [
    { label: "Goals saved above expected", unit: "goals", formula: "xGoals − goals" }, { label: "GSAx per 60", unit: "goals/60", formula: "(xGoals − goals) ÷ icetime × 3600" },
    { label: "Save % / expected save %", unit: "%", formula: "1 − goals ÷ ongoal; 1 − xGoals ÷ ongoal" }, { label: "High-danger GSAx", unit: "goals", formula: "highDangerxGoals − highDangerGoals" },
  ],
  skaters: [
    { label: "Assists", unit: "assists", formula: "primary + secondary assists" }, { label: "Goals minus individual xG", unit: "goals", formula: "I_F_goals − I_F_xGoals" },
    { label: "On-ice xG%, CF%", unit: "%", formula: "OnIce_F ÷ (OnIce_F + OnIce_A)" }, { label: "Time on ice per game", unit: "min", formula: "icetime ÷ games_played ÷ 60" },
  ],
  lines: [{ label: "xGF/60, xGA/60, xG%", unit: "xG/60, %", formula: "xGoalsFor (or Against) ÷ icetime × 3600; xGoalsFor ÷ (for + against)" }],
};
const SOURCE_LABEL = { teams: "Teams", goalies: "Goalies", skaters: "Skaters", lines: "Lines & pairings" } as const;
const DEFS = { teams: TEAM_DEFS, goalies: GOALIE_DEFS, skaters: SKATER_DEFS, lines: LINE_DEFS };
const SITS: Sit[] = ["all", "5on5", "5on4", "4on5", "other"];
const fmtSrc = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? DASH : Number.isInteger(v) ? String(v) : String(+v.toFixed(3)));
const PAGE = 60;

type Entity = { key: string; name: string; team: string; sits: Partial<Record<Sit, SitRow>>; extra?: string };

export function DataView({ ctx }: { ctx: Ctx }) {
  const { s, set, summary, skaters, lines, refresh, season } = ctx;
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const src = s.dSource;
  const part = src === "skaters" ? skaters : src === "lines" ? lines : summary;
  const sit: Sit = src === "lines" ? "5on5" : s.sit;
  const defs = DEFS[src];
  const mainDefs = defs.filter((c) => c.main);
  const entities: Entity[] = useMemo(() => {
    if (src === "teams") return Object.entries(summary.data?.teams ?? {}).map(([t, sits]) => ({ key: t, name: teamName(t), team: t, sits }));
    if (src === "goalies") return (summary.data?.goalies ?? []).map((g) => ({ key: `${g.id}`, name: g.name, team: g.team, sits: g.sit }));
    if (src === "skaters") return (skaters.data?.skaters ?? []).map((p) => ({ key: `${p.id}-${p.team}`, name: p.name, team: p.team, sits: p.sit, extra: p.pos }));
    return (lines.data?.lines ?? []).map((l) => ({ key: l.id, name: l.name, team: l.team, sits: { "5on5": l } as Partial<Record<Sit, SitRow>>, extra: l.type }));
  }, [src, summary.data, skaters.data, lines.data]);
  const rows = useMemo(() => entities.filter((e) => e.sits[sit] && matches(s.dQuery, e.name, e.team, teamName(e.team), e.extra)), [entities, sit, s.dQuery]);
  const sorted = useMemo(() => sortRows(rows, s.dSort.key, s.dSort.dir, (e: Entity, k) => (k === "name" ? e.name : k === "team" ? e.team : defs.find((c) => c.key === k)?.get(e.sits[sit]))), [rows, s.dSort, defs, sit]);
  const onSort = (key: string, first: "asc" | "desc") => { set({ dSort: nextSort(s.dSort, key, first) }); setLimit(PAGE); };
  const year = seasonYear(season), urls = sourceUrls(year);
  const msg = refreshMessage(refresh.result, refresh.error);
  const meta = summary.data;
  const shotGames = ctx.games.data?.through;
  return (
    <>
      <div className="np-filters">
        <div className="segmented np-seg" role="group" aria-label="Source table">
          {(Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).map((k) => (
            <button key={k} type="button" aria-pressed={src === k} onClick={() => { set({ dSource: k, dSort: { key: "name", dir: "asc" } as NpState["dSort"] }); setOpen(null); setLimit(PAGE); }}>{SOURCE_LABEL[k]}</button>
          ))}
        </div>
        {src !== "lines" && <SitFilter sit={s.sit} onChange={(x) => set({ sit: x })} />}
        <label className="np-field"><span className="np-field-label">Search</span>
          <input type="search" aria-label="Search the table" placeholder="Name or team" value={s.dQuery} onChange={(e) => { set({ dQuery: e.target.value }); setLimit(PAGE); }} />
        </label>
        <span className="np-count" role="status">{rows.length} of {entities.filter((e) => e.sits[sit]).length} rows</span>
      </div>
      <div className="np-grid2">
        <Panel id="np-d-source" title="Source and updates" sub="Season files are downloaded from MoneyPuck and republished after each update. They are not live.">
          <dl className="np-dl">
            <div><dt>Team, goalie, skater and line files</dt><dd>{meta?.sourceUpdated.summary ? new Date(meta.sourceUpdated.summary).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : DASH}</dd></div>
            <div><dt>Shot-level data (game logs)</dt><dd>{meta?.sourceUpdated.shots ? new Date(meta.sourceUpdated.shots).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : DASH}{shotGames ? ` · through game ${shotGames}` : ""}</dd></div>
            <div><dt>Saved by this site</dt><dd>{meta?.fetchedAt ? new Date(meta.fetchedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : DASH}</dd></div>
          </dl>
          <ul className="np-links">
            <li><a href={MONEYPUCK.dataUrl} target="_blank" rel="noreferrer noopener">MoneyPuck data page</a></li>
            <li><a href={MONEYPUCK.dictionaryUrl} target="_blank" rel="noreferrer noopener">Data dictionary</a></li>
            <li><a href={MONEYPUCK.glossaryUrl} target="_blank" rel="noreferrer noopener">Glossary</a></li>
            <li><a href={urls[src === "lines" ? "lines" : src === "skaters" ? "skaters" : src === "goalies" ? "goalies" : "teams"]} target="_blank" rel="noreferrer noopener">{SOURCE_LABEL[src]} file (CSV)</a></li>
          </ul>
          <div className="np-refresh">
            <button type="button" disabled={refresh.running} onClick={() => refresh.refresh()}>{refresh.running ? "Checking MoneyPuck…" : "↻ Check for new data"}</button>
            <span role="status" aria-live="polite" data-testid="refresh-status">{msg}</span>
          </div>
        </Panel>
        <Panel id="np-d-defs" title={`${SOURCE_LABEL[src]} columns`} sub="Source columns keep MoneyPuck's names and units. Derived columns are calculated here.">
          <details className="np-defs">
            <summary>{defs.length} source columns · {DERIVED[src].length} derived</summary>
            <div className="table-scroll">
              <table className="np-table np-defs-table">
                <thead><tr><th>Column</th><th>Unit</th><th>Source field</th><th>Kind</th></tr></thead>
                <tbody>
                  {defs.map((c) => <tr key={c.key}><td>{c.label}</td><td>{c.unit}</td><td><code>{c.field}</code></td><td>Source</td></tr>)}
                  {DERIVED[src].map((c) => <tr key={c.label}><td>{c.label}</td><td>{c.unit}</td><td><code>{c.formula}</code></td><td><span className="np-derived">derived</span></td></tr>)}
                </tbody>
              </table>
            </div>
          </details>
        </Panel>
      </div>
      <Panel id="np-d-table" title={`${SOURCE_LABEL[src]} · ${src === "lines" ? "5-on-5" : SIT_LABEL[sit]} · source values`} sub="Time on ice is in seconds, as published. Open a row for every situation.">
        {part.state === "loading" ? <Loading what={`${SOURCE_LABEL[src].toLowerCase()} data`} /> : !part.data ? <Unavailable what={`${SOURCE_LABEL[src]} data`} onRetry={part.retry} /> : (
          <>
            <div className="table-scroll np-table-wrap">
              <table className="np-table" aria-label={`${SOURCE_LABEL[src]} source table`}>
                <thead>
                  <tr>
                    <th className="np-detail-col"><span className="sr-only">Details</span></th>
                    <SortTh col="name" label="Name" sort={s.dSort} onSort={onSort} firstDir="asc" className="np-sticky" />
                    <SortTh col="team" label="Team" sort={s.dSort} onSort={onSort} firstDir="asc" />
                    {mainDefs.map((c) => <SortTh key={c.key} col={c.key} label={c.label} title={`${c.label} (${c.unit}) · ${c.field}`} sort={s.dSort} onSort={onSort} />)}
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, limit).map((e) => {
                    const isOpen = open === e.key;
                    return (
                      <Fragment key={e.key}>
                        <tr data-row={e.key}>
                          <td className="np-detail-col"><button type="button" className="np-expand" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} all situations for ${e.name}`} onClick={() => setOpen(isOpen ? null : e.key)}>{isOpen ? "−" : "+"}</button></td>
                          <th scope="row" className="np-sticky"><b>{e.name}</b>{e.extra && <small className="np-extra"> {e.extra}</small>}</th>
                          <td><Logo team={e.team} size={16} /> {e.team}</td>
                          {mainDefs.map((c) => <td key={c.key} className="np-num">{fmtSrc(c.get(e.sits[sit]))}</td>)}
                        </tr>
                        {isOpen && (
                          <tr className="np-detail-row">
                            <td colSpan={3 + mainDefs.length}>
                              <div className="table-scroll">
                                <table className="np-table np-inner" aria-label={`All situations for ${e.name}`}>
                                  <thead><tr><th>Field</th>{SITS.filter((x) => e.sits[x]).map((x) => <th key={x}>{SIT_LABEL[x]}</th>)}</tr></thead>
                                  <tbody>{defs.map((c) => <tr key={c.key}><td>{c.label} <small>{c.unit}</small></td>{SITS.filter((x) => e.sits[x]).map((x) => <td key={x} className="np-num">{fmtSrc(c.get(e.sits[x]))}</td>)}</tr>)}</tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!sorted.length && <tr><td colSpan={3 + mainDefs.length} className="np-none">No rows match.</td></tr>}
                </tbody>
              </table>
            </div>
            {sorted.length > limit && <button type="button" className="np-more" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, sorted.length - limit)} more · {limit} of {sorted.length}</button>}
          </>
        )}
      </Panel>
    </>
  );
}
