import type { Team } from "../types";
import { setPrefs, usePrefs } from "../lib/prefs";
import { useMyTeam } from "../hooks/useMyTeam";
import { Sheet } from "./Sheet";
import { TeamLogo } from "./TeamLogo";
import "./my-team.css";

const DIVISIONS = ["Atlantic", "Metropolitan", "Central", "Pacific"];

/** Choose the one team the app opens on first. One tap picks it and closes; "No team" goes back to the whole league. */
export default function MyTeamPicker({ teams, onClose }: { teams: Team[]; onClose: () => void }) {
  const { myTeam, setMyTeam } = useMyTeam();
  const logos = usePrefs().display.logos;
  const setLogos = (v: "retro" | "current") => setPrefs((p) => ({ ...p, display: { ...p.display, logos: v } }));
  const pick = (id: string) => { setMyTeam(id); onClose(); };
  return (
    <Sheet title="My team" onClose={onClose} left={myTeam ? <button type="button" className="mtp-clear" onClick={() => pick("")}>No team</button> : undefined}>
      <p className="mtp-hint">The schedule, standings, playoff odds, players and Home open on this team first. Change it any time.</p>
      <div className="mtp-logos" role="group" aria-label="Team logos">
        <span>Team logos</span>
        {(["retro", "current"] as const).map((v) => <button key={v} type="button" aria-pressed={logos === v} onClick={() => setLogos(v)}>{v === "retro" ? "Retro" : "Current"}</button>)}
      </div>
      {DIVISIONS.map((d) => (
        <section key={d} className="mtp-div" aria-label={`${d} Division`}>
          <h3>{d}</h3>
          <ul className="mtp-grid">
            {teams.filter((t) => t.division === d).sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
              <li key={t.id}>
                <button type="button" aria-pressed={myTeam === t.id} aria-label={t.name} onClick={() => pick(t.id)}>
                  <TeamLogo id={t.id} size={32} />
                  <span>{t.short}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
