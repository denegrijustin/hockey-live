import { useState } from "react";
import type { Team } from "../types";
import { useFeed } from "../lib/polling";
import { ordinal } from "../lib/injuries.mjs";
import { injuryZone } from "../lib/injury-zone.mjs";
import { InjuryMascot } from "./InjuryMascot";
import { InjuryBadge, InjuryEstimate, InjuryFace, InjuryPlayerName, InjuryReported } from "./InjuryList";
import { Skeleton } from "./Skeleton";
import { TeamLogo } from "./TeamLogo";
import { TeamLink } from "./TeamProfile";
import { PageHeader } from "./PageHeader";

type Impact = { basis: "season" | "last" | "none"; small?: boolean; gp: number; perGame?: number; percentile: number | null; level: "high" | "medium" | "low" | null; label: string; goals?: number; assists?: number; toi?: number | null; savePct?: number | null; group?: string };
type Item = { id: string; name: string; pos: string | null; team: string; headshot: string | null; status: string; fantasy?: string | null; kind: string; detail: string | null; side: string | null; updated: string | null; comment: string; severity: { level: "season" | "serious" | "moderate" | "minor" | "unknown"; label: string; days: number | null }; back: { text: string; days: number | null }; impact: Impact };
type Report = { season: number; updatedAt: string; sourceUpdated: string | null; stale?: boolean; counts: { total: number; dayToDay: number; longTerm: number; high: number; byStatus?: { ir: number; irLt: number; dayToDay: number; out: number; other: number } }; teams: { team: string; count: number; high: number; lost: number }[]; items: Item[] };

type Sort = "impact" | "back" | "team";
type Level = "all" | "minor" | "moderate" | "serious" | "unknown";
const LEVELS: [Level, string][] = [["all", "All"], ["minor", "Day-to-day / short"], ["moderate", "Moderate"], ["serious", "Long-term / season"], ["unknown", "Not reported"]];
const SORTS: [Sort, string][] = [["impact", "Biggest impact"], ["back", "Back soonest"], ["team", "By team"]];

const basisText = (i: Impact) =>
  i.basis === "none" ? "No earlier games to judge by"
  : i.basis === "last" ? `Judged on ${i.gp} games last season`
  : i.small ? `Only ${i.gp} ${i.gp === 1 ? "game" : "games"} so far this season` : `Judged on ${i.gp} games this season`;
const injuryText = (i: Item) => [i.kind, i.detail && i.detail !== "Not specified" ? i.detail : null, i.side ? `${i.side} side` : null].filter(Boolean).join(" · ");

