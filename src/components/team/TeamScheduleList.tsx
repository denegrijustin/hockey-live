import { useMemo } from "react";
import type { Game } from "../../types";
import { openGame } from "../../lib/open-game";
import { teamGames, sideOf } from "../../lib/team-schedule.mjs";
import { TeamLogo } from "../TeamLogo";
import { dayText, when } from "./format";

type Item = ReturnType<typeof sideOf>;
const Row = ({ i }: { i: Item }) => (
  <li className={`r-${i.result ?? ""}`}>
    <button type="button" className="tpg-game" onClick={() => openGame(i.id)} aria-label={`${i.home ? "vs" : "at"} ${i.opp}, ${i.status === "final" ? `${i.result ?? "no result"} ${i.us} to ${i.them}${i.ot ? ` ${i.ot}` : ""}` : dayText(i.date)}: open game`}>
      <b>{i.status === "final" ? (i.result ?? "–") : i.home ? "vs" : "at"}</b>
      {i.status === "final" && <span>{i.home ? "vs" : "at"}</span>}
      <TeamLogo id={i.opp} size={24} /><span>{i.opp}</span>
      <em>{i.status === "final" ? `${i.us}–${i.them}${i.ot ? ` ${i.ot}` : ""}` : i.status === "live" ? "Live now" : when(i.start)}</em>
    </button>
  </li>
);

/** The next games and the last results; each row opens that game. */
export function TeamScheduleList({ teamId, games, onNavigate }: { teamId: string; games: Game[]; onNavigate?: (view: string) => void }) {
  const items: Item[] = useMemo(() => teamGames(games, teamId).map((g: Game) => sideOf(g, teamId)), [games, teamId]);
  const recent = items.filter((i) => i.status === "final").slice(-5).reverse();
  const next = items.filter((i) => i.status !== "final").slice(0, 5);
  return (
    <details className="tpg-details">
      <summary><h2>Schedule &amp; results</h2><span>Next games and last results</span></summary>
      <div className="tpg-body tpg-cols">
        <section aria-labelledby="tpg-up">
          <h3 id="tpg-up">Coming up</h3>
          {next.length ? <ul className="tpg-games">{next.map((i) => <Row key={i.id} i={i} />)}</ul> : <p className="rs-none">Nothing scheduled.</p>}
        </section>
        <section aria-labelledby="tpg-recent">
          <h3 id="tpg-recent">Recent results</h3>
          {recent.length ? <ul className="tpg-games">{recent.map((i) => <Row key={i.id} i={i} />)}</ul> : <p className="rs-none">No games played yet.</p>}
        </section>
        {onNavigate && <p className="tpg-more"><button type="button" className="tpg-link" onClick={() => onNavigate("teamschedule")}>Open the full schedule</button></p>}
      </div>
    </details>
  );
}
