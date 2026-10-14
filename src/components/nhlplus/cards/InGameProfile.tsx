import type { Game, Team } from "../../../types";
import type { GameLog, Shot } from "../../../lib/moneypuck-types";
import { DataStatus } from "../shared/DataStatus";
import { fmt, fmtInt } from "../shared/format";
import { FlowSparkline } from "./ChanceFlowChart";
import { gameSummary, isPlayoff, isShootout, modeNote, SHOOTOUT_NOTE } from "./logic.mjs";
import type { CardMode } from "./useGameMoneyPuck";

/**
 * The current-game block of a compact in-game card. Completed games in the MoneyPuck download get expected vs actual
 * goals and a chance-flow sparkline; live / intermission / not-yet-downloaded games get a quiet one-line note instead.
 */
export function InGameProfile({ game, away, home, mode, gameLog, shots, updated, stale, savedCopy, state }: {
  game: Game; away: Team; home: Team; mode: CardMode; gameLog: GameLog | null; shots: Shot[] | null; updated: string | null; stale: boolean; savedCopy: boolean; state: "idle" | "loading" | "ready" | "unavailable";
}) {
  if (mode === "pregame") return null;
  const note = modeNote(game, mode);
  if (mode !== "final-available") {
    return <p className="nhlp-pending" data-testid="nhlp-pending" data-mode={mode}>{mode === "final-pending" && state === "loading" ? "Checking MoneyPuck game data…" : note}</p>;
  }
  const s = gameSummary(gameLog, away.id, home.id);
  if (!s) return <p className="nhlp-pending">{modeNote(game, "final-pending")}</p>;
  return (
    <section className="nhlp-game" aria-label="This game, MoneyPuck" data-testid="nhlp-game">
      <header><span className="nhlp-title">This game<em> · MoneyPuck</em></span></header>
      <div className="nhlp-grid">
        <div className="nhlp-row nhlp-head"><span className="nhlp-label" /><span className="nhlp-val"><b>{away.id}</b></span><span className="nhlp-val"><b>{home.id}</b></span></div>
        <div className="nhlp-row" data-row="xg"><span className="nhlp-label">Expected goals</span><span className="nhlp-val" data-lead={s.away.xG > s.home.xG}><b>{fmt(s.away.xG)}</b></span><span className="nhlp-val" data-lead={s.home.xG > s.away.xG}><b>{fmt(s.home.xG)}</b></span></div>
        <div className="nhlp-row" data-row="goals"><span className="nhlp-label">Goals{isShootout(game) ? " (no shootout)" : ""}</span><span className="nhlp-val"><b>{fmtInt(s.away.goals)}</b></span><span className="nhlp-val"><b>{fmtInt(s.home.goals)}</b></span></div>
      </div>
      {shots && shots.length > 0 && <FlowSparkline shots={shots} away={away} home={home} playoff={isPlayoff(game)} periods={gameLog?.periods ?? 3} />}
      {isShootout(game) && <p className="nhlp-note" data-testid="so-note">{SHOOTOUT_NOTE}</p>}
      <DataStatus compact state={state} updated={updated} stale={stale} savedCopy={savedCopy} what="Completed game" />
    </section>
  );
}