function Card({ item, teamName, season }: { item: Item; teamName: string; season: number }) {
  const { impact: im, severity: sv } = item;
  const zone = injuryZone(item);
  return (
    <li className={`inj-card sev-${sv.level}`} data-testid="injury" data-team={item.team} data-impact={im.level ?? "none"}>
      <div className="inj-who">
        <InjuryFace item={item} season={season} size={48} />
        <div className="inj-name">
          <InjuryPlayerName item={item} season={season} />
          <span>{item.pos ? `${item.pos} · ` : ""}<TeamLogo id={item.team} size={16} /> <TeamLink id={item.team}>{teamName}</TeamLink></span>
        </div>
      </div>
      <div className="inj-tags"><InjuryBadge item={item} /><InjuryEstimate severity={sv} /></div>
      <div className="inj-mid">
      <dl className="inj-facts">
        <div><dt>Injury</dt><dd>{injuryText(item)}</dd></div>
        <div><dt>Status</dt><dd>{item.status}</dd></div>
        <div><dt>Back</dt><dd>{item.back.text}</dd></div>
        {item.updated && <div><dt>Updated</dt><dd><InjuryReported updated={item.updated} /></dd></div>}
      </dl>
      <div className="inj-figure-wrap"><InjuryMascot team={item.team} goalie={item.pos === "G"} zone={zone.zone} side={zone.side} label={zone.label} name={item.name} size={160} /><small>{zone.label}</small></div>
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
  const mine = team === "all" || (data?.items ?? []).some((i) => i.team === team) ? team : "all";
  const shown = (() => {
    const list = (data?.items ?? []).filter((i) => (mine === "all" || i.team === mine) && (level === "all" || (level === "serious" ? i.severity.level === "serious" || i.severity.level === "season" : i.severity.level === level)));
    if (sort === "back") return [...list].sort((a, b) => (a.back.days ?? 9999) - (b.back.days ?? 9999) || (b.impact.percentile ?? -1) - (a.impact.percentile ?? -1));
    if (sort === "team") return [...list].sort((a, b) => nameOf(a.team).localeCompare(nameOf(b.team)) || (b.impact.percentile ?? -1) - (a.impact.percentile ?? -1));
    return list;
  })();

  if (!data && !error) return <section className="injuries" aria-label="Injury report"><PageHeader title="Injury report" eyebrow="WHO IS OUT" /><Skeleton rows={4} label="Loading the injury report" /></section>;
  if (!data) return <section className="injuries" aria-label="Injury report"><PageHeader title="Injury report" eyebrow="WHO IS OUT" /><p className="empty">The injury report is unavailable right now. Try again in a moment.</p></section>;
  return (
    <section className="injuries" aria-label="Injury report">
      <PageHeader title="Injury report" eyebrow="WHO IS OUT">
        <p className="ph-sub">Who is hurt, how serious it looks, when they may be back, and how much their team misses them. Impact is judged by how the player produced in earlier games: this season once he has played a few, otherwise last season.</p>
      </PageHeader>
      <ul className="inj-counts" data-testid="inj-counts">
        <li><b>{data.counts.total}</b> injured</li>
        <li><b>{data.counts.dayToDay}</b> day-to-day</li>
        <li><b>{data.counts.longTerm}</b> long-term</li>
        <li><b>{data.counts.high}</b> high-impact</li>
      </ul>
      {data.counts.byStatus && (
        <ul className="inj-counts inj-status-counts" data-testid="inj-status-counts" aria-label="Count by reported status">
          {([["ir", "IR"], ["irLt", "IR-LT"], ["dayToDay", "Day-To-Day"], ["out", "Out"], ["other", "Other"]] as const).map(([k, label]) => <li key={k} data-status={k}><b>{data.counts.byStatus![k]}</b> {label}</li>)}
        </ul>
      )}
      <h2 className="inj-h">Teams hit hardest <small>(★ high-impact)</small></h2>
      <ul className="inj-teams">
        {data.teams.slice(0, 6).map((t) => (
          <li key={t.team}><button type="button" className="inj-team" aria-label={`${t.team}, ${t.count} out${t.high ? `, ${t.high} high-impact` : ""}`} aria-pressed={mine === t.team} onClick={() => setTeam(mine === t.team ? "all" : t.team)}>
            <TeamLogo id={t.team} size={20} /><b>{t.team}</b><small>{t.count}{t.high ? ` · ${t.high}★` : ""}</small>
          </button></li>
        ))}
      </ul>
      <div className="inj-tools">
        <label><span className="sr-only">Team</span>
          <select value={mine} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
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
      {shown.length ? <ul className="inj-list" data-testid="inj-list">{shown.map((i) => <Card key={i.id} item={i} teamName={nameOf(i.team)} season={season} />)}</ul> : <p className="inj-empty">No injuries match.</p>}
      <p className="inj-source">Source: ESPN injury report{data.sourceUpdated ? `, updated ${new Date(data.sourceUpdated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}. Impact: NHL box-score production (goals, assists, shots, plus-minus, penalty minutes; saves above a .900 save percentage for goalies), ranked against the league. Status words and codes (IR = injured reserve, IR-LT = long-term injured reserve) are the report’s own. “Estimate” tags are this app’s guess from the reported return date, not part of the report. Teams often report only “upper body” or “lower body”, and return dates are estimates.{data.stale ? " Showing a saved copy while the report refreshes." : ""}</p>
    </section>
  );
}
