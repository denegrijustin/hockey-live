import { FavoriteMark } from "./FavoriteStar";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { projectedStandings } from "../lib/standings-projection.mjs";
import type { Game, Team } from "../types";
import { signed, entryLine } from "../lib/model.mjs";
import {
  clinchStatus, compareStandings, gamesInHand, gapToLine, lastN, pointsPct, streak, withRow, wildCardGroups,
} from "../lib/standings-view.mjs";
import { TeamLogo } from "./TeamLogo";
import { Resumes } from "./Resumes";
import { TeamLink } from "./TeamProfile";
import { PageHeader } from "./PageHeader";

type View = "league" | "conference" | "east" | "west" | "division" | "wildcard";
type Mode = "current" | "projected";
const SWITCH: { id: View; label: string }[] = [
  { id: "league", label: "League" },
  { id: "east", label: "Eastern" },
  { id: "west", label: "Western" },
  { id: "division", label: "Divisions" },
  { id: "wildcard", label: "Wild Card" },
];
const CONF_NAME: Record<string, string> = { E: "Eastern Conference", W: "Western Conference" };
const SPOT_LABEL: Record<string, string> = { in: "IN", wc1: "WC1", wc2: "WC2", out: "OUT" };
const SPOT_LONG: Record<string, string> = { in: "In: top 3 in division", wc1: "In: first wild card", wc2: "In: second wild card", out: "Outside the playoff picture" };
const MODE_BADGE: Record<Mode, string> = { current: "Current: from completed games", projected: "Projected: pace estimate, not odds" };

