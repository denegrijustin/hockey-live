import { useMemo, useState } from "react";
import type { Team } from "../types";
import { PageHeader } from "./PageHeader";
import { useFavorites } from "../hooks/useFavorites";
import { FavoriteStar } from "./FavoriteStar";
import { TeamLogo } from "./TeamLogo";
import { Icon } from "./icons";
import "./teams.css";

const CONFERENCES: [string, string, string[]][] = [
  ["E", "Eastern Conference", ["Atlantic", "Metropolitan"]],
  ["W", "Western Conference", ["Central", "Pacific"]],
];

/**
 * The team directory: every team, by conference and division, each one a tap away from its team page (record, form, schedule, roster, injuries).
 * Teams you follow (the My teams choice) come first and are marked.
 */
export function Teams({ teams, table, onSchedule, onOpenTeam }: { teams: Team[]; table: Record<string, any> | null; onSchedule: () => void; onOpenTeam: (id: string) => void }) {
  const { favorites: selected } = useFavorites();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (t: Team) => !q || `${t.name} ${t.city} ${t.short} ${t.id}`.toLowerCase().includes(q);
  const mine = useMemo(() => teams.filter((t) => selected.includes(t.id) && matches(t)), [teams, selected, q]);
  const record = (t: Team) => { const s = table?.[t.id]; return s?.gp ? `${s.w}–${s.l}–${s.ot} · ${s.pts} pts` : "No games yet"; };
  const card = (t: Team) => (
    <li key={t.id} className="tm-card" data-team={t.id} data-mine={selected.includes(t.id) ? "1" : undefined}>
      <button type="button" className="tm-link" data-team-open={t.id} onClick={() => onOpenTeam(t.id)}>
        <TeamLogo id={t.id} size={44} />
        <span className="tm-name">
          <b>{t.name}</b>
          <small>{record(t)}</small>
        </span>
        <span className="tm-chev" aria-hidden="true"><Icon name="chevron" size={18} /></span>
      </button>
      <FavoriteStar id={t.id} name={t.name} />
    </li>
  );
  const shown = teams.filter(matches);
  return (
    <section className="teams-view" aria-label="Teams">
      <PageHeader
        title="Teams"
        eyebrow="ALL 32 CLUBS"
        actions={<><button type="button" className="tm-sched" onClick={() => window.dispatchEvent(new Event("iceboard:pick-favorites"))}><Icon name="star" size={18} /> Pick favorites</button><button type="button" className="tm-sched" onClick={onSchedule}><Icon name="calendar" size={18} /> Team schedules</button></>}
      />
      <label className="tm-search">
        <Icon name="search" size={18} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a team" aria-label="Find a team" autoComplete="off" />
      </label>
      {mine.length > 0 && (
        <div className="tm-group" aria-label="My teams">
          <h2>My teams</h2>
          <ul className="tm-grid">{mine.map(card)}</ul>
        </div>
      )}
      {CONFERENCES.map(([key, name, divisions]) => (
        <div key={key} className="tm-conf">
          <h2 className="tm-conf-h">{name}</h2>
          {divisions.map((d) => {
            const list = shown.filter((t) => t.division === d).sort((a, b) => a.name.localeCompare(b.name));
            return list.length ? (
              <div className="tm-group" key={d} aria-label={`${d} Division`}>
                <h3>{d} Division</h3>
                <ul className="tm-grid">{list.map(card)}</ul>
              </div>
            ) : null;
          })}
        </div>
      ))}
      {q && shown.length === 0 && <p className="tm-empty" role="status">No team matches “{query}”.</p>}
    </section>
  );
}
