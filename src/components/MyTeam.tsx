import { lazy, Suspense, useEffect, useState } from "react";
import type { Team } from "../types";
import { setPrefs, usePrefs } from "../lib/prefs";
import { PICK_MY_TEAM_EVENT, openMyTeamPicker, useMyTeam } from "../hooks/useMyTeam";
import { TeamLogo } from "./TeamLogo";
import { Icon } from "./icons";

const Picker = lazy(() => import("./MyTeamPicker"));

/** The header control for My team: the team's logo (or a prompt) that opens the picker. The picker itself loads on first use. */
export function MyTeamChip({ teams }: { teams: Team[] }) {
  const { myTeam } = useMyTeam();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(PICK_MY_TEAM_EVENT, on);
    return () => window.removeEventListener(PICK_MY_TEAM_EVENT, on);
  }, []);
  const team = teams.find((t) => t.id === myTeam);
  return (
    <>
      <button type="button" className="myteam-chip" data-testid="my-team-chip" aria-haspopup="dialog" onClick={openMyTeamPicker}
        aria-label={team ? `My team: ${team.name}. Change team` : "Choose your team"} title={team ? `My team: ${team.name}` : "Choose your team"}>
        {team ? <TeamLogo id={team.id} size={24} /> : <Icon name="star" size={20} />}
        <span className="myteam-chip-text">{team ? team.id : "My team"}</span>
      </button>
      {open && <Suspense fallback={null}><Picker teams={teams} onClose={() => setOpen(false)} /></Suspense>}
    </>
  );
}

/** One tap between retro and current team logos (also in Settings and the My team picker). Hidden on narrow screens, where the header has no room. */
export function LogoToggle() {
  const retro = usePrefs().display.logos !== "current";
  return (
    <button type="button" className="logo-toggle" data-testid="logo-toggle" aria-pressed={retro} onClick={() => setPrefs((p) => ({ ...p, display: { ...p.display, logos: retro ? "current" : "retro" } }))}
      aria-label="Retro team logos" title={retro ? "Retro logos on: tap for current logos" : "Current logos: tap for retro logos"}>
      <Icon name="history" size={20} />
    </button>
  );
}
