import { useState } from "react";
import type { Team } from "../types";
import { Sheet } from "./Sheet";
import { Icon } from "./icons";

const MY_TEAMS = ["EDM", "CHI", "MIN"];

/** Phone team picker: a sheet with search, shortcuts and a checkbox list of every team. */
export function TeamsSheet({ teams, selected, onChange, onClose }: { teams: Team[]; selected: string[]; onChange: (ids: string[]) => void; onClose: () => void }) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const shown = q ? teams.filter((t) => `${t.name} ${t.id}`.toLowerCase().includes(q)) : teams;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <Sheet title="Teams" onClose={onClose} left={<button className="sheet-reset" onClick={() => onChange([])}>Clear</button>}>
      <div className="teams-tools">
        <label className="phone-search">
          <Icon name="search" size={18} />
          <input type="search" aria-label="Find a team" placeholder="Find a team" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
        <div className="teams-shortcuts teams-only">
          {MY_TEAMS.map((id) => (
            <button key={id} className="team-pill" title={`Show ${teams.find((t) => t.id === id)?.name ?? id} only`} aria-pressed={selected.length === 1 && selected[0] === id} onClick={() => { onChange([id]); onClose(); }}>
              <img src={`/logos/${id}.svg`} alt="" width="22" height="22" decoding="async" />
              {id}
            </button>
          ))}
        </div>
        <div className="teams-shortcuts">
          <button aria-pressed={MY_TEAMS.length === selected.length && MY_TEAMS.every((id) => selected.includes(id))} onClick={() => onChange(MY_TEAMS)}>My three</button>
          <button aria-pressed={selected.length === teams.length} onClick={() => onChange(teams.map((t) => t.id))}>All 32</button>
        </div>
      </div>
      <ul className="teams-list">
        {shown.map((t) => (
          <li key={t.id}>
            <label>
              <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
              <img src={`/logos/${t.id}.svg`} alt="" width="28" height="28" loading="lazy" decoding="async" />
              <span>{t.name}</span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="teams-none">No team matches “{filter}”.</li>}
      </ul>
    </Sheet>
  );
}