function Segmented<T extends string>({ label, value, options, onChange, className = "" }: { label: string; value: T | null; options: { id: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.id === value);
  const move = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange(options[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div className={`st-seg ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.id}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          tabIndex={o.id === value || (idx < 0 && i === 0) ? 0 : -1}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => move(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Standings({
  teams,
  table,
  selected, games, baseline, onNavigate,
}: {
  teams: Team[];
  table: any;
  selected: string[];
  games: Game[];
  baseline: any;
  onNavigate?: (view: string) => void;
}) {
  const [group, setGroup] = useState<View>("league"), [mode, setMode] = useState<Mode>("current"), [tab, setTab] = useState<"table" | "resumes">("table");
  const projected = useMemo(() => projectedStandings(teams, table, games, baseline), [teams, table, games, baseline]);
  const rows = useMemo(() => withRow(table, games), [table, games]);
  // The same table in "projected" form for the playoff picture: projected points over projected games played.
  const projRows = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.id, { ...rows[t.id], pts: projected[t.id].projected, gp: rows[t.id].gp + projected[t.id].remaining }])),
    [teams, rows, projected],
  );
  const basis = mode === "projected" ? projRows : rows;
  const picture = useMemo(() => wildCardGroups(basis, teams), [basis, teams]);
  const spots = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, gapToLine(basis, t.id, teams)])), [basis, teams]);
  const clinch = useMemo(() => clinchStatus(table, games, teams), [table, games, teams]);
  const refGp = Math.max(0, ...teams.map((t) => table[t.id]?.gp ?? 0));
  const projOrder = (a: Team, b: Team) => projected[b.id].projected - projected[a.id].projected || compareStandings({ ...rows[a.id], name: a.name }, { ...rows[b.id], name: b.name });
  const order = (a: Team, b: Team) => (mode === "projected" ? projOrder(a, b) : compareStandings({ ...rows[a.id], name: a.name }, { ...rows[b.id], name: b.name }));
  const tied = (a: Team, b: Team) => (mode === "projected" ? Math.abs(projected[a.id].projected - projected[b.id].projected) < 1e-9 : compareStandings({ ...rows[a.id], id: "", name: "" }, { ...rows[b.id], id: "", name: "" }) === 0);
  const sort = (list: Team[]) => [...list].sort(order);

  const sections: { key: string; heading?: string; teams: Team[] }[] =
    group === "league" ? [{ key: "league", heading: undefined, teams }]
    : group === "conference" ? ["E", "W"].map((c) => ({ key: c, heading: CONF_NAME[c], teams: teams.filter((t) => t.conference === c) }))
    : group === "east" || group === "west" ? [{ key: group, heading: CONF_NAME[group === "east" ? "E" : "W"], teams: teams.filter((t) => t.conference === (group === "east" ? "E" : "W")) }]
    : group === "division" ? ["Atlantic", "Metropolitan", "Central", "Pacific"].map((d) => ({ key: d, heading: d, teams: teams.filter((t) => t.division === d) }))
    : [];

  const teamById = (id: string) => teams.find((t) => t.id === id)!;
  const spotCell = (id: string) => {
    const g = spots[id];
    if (!g) return <td className="st-spot">—</td>;
    const c = mode === "current" ? clinch[id]?.status : null;
    return (
      <td className="st-spot">
        <span className={`st-pill st-${g.status}`} title={SPOT_LONG[g.status]}>{SPOT_LABEL[g.status]}</span>
        {g.pts != null && <small className="st-margin" title="Points margin to the cut line">{signed(g.pts)}</small>}
        {c && <span className={`st-clinch st-${c}`} title={`${c === "clinched" ? "Clinched" : "Eliminated"}: computed from points, tiebreakers not applied`}><span aria-hidden="true">{c === "clinched" ? "✓" : "✗"}</span><span className="st-clinch-text"> {c}</span><span className="sr-only"> (computed from points)</span></span>}
      </td>
    );
  };
  const renderRow = (t: Team, rank?: string) => {
    const s = table[t.id], sk = streak(s.results), l10 = lastN(s.results, 10), gih = gamesInHand(table, t.id, refGp);
    const pct = pointsPct(s);
    return (
      <tr key={t.id} data-team={t.id} className={selected.includes(t.id) ? "highlighted" : ""}>
        <td>{rank ?? ""}</td>
        <td>
          <div className="table-team">
            <TeamLogo id={t.id} size={28} />
            <b><TeamLink id={t.id}><span className="st-full">{t.name}</span><span className="st-abbr" title={t.name}>{t.id}</span></TeamLink><FavoriteMark id={t.id} sr />{s.gp ? <small className="st-sub">{spots[t.id] ? <span className="st-sub-spot">{SPOT_LABEL[spots[t.id]!.status]}{(mode === "current" && clinch[t.id]?.status) ? (clinch[t.id].status === "clinched" ? " ✓" : " ✗") : ""} · </span> : null}{signed(s.pts - entryLine(table, t.id, teams))} line</small> : null}</b>
          </div>
        </td>
        <td className="st-div">{t.division}</td>
        <td>{s.gp}</td>
        <td className="st-wlo">{s.w}</td>
        <td className="st-wlo">{s.l}</td>
        <td className="st-wlo">{s.ot}</td>
        <td className="st-rec">{s.w}–{s.l}–{s.ot}</td>
        <td><strong>{s.pts}</strong></td>
        {mode === "projected" && <td><strong>{projected[t.id].projected.toFixed(1)}</strong></td>}
        <td>{pct == null ? "—" : (pct * 100).toFixed(1) + "%"}</td>
        <td className={s.gf - s.ga >= 0 ? "positive" : "negative"}>{signed(s.gf - s.ga)}</td>
        <td className="st-l10" title="Record over the last 10 games, W-L-OTL">{l10 ? l10.label : "—"}</td>
        <td className="st-strk" title="Current streak; OT is an overtime or shootout loss">{sk ? sk.label : "—"}</td>
        <td className="st-gih" title={`Games in hand versus the most-played team (${refGp} GP)`}>{gih ?? "—"}</td>
        <td className="st-l5">
          <div className="form-row">
            {s.results.slice(-5).map((x: any, i: number) => (
              <span className={x.outcome} key={i}>{x.outcome === "OT" ? "O" : x.outcome}</span>
            ))}
          </div>
        </td>
        <td className="st-gap">{s.gp ? signed(s.pts - entryLine(table, t.id, teams)) : "—"}</td>
        {spotCell(t.id)}
      </tr>
    );
  };
  const head = (
    <thead>
      <tr>
        <th scope="col" aria-sort="ascending">Rank</th>
        <th scope="col">Team</th>
        <th scope="col" className="st-div">Division</th>
        <th scope="col" title="Games played">GP</th>
        <th scope="col" className="st-wlo">W</th>
        <th scope="col" className="st-wlo">L</th>
        <th scope="col" className="st-wlo" title="Overtime or shootout losses">OTL</th>
        <th scope="col" className="st-rec">W–L–OTL</th>
        <th scope="col">PTS</th>
        {mode === "projected" && <th scope="col">Projected PTS</th>}
        <th scope="col" title="Points percentage: points / (2 × games played)">P%</th>
        <th scope="col" title="Goal differential">DIFF</th>
        <th scope="col" className="st-l10" title="Last 10 games, W-L-OTL">L10</th>
        <th scope="col" className="st-strk" title="Current streak">STRK</th>
        <th scope="col" className="st-gih" title="Games in hand versus the most-played team">GIH</th>
        <th scope="col" className="st-l5">Last 5</th>
        <th scope="col" className="st-gap">Entry-line gap</th>
        <th scope="col" className="st-spot" title="Playoff spot and points margin to the cut line">{mode === "projected" ? "Projected spot" : "Spot"}</th>
      </tr>
    </thead>
  );
  const cols = mode === "projected" ? 18 : 17;
  const caption = (txt: string) => <caption className="sr-only">{txt}</caption>;

  const wildCard = (code: string) => {
    const g = picture[code];
    if (!g) return null;
    const secs = Object.entries(g.divisions) as [string, string[]][];
    const section = (title: string, ids: string[], key: string, startRank: number, kind: string) => (
      <tbody key={key} className={`st-block st-block-${kind}`}>
        <tr className="st-sect"><th scope="rowgroup" colSpan={cols}>{title}</th></tr>
        {ids.map((id, i) => renderRow(teamById(id), String(startRank + i)))}
      </tbody>
    );
    return (
      <div key={code}>
        <h3>{CONF_NAME[code]}{mode === "projected" ? " — projected picture" : ""}</h3>
        <div className="table-scroll st-fit">
          <table className="standings-table st-wc">
            {caption(`${CONF_NAME[code]} playoff picture: top three in each division, two wild cards, then the teams outside`)}
            {head}
            {secs.map(([d, ids]) => section(`${d} top 3`, ids, d, 1, "div"))}
            {section("Wild card", g.wildCard, "wc", 1, "wc")}
            <tbody className="st-block st-block-cut"><tr className="st-cut"><th scope="rowgroup" colSpan={cols}>Playoff cut line<span className="st-cut-more"> · teams below are outside the picture</span></th></tr></tbody>
            {section("Outside the picture", g.out, "out", 1, "out")}
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
    <PageHeader title="Standings" eyebrow="THE BIGGER PICTURE" />
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="st-intro">
            Rebuilt from completed regular-season results. Your selected teams
            are highlighted.
          </p>
        </div>
        <span className="muted-label st-intro">NHL order: points %, then regulation wins</span>
      </div>
      <div className="inj-seg rs-tabs" role="group" aria-label="Standings or resumés">
        <button type="button" aria-pressed={tab === "table"} onClick={() => setTab("table")}>Standings table</button>
        <button type="button" aria-pressed={tab === "resumes"} onClick={() => setTab("resumes")}>Resumés<span className="st-intro">: who they beat, who beat them</span></button>
      </div>
      {tab === "resumes" ? <Resumes teams={teams} table={table} games={games} /> : <>
      <div className="st-controls">
        <Segmented<View> label="Standings group" className="st-group-seg" value={SWITCH.some((o) => o.id === group) ? group : null} options={SWITCH} onChange={setGroup} />
        <Segmented<Mode> label="Current or projected" value={mode} onChange={setMode} options={[{ id: "current", label: "Current" }, { id: "projected", label: "Projected" }]} />
        <span className={`st-mode-badge st-mode-${mode}`} data-testid="mode-badge">{MODE_BADGE[mode]}</span>
      </div>
      <div className="chart-filters">
        <label>Standings view<select value={mode} onChange={(e) => setMode(e.target.value as Mode)}><option value="current">Current standings</option><option value="projected">Projected final standings</option></select></label>
        <label>Group standings<select value={group} onChange={(e) => setGroup(e.target.value as View)}><option value="league">League</option><option value="conference">Conference</option><option value="east">Eastern</option><option value="west">Western</option><option value="division">Division</option><option value="wildcard">Wild Card</option></select></label>
      </div>
      {mode === "projected" && <p className="detail-note">Projected points = current points + remaining scheduled games × blended points pace. Current pace is blended with 20 games of prior-season pace (55% baseline if unavailable). A heuristic forecast, not playoff odds; ignores opponent strength and roster changes.{onNavigate ? <> For simulated chances see <button type="button" className="st-link" onClick={() => onNavigate("odds")}>Playoff odds</button>.</> : null}</p>}
      {group === "wildcard"
        ? ["E", "W"].map(wildCard)
        : sections.map((sec) => {
            const list = sort(sec.teams);
            return (
              <div key={sec.key}>
                {sec.heading && <h3>{sec.heading}</h3>}
                <div className="table-scroll st-fit">
                  <table className="standings-table">
                    {caption(`${sec.heading ?? "League"} standings, ${mode === "projected" ? "projected" : "current"}, in NHL order`)}
                    {head}
                    <tbody>
                      {list.map((t) => {
                        const rank = 1 + list.filter((o) => order(o, t) < 0 && !tied(o, t)).length;
                        const isTie = list.some((o) => o.id !== t.id && tied(o, t));
                        return renderRow(t, `${isTie ? "T" : ""}${rank}`);
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
      <div className="st-legend">
        <p className="detail-note">
          <b>Order:</b> points percentage (PTS ÷ 2×GP), then regulation wins, then regulation-plus-overtime wins (ROW), then goal differential, then name; head-to-head is not applied. T marks a tie.
          {" "}<b>OTL</b> is an overtime or shootout loss. <b>L10</b> is the last 10 games as W-L-OTL; <b>STRK</b> is the current streak (OT is an overtime loss). <b>GIH</b> is games fewer played than the most-played team.
        </p>
        <p className="detail-note">
          <b>Spot:</b> IN is top 3 in the division, WC1 and WC2 are the two wild cards, OUT is outside the picture. The number is the points margin: for a team in, its lead over the first team out; for a team out, how far behind the last wild card.
          {" "}{mode === "projected" ? "In the projected view spots use projected points, a pace estimate." : <>A ✓ or ✗ means clinched or eliminated, <b>computed from points (tiebreakers not applied)</b>; it is not an official clinch and is left off when unsure.</>}
          {" "}Entry line is a points-only playoff reference.
          {onNavigate ? <> <button type="button" className="st-link" onClick={() => onNavigate("odds")}>See playoff odds</button> for simulated chances.</> : null}
        </p>
      </div>
      </>}
    </section>
    </>
  );
}
