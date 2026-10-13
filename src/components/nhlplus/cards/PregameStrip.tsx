import type { Game, Team } from "../../../types";
import type { SummaryPart } from "../../../lib/moneypuck-types";
import type { MpResult } from "../../../lib/moneypuck-client";
import { DataStatus } from "../shared/DataStatus";
import { fmtPct, fmt, DASH } from "../shared/format";
import { NhlPlusButton } from "./NhlPlusButton";
import { profileFor, seasonLabel } from "./logic.mjs";
import { statusWord, starterGap, starterText, useStarterLines } from "./StarterCell";

/** Which side is ahead on a row; the better number is bold and mint, with the exact value always shown. */
const lead = (a: number | null, b: number | null, higher: boolean) => (a == null || b == null || a === b ? null : (a > b) === higher ? "a" : "b");

/** The compact "Season profile" strip. Sits outside the card's expand button so its own button never toggles the card. */
export function PregameStrip({ game, away, home, summary }: { game: Game; away: Team; home: Team; summary: MpResult<SummaryPart> }) {
  const data = summary.data;
  const p = data ? profileFor(data, away.id, home.id) : null;
  const goalies = useStarterLines(game, away, home, data);
  const row = (key: string, label: string, a: string, b: string, win: "a" | "b" | null, subA?: string, subB?: string, title?: string) => (
    <div className="nhlp-row" key={key} data-row={key} title={title}>
      <span className="nhlp-label">{label}</span>
      <span className="nhlp-val" data-lead={win === "a"}><b>{a}</b>{subA && <small>{subA}</small>}</span>
      <span className="nhlp-val" data-lead={win === "b"}><b>{b}</b>{subB && <small>{subB}</small>}</span>
    </div>
  );
  return (
    <section className="nhlp-strip" aria-label="Season profile" data-testid="nhlp-strip">
      <header>
        <span className="nhlp-title">Season profile<em> · {seasonLabel(game.season)} season</em></span>
        <NhlPlusButton game={game} away={away} home={home} />
      </header>
      {!data ? (
        <DataStatus compact state={summary.state} updated={null} what="Season profile" onRetry={summary.retry} />
      ) : p && (
        <>
          <div className="nhlp-grid" role="group" aria-label="Season comparison">
            <div className="nhlp-row nhlp-head"><span className="nhlp-label" />
              <span className="nhlp-val"><b>{away.id}</b><small>{p.away.gp != null ? `${p.away.gp} GP` : "GP –"}</small></span>
              <span className="nhlp-val"><b>{home.id}</b><small>{p.home.gp != null ? `${p.home.gp} GP` : "GP –"}</small></span></div>
            {row("xg5", "5v5 xG%", fmtPct(p.away.xGPct), fmtPct(p.home.xGPct), lead(p.away.xGPct, p.home.xGPct, true), undefined, undefined, "Share of 5-on-5 expected goals: xG for ÷ (for + against)")}
            {row("pp", "Power play", fmt(p.away.ppXG60, 1), fmt(p.home.ppXG60, 1), lead(p.away.ppXG60, p.home.ppXG60, true), "xG/60", "xG/60", "Expected goals created per 60 minutes on the power play")}
            {row("pk", "Penalty kill", fmt(p.away.pkXGA60, 1), fmt(p.home.pkXGA60, 1), lead(p.away.pkXGA60, p.home.pkXGA60, false), "xGA/60", "xGA/60", "Expected goals allowed per 60 minutes shorthanded; lower is better")}
            {row("gsax", "Starter GSAx", starterText(goalies.away), starterText(goalies.home), lead(goalies.away.gsax, goalies.home.gsax, true),
              [goalies.away.name?.split(" ").slice(-1)[0], starterGap(goalies.away) ?? statusWord(goalies.away.status)].filter(Boolean).join(" · "),
              [goalies.home.name?.split(" ").slice(-1)[0], starterGap(goalies.home) ?? statusWord(goalies.home.status)].filter(Boolean).join(" · "),
              "Goals saved above expected so far this season, for the likely or confirmed starter")}
          </div>
          {p.detail ? <p className="nhlp-detail">{p.detail}</p> : <p className="nhlp-detail muted">{DASH} No matchup detail with enough ice time yet.</p>}
        </>
      )}
      {data && <DataStatus compact state={summary.state} updated={summary.updated} stale={summary.stale} savedCopy={summary.savedCopy} what="Season profile" onRetry={summary.retry} />}
    </section>
  );
}
