import { useMemo, useState } from "react";
import type { Team } from "../types";
import { useFeed } from "../lib/polling";
import { ordinal } from "../lib/injuries.mjs";
import { injuryZone } from "../lib/injury-zone.mjs";
import { InjuryFigure } from "./InjuryFigure";
import { InjuryHeadshot } from "./InjuryHeadshot";
import { Skeleton } from "./Skeleton";
import { TeamLogo } from "./TeamLogo";

type Impact = { basis: "season" | "last" | "none"; small?: boolean; gp: number; perGame?: number; percentile: number | null; level: "high" | "medium" | "low" | null; label: string; goals?: number; assists?: number; toi?: number | null; savePct?: number | null; group?: string };
type Item = { id: string; name: string; pos: string | null; team: string; headshot: string | null; status: string; kind: string; detail: string | null; side: string | null; updated: string | null; comment: string; severity: { level: "season" | "serious" | "moderate" | "minor" | "unknown"; label: string; days: number | null }; back: { text: string; days: number | null }; impact: Impact };
type Report = { season: number; updatedAt: string; sourceUpdated: string | null; stale?: boolean; counts: { total: number; dayToDay: number; longTerm: number; high: number }; teams: { team: string; count: number; high: number; lost: number }[]; items: Item[] };

type Sort = "impact" | "back" | "team";
type Level = "all" | "minor" | "moderate" | "serious";
const LEVELS: [Level, string][] = [["all", "All"], ["minor", "Day-to-day / short"], ["moderate", "Moderate"], ["serious", "Long-term / season"]];
const SORTS: [Sort, string][] = [["impact", "Biggest impact"], ["back", "Back soonest"], ["team", "By team"]];

const basisText = (i: Impact) =>
  i.basis === "none" ? "No earlier games to judge by"
  : i.basis === "last" ? `Judged on ${i.gp} games last season`
  : i.small ? `Only ${i.gp} ${i.gp === 1 ? "game" : "games"} so far this season` : `Judged on ${i.gp} games this season`;
const injuryText = (i: Item) => [i.kind, i.detail && i.detail !== "Not specified" ? i.detail : null, i.side ? `${i.side} side` : null].filter(Boolean).join(" · ");

function Card({ item, teamName }: { item: Item; teamName: string }) {
  const { impact: im, severity: sv } = item;
  const zone = injuryZone(item);
  return (
    <li className={`inj-card sev-${sv.level}`} data-testid="injury" data-team={item.team} data-impact={im.level ?? "none"}>
      <div className="inj-who">
        <InjuryHeadshot src={item.headshot} name={item.name} size={48} />
        <div className="inj-name">
          <b>{item.name}</b>
          <span>{item.pos ? `${item.pos} · ` : ""}<TeamLogo id={item.team} size={16} /> {teamName}</span>
        </div>
        <span className={`inj-sev ${sv.level}`}>{sv.label}</span>
      </div>
      <div className="inj-mid">
      <dl className="inj-facts">
        <div><dt>Injury</dt><dd>{injuryText(item)}</dd></div>
        <div><dt>Status</dt><dd>{item.status}</dd></div>
        <div><dt>Back</dt><dd>{item.back.text}</dd></div>
      </dl>
      <div className="inj-figure-wrap"><InjuryFigure zone={zone.zone} side={zone.side} label={zone.label} size={44} /><small>{zone.label}</small></div>
      </div>
      <div className="inj-impact" data-level={im.level ?? "none"}>
        <div className="inj-impact-top"><b>{im.label}</b>{im.percentile != null && <span>{ordinal(im.percentile)} percentile</span>}</div>
        <div className="inj-bar" role="img" aria-label={im.percentile != null ? `${ordinal(im.percentile)} percentile of ${im.group === "goalie" ? "goalies" : "skaters"}` : "No ranking"}><i style={{ width: `${im.percentile ?? 0}%` }} /></div>
        <small>{basisText(im)}{im.basis !== "none" && im.group !== "goalie" && im.gp ? ` · ${im.goals}G ${im.assists}A` : ""}{im.group === "goalie" && im.savePct ? ` · ${im.savePct.toFixed(3).replace(/^0/, "")} SV%` : ""}</small>
      </div>
      {item.comment && <p className="inj-note">{item.comment}</p>}
    </li>
  );
}

