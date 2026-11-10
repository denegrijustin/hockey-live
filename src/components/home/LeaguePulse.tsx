import { useMemo, useState } from "react";
import type { Game, Team } from "../../types";
import { buildPulse } from "../../lib/home-pulse.mjs";
import { TeamLogo } from "../TeamLogo";
import { HomeSection } from "./HomeSection";
import "./home-personal.css";

/** League Pulse: up to four facts derived from the standings, results and playoff simulation, each with its basis. One row on a phone until opened. */
export default function LeaguePulse({ table, teams, games, sim, phone }: { table: any; teams: Team[]; games: Game[]; sim?: any; phone: boolean }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => buildPulse(table, teams, games, sim ?? null), [table, teams, games, sim]);
  if (!rows.length) return null;
  const shown = phone && !open ? rows.slice(0, 1) : rows;
  return (
    <HomeSection id="pulse" label="League pulse" className="lp-section">
      <ul className="lp-list">
        {shown.map((r) => (
          <li key={r.key} className="lp-row">
            <TeamLogo id={r.teams[0]} size={20} />
            <span className="lp-text">{r.text}<small>{r.basis}</small></span>
          </li>
        ))}
      </ul>
      {phone && rows.length > 1 && <button type="button" className="sb-browse mt-all" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Show fewer" : `${rows.length - 1} more`}</button>}
    </HomeSection>
  );
}
