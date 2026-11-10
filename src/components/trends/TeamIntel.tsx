import { useMemo } from "react";
import type { Game, Team } from "../../types";
import { MIN_SAMPLE, formLast, goalDiffTrend, homeAwaySplit, specialTeamsRank, teamResults } from "../../lib/trends.mjs";
import { FormStrip } from "./FormStrip";
import { GdSpark } from "./GdSpark";
import { SplitBar } from "./SplitBar";
import { TrendChip } from "./TrendChip";
import "../../trends.css";

/** The data a team's intelligence section is built from (all optional: the section hides what it cannot support). */
export interface TeamIntelProps {
  teamId: string;
  teams: Team[];
  table: Record<string, any> | null;
  games: Game[];
  /** League matchup snapshot (offense/defense/special-teams ranks), when loaded. */
  matchups?: any;
  /** Playoff simulation result, when computed (labelled as a simulation, never a prediction). */
  sim?: any;
  onNavigate?: (view: string) => void;
}
const gd = (n: number, d = 0) => `${n > 0 ? "+" : ""}${n.toFixed(d)}`;
const tone = (n: number) => (n > 0 ? "up" : n < 0 ? "down" : "flat");
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const rec = (s: { w: number; l: number; otl: number }) => `${s.w}-${s.l}-${s.otl}`;

/** Compact "Team intelligence" panel: form, goal-difference trend, home/away split, special teams. Every number is derived from completed games (or the league snapshot) and labelled with its sample. */
export function TeamIntel({ teamId, games, matchups, onNavigate }: TeamIntelProps) {
  const t = useMemo(() => {
    const results = teamResults(games, teamId);
    return { f5: formLast(results, 5), f10: formLast(results, 10), gd: goalDiffTrend(results), split: homeAwaySplit(games, teamId), st: specialTeamsRank(matchups, teamId), n: results.length };
  }, [games, teamId, matchups]);
  const { f5, f10, gd: g, split, st } = t;
  const nothing = !f5.value && !g.value && !split.value && !st.value;
  return (
    <section className="tr-intel" aria-label={`${teamId} team intelligence`}>
      {nothing ? <p className="tr-muted">Trends appear after {MIN_SAMPLE} completed games ({t.n} so far).</p> : <>
        {f5.value && (
          <div className="tr-block">
            <h4>Form <small>{f5.label}{f10.value && f10.sample > f5.sample ? ` · ${f10.label}: ${rec(f10.value)}` : ""}</small></h4>
            <div className="tr-line">
              <FormStrip chips={f5.value.chips} label={`Results, ${f5.label}`} />
              <TrendChip label={f5.label} value={rec(f5.value)} />
              {f5.value.streak.n >= 2 && <TrendChip label="Streak" value={`${f5.value.streak.kind}${f5.value.streak.n}`} tone={f5.value.streak.kind === "W" ? "up" : "down"} title={f5.value.streak.kind === "L" ? "Games without a win, overtime losses included" : "Consecutive wins"} />}
            </div>
          </div>
        )}
        {g.value && (
          <div className="tr-block">
            <h4>Goal difference <small>{g.label} · {g.sample} games · Derived</small></h4>
            <div className="tr-line">
              <GdSpark series={g.value.series} label={`Cumulative goal difference by game, ${g.label}`} />
              <TrendChip label="Total" value={gd(g.value.total)} tone={tone(g.value.total)} />
              <TrendChip label="Per game" value={gd(g.value.perGame, 2)} tone={tone(g.value.perGame)} />
            </div>
          </div>
        )}
        {split.value && (
          <div className="tr-block">
            <h4>Home and away <small>{split.label} · points %</small></h4>
            <SplitBar title={`${teamId} home and away record`} sides={[
              { label: "Home", record: rec(split.value.home), pct: split.value.home.ptsPct, extra: `${gd(split.value.home.gd)} GD` },
              { label: "Away", record: rec(split.value.away), pct: split.value.away.ptsPct, extra: `${gd(split.value.away.gd)} GD` },
            ]} />
          </div>
        )}
        {st.value && (
          <div className="tr-block">
            <h4>Special teams <small>{st.label} · league rank</small></h4>
            <div className="tr-line">
              {st.value.pp && <TrendChip label="Power play" value={`${(st.value.pp.pct * 100).toFixed(1)}% · ${ord(st.value.pp.rank)}`} />}
              {st.value.pk && <TrendChip label="Penalty kill" value={`${(st.value.pk.pct * 100).toFixed(1)}% · ${ord(st.value.pk.rank)}`} />}
            </div>
          </div>
        )}
        <p className="tr-note">Descriptive, from completed games only. Not a prediction.
          {onNavigate && <> <button type="button" className="tr-link" onClick={() => onNavigate("standings")}>Standings</button></>}
        </p>
      </>}
    </section>
  );
}