/** Who is hurt, how serious it looks, when they may be back, and how much their team misses them (judged from earlier games, else last season). */
export function Injuries({ season, teams }: { season: number; teams: Team[] }) {
  const { data, error } = useFeed<Report>(`/api/injuries/${season}`, 600_000);
  const [team, setTeam] = useState("all");
  const [level, setLevel] = useState<Level>("all");
  const [sort, setSort] = useState<Sort>("impact");
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
  const shown = useMemo(() => {
    const list = (data?.items ?? []).filter((i) => (team === "all" || i.team === team) && (level === "all" || (level === "minor" ? i.severity.level === "minor" || i.severity.level === "unknown" : level === "serious" ? i.severity.level === "serious" || i.severity.level === "season" : i.severity.level === level)));
    if (sort === "back") return [...list].sort((a, b) => (a.back.days ?? 9999) - (b.back.days ?? 9999) || (b.impact.percentile ?? -1) - (a.impact.percentile ?? -1));
    if (sort === "team") return [...list].sort((a, b) => nameOf(a.team).localeCompare(nameOf(b.team)) || (b.impact.percentile ?? -1) - (a.impact.percentile ?? -1));
    return list;
  }, [data, team, level, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data && !error) return <section className="injuries" aria-label="Injury report"><Skeleton rows={4} label="Loading the injury report" /></section>;
  if (!data) return <section className="injuries" aria-label="Injury report"><p className="empty">The injury report is unavailable right now. Try again in a moment.</p></section>;
  return (
    <section className="injuries" aria-label="Injury report">
      <header className="inj-head-bar">
        <h1>Injury report</h1>
        <p>Who is hurt, how serious it looks, when they may be back, and how much their team misses them. Impact is judged by how the player produced in earlier games: this season once he has played a few, otherwise last season.</p>
      </header>
      <ul className="inj-counts" data-testid="inj-counts">
        <li><b>{data.counts.total}</b> injured</li>
        <li><b>{data.counts.dayToDay}</b> day-to-day</li>
        <li><b>{data.counts.longTerm}</b> long-term</li>
        <li><b>{data.counts.high}</b> high-impact</li>
      </ul>
      <h2 className="inj-h">Teams hit hardest</h2>
      <ul className="inj-teams">
        {data.teams.slice(0, 6).map((t) => (
          <li key={t.team}><button type="button" className="inj-team" aria-pressed={team === t.team} onClick={() => setTeam(team === t.team ? "all" : t.team)}>
            <TeamLogo id={t.team} size={28} /><span><b>{t.team}</b><small>{t.count} out{t.high ? ` · ${t.high} high-impact` : ""}</small></span>
          </button></li>
        ))}
      </ul>
      <div className="inj-tools">
        <label><span className="sr-only">Team</span>
          <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
            <option value="all">All teams</option>
            {[...new Set(data.items.map((i) => i.team))].sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
          </select>
        </label>
        <div className="inj-seg" role="group" aria-label="How serious">
          {LEVELS.map(([k, label]) => <button key={k} type="button" aria-pressed={level === k} onClick={() => setLevel(k)}>{label}</button>)}
        </div>
        <label><span className="sr-only">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      </div>
      {shown.length ? <ul className="inj-list" data-testid="inj-list">{shown.map((i) => <Card key={i.id} item={i} teamName={nameOf(i.team)} />)}</ul> : <p className="inj-empty">No injuries match.</p>}
      <p className="inj-source">Source: ESPN injury report{data.sourceUpdated ? `, updated ${new Date(data.sourceUpdated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}. Impact: NHL box-score production (goals, assists, shots, plus-minus, penalty minutes; saves above a .900 save percentage for goalies), ranked against the league. Teams often report only “upper body” or “lower body”, and return dates are estimates.{data.stale ? " Showing a saved copy while the report refreshes." : ""}</p>
    </section>
  );
}
