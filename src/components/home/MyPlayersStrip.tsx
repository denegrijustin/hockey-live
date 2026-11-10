import { useState } from "react";
import { TeamLogo } from "../TeamLogo";
import { HomeSection } from "./HomeSection";
import "./home-personal.css";

export type StripPlayer = { id: number | string; name: string; team: string; line: string };
const CAP = 4;

/** The players the viewer follows, each with one fact line (until the watchlist summaries land this is tonight's game for the player's team). Nothing when none are followed. */
export default function MyPlayersStrip({ players, phone, onSeeAll }: { players: StripPlayer[]; phone: boolean; onSeeAll?: () => void }) {
  const [all, setAll] = useState(false);
  if (!players.length) return null;
  const cap = phone ? 3 : CAP;
  const shown = all ? players : players.slice(0, cap);
  return (
    <HomeSection id="myplayers" label="My players" count={players.length} className="mp-section">
      <ul className="mp-list">
        {shown.map((p) => (
          <li key={p.id} className="mp-item">
            {p.team && <TeamLogo id={p.team} size={20} />}
            <b>{p.name}</b>
            <span>{p.line}</span>
          </li>
        ))}
      </ul>
      {players.length > cap && (onSeeAll
        ? <button type="button" className="sb-browse mt-all" onClick={onSeeAll}>See all {players.length} players</button>
        : <button type="button" className="sb-browse mt-all" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer" : `See all ${players.length} players`}</button>)}
    </HomeSection>
  );
}
