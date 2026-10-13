import type { GameLog, Shot, Sit } from "../../../lib/moneypuck-types";
import type { Team } from "../../../types";
import { shotTotals, SIT_LABEL } from "../../../lib/nhlplus.mjs";
import { CompareRow } from "../shared/CompareRow";
import { fmt, fmtInt } from "../shared/format";

export type SitFilter = "all" | "5on5" | "5on4" | "4on5";
export const SIT_OPTIONS: [SitFilter, string][] = [["all", "All"], ["5on5", "5v5"], ["5on4", "PP"], ["4on5", "PK"]];

export function SituationPicker({ value, onChange }: { value: SitFilter; onChange: (v: SitFilter) => void }) {
  return (
    <div role="radiogroup" aria-label="Game situation" className="nhlp-seg">
      {SIT_OPTIONS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

/** Expected goals, goals and shots on goal for each team in one situation, from the game log (shot totals when the log is missing). */
export function SituationCompare({ gameLog, shots, away, home, sit }: { gameLog: GameLog | null; shots: Shot[] | null; away: Team; home: Team; sit: SitFilter }) {
  const row = (team: string) => {
    const g = gameLog?.teams?.[team]?.[sit as Sit];
    if (g) return { xG: g.xGF, goals: g.GF, sog: g.SOGF };
    if (shots) { const t = shotTotals(shots, team, sit); return { xG: t.xGF, goals: t.GF, sog: t.SOGF }; }
    return { xG: null, goals: null, sog: null };
  };
  const a = row(away.id), h = row(home.id);
  const none = a.xG == null && h.xG == null;
  const own = sit === "5on4" ? "Each team's own power play" : sit === "4on5" ? "Each team's own penalty kill" : null;
  return (
    <div className="nhlp-sit" data-testid="situation-compare">
      <p className="nhlp-sub">{SIT_LABEL[sit]}{own ? ` · ${own}` : ""}</p>
      {none ? <p className="nhlp-note">No data for this situation.</p> : <>
        <CompareRow compact label="Expected goals" tip="xG" left={{ team: away.id, value: a.xG, text: `${away.id} ${fmt(a.xG)}` }} right={{ team: home.id, value: h.xG, text: `${home.id} ${fmt(h.xG)}` }} />
        <CompareRow compact label="Goals" tip="GF" left={{ team: away.id, value: a.goals, text: `${away.id} ${fmtInt(a.goals)}` }} right={{ team: home.id, value: h.goals, text: `${home.id} ${fmtInt(h.goals)}` }} diffDigits={0} />
        <CompareRow compact label="Shots on goal" left={{ team: away.id, value: a.sog, text: `${away.id} ${fmtInt(a.sog)}` }} right={{ team: home.id, value: h.sog, text: `${home.id} ${fmtInt(h.sog)}` }} diffDigits={0} />
      </>}
    </div>
  );
}
