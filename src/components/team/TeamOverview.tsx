import type { Team } from "../../types";
import { openGame } from "../../lib/open-game";
import { TeamLogo } from "../TeamLogo";
import { DASH, ord, pct3, streakText, when } from "./format";

const RESULT_LABEL: Record<string, string> = { W: "Win", L: "Loss", OTL: "Overtime or shootout loss" };

/** Who the team is and where it stands: logo, name, division, record, standing, points, streak, form and the next game. */
export function TeamOverview({ team, summary }: { team: Team; summary: any }) {
  const s = summary, st = s?.standing, ng = s?.nextGame;
  return (
    <section className="tpg-card" aria-labelledby="tpg-overview">
      <h2 id="tpg-overview">Overview</h2>
      <div className="tpg-id">
        <TeamLogo id={team.id} size={72} eager />
        <p>
          <span>{team.division} Division</span>
          <span>{team.conference === "E" ? "Eastern" : "Western"} Conference</span>
        </p>
      </div>
      {s ? (
        <>
          <dl className="tpg-stats">
            <div><dt>Record</dt><dd>{s.record.text}<small>W–L–OTL</small></dd></div>
            <div><dt>Points</dt><dd>{s.points}<small>{s.gp} GP</small></dd></div>
            <div><dt>Points %</dt><dd>{pct3(s.pointsPct)}<small>Derived</small></dd></div>
            <div><dt>Streak</dt><dd>{streakText(s.streak)}<small>{s.streak ? RESULT_LABEL[s.streak.type] : ""}</small></dd></div>
          </dl>
          {st && <p className="tpg-standing">{ord(st.division)} in the {team.division} Division · {ord(st.conference)} in the {team.conference === "E" ? "East" : "West"} · {ord(st.league)} of {st.leagueSize} overall <small>(by points %)</small></p>}
          <div className="tpg-form">
            <span className="tpg-label" id="tpg-form-l">Last {s.form.length} game{s.form.length === 1 ? "" : "s"}, newest first</span>
            {s.form.length ? <ol aria-labelledby="tpg-form-l">{s.form.map((r: string, i: number) => <li key={i} className={`r-${r}`} title={RESULT_LABEL[r]}><span aria-hidden="true">{r}</span><span className="sr-only">{RESULT_LABEL[r]}</span></li>)}</ol> : <span>{DASH}</span>}
          </div>
        </>
      ) : <p className="rs-none">No games played yet this season.</p>}
      <div className="tpg-next">
        <span className="tpg-label">Next game</span>
        {ng ? (
          <button type="button" className="tpg-game" onClick={() => openGame(ng.id)}>
            <b>{ng.home ? "vs" : "at"}</b><TeamLogo id={ng.opp} size={24} /><span>{ng.opp}</span>
            <em>{ng.status === "live" ? "Live now" : when(ng.start)}</em>
            {ng.status !== "live" && ng.restDays != null && <small>{ng.restDays === 0 ? "Back-to-back" : `${ng.restDays} day${ng.restDays === 1 ? "" : "s"} rest`}</small>}
          </button>
        ) : <span>{s ? "No games scheduled" : DASH}</span>}
      </div>
    </section>
  );
}
