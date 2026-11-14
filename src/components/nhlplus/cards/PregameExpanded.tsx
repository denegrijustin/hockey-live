import type { Game, Team } from "../../../types";
import type { GamesPart, SummaryPart } from "../../../lib/moneypuck-types";
import type { MpResult } from "../../../lib/moneypuck-client";
import { CompareRow } from "../shared/CompareRow";
import { DataStatus } from "../shared/DataStatus";
import { MetricTip } from "../shared/MetricTip";
import { fmt, fmtMin, fmtPct, fmtSigned } from "../shared/format";
import { NhlPlusButton } from "./NhlPlusButton";
import { lastFive, leagueRank, profileFor, seasonLabel } from "./logic.mjs";
import { TeamLogo } from "../../TeamLogo";
import "./season-profile.css";
import { teamMetrics } from "../../../lib/nhlplus.mjs";
import { gaugeColors } from "../../../lib/kits";
import { starterGap, statusWord, useStarterLines } from "./StarterCell";

/** Aligned season comparisons for the expanded card and the Game Center. Same numbers as the strip, with sample sizes and definitions. */
export function PregameExpanded({ game, away, home, summary, games, hideButton = false, beforeOpen }: {
  game: Game; away: Team; home: Team; summary: MpResult<SummaryPart>; games: MpResult<GamesPart>; hideButton?: boolean; beforeOpen?: () => void;
}) {
  const data = summary.data;
  const p = data ? profileFor(data, away.id, home.id) : null;
  const g = useStarterLines(game, away, home, data);
  const l5 = games.data ? { away: lastFive(games.data, away.id), home: lastFive(games.data, home.id) } : null;
  const rk = (team: string, sit: string, key: string, hi = true) => (data ? leagueRank(data, team, (t: any) => (teamMetrics(t?.[sit]) as any)?.[key] ?? null, hi) : null);
  const sample = (side: NonNullable<typeof p>["away"], m: any, what: string) => (side.gp != null ? `${side.gp} GP · ${fmtMin(m?.toi)} min ${what}` : undefined);
  return (
    <section className="nhlp-expanded sp" aria-label="Season profile detail" data-testid="nhlp-expanded" style={{ ["--sp-a" as any]: gaugeColors(away.id, home.id).away, ["--sp-h" as any]: gaugeColors(away.id, home.id).home }}>
      <header className="sp-head">
        <div className="sp-team"><TeamLogo id={away.id} size={64} /><span><em>{away.city}</em><b>{away.short}</b></span></div>
        <div className="sp-title"><span className="sp-line a" aria-hidden="true" /><span className="sp-mid"><span className="nhlp-title">Season profile</span><small>{seasonLabel(game.season)} season</small></span><span className="sp-line h" aria-hidden="true" /></div>
        <div className="sp-team sp-right"><span><em>{home.city}</em><b>{home.short}</b></span><TeamLogo id={home.id} size={64} /></div>
      </header>
      {!data || !p ? <DataStatus state={summary.state} updated={null} what="Season profile" onRetry={summary.retry} /> : <div className="nhlp-body">
        <div className="sp-col">
        <div className="nhlp-grp">
        <h4 className="nhlp-h">Chance creation</h4>
        <CompareRow label="5-on-5 xG share" tip="xGPct" left={{ rank: rk(away.id, "5on5", "xGPct", true), team: away.id, value: p.away.xGPct, text: fmtPct(p.away.xGPct), sub: sample(p.away, p.away.m5, "5v5") }} right={{ rank: rk(home.id, "5on5", "xGPct", true), team: home.id, value: p.home.xGPct, text: fmtPct(p.home.xGPct), sub: sample(p.home, p.home.m5, "5v5") }} diffPct />
        <CompareRow label="5-on-5 xG for" tip="xGF60" unit="per 60" left={{ rank: rk(away.id, "5on5", "xGF60", true), team: away.id, value: p.away.m5?.xGF60 ?? null, text: fmt(p.away.m5?.xGF60) }} right={{ rank: rk(home.id, "5on5", "xGF60", true), team: home.id, value: p.home.m5?.xGF60 ?? null, text: fmt(p.home.m5?.xGF60) }} />
        </div>
        <div className="nhlp-grp">
        <h4 className="nhlp-h">Defensive suppression</h4>
        <CompareRow label="5-on-5 xG against" tip="xGA60" unit="per 60, lower is better" higherIsBetter={false} left={{ rank: rk(away.id, "5on5", "xGA60", false), team: away.id, value: p.away.m5?.xGA60 ?? null, text: fmt(p.away.m5?.xGA60) }} right={{ rank: rk(home.id, "5on5", "xGA60", false), team: home.id, value: p.home.m5?.xGA60 ?? null, text: fmt(p.home.m5?.xGA60) }} />
        </div>
        </div>
        <div className="sp-col">
        <div className="nhlp-grp">
        <h4 className="nhlp-h">Special teams</h4>
        <CompareRow label="Power play" tip="pp" unit="xG for per 60" left={{ rank: rk(away.id, "5on4", "xGF60", true), team: away.id, value: p.away.ppXG60, text: fmt(p.away.ppXG60), sub: sample(p.away, p.away.pp, "PP") }} right={{ rank: rk(home.id, "5on4", "xGF60", true), team: home.id, value: p.home.ppXG60, text: fmt(p.home.ppXG60), sub: sample(p.home, p.home.pp, "PP") }} />
        <CompareRow label="Penalty kill" tip="pk" unit="xG against per 60, lower is better" higherIsBetter={false} left={{ rank: rk(away.id, "4on5", "xGA60", false), team: away.id, value: p.away.pkXGA60, text: fmt(p.away.pkXGA60), sub: sample(p.away, p.away.pk, "PK") }} right={{ rank: rk(home.id, "4on5", "xGA60", false), team: home.id, value: p.home.pkXGA60, text: fmt(p.home.pkXGA60), sub: sample(p.home, p.home.pk, "PK") }} />
        </div>
        <div className="nhlp-grp">
        <h4 className="nhlp-h">Goaltending</h4>
        <CompareRow label="Starter goals saved above expected" tip="gsax" unit="season total"
          left={{ team: away.id, value: g.away.gsax, text: fmtSigned(g.away.gsax), sub: [g.away.name, starterGap(g.away) ?? statusWord(g.away.status), g.away.gp != null ? `${g.away.gp} GP` : null].filter(Boolean).join(" · ") }}
          right={{ team: home.id, value: g.home.gsax, text: fmtSigned(g.home.gsax), sub: [g.home.name, starterGap(g.home) ?? statusWord(g.home.status), g.home.gp != null ? `${g.home.gp} GP` : null].filter(Boolean).join(" · ") }} diffDigits={1} />
        </div>
        <div className="nhlp-grp">
        <h4 className="nhlp-h">Recent trend</h4>
        {l5 && (l5.away.n > 0 || l5.home.n > 0)
          ? <CompareRow label="xG share, last 5 games" tip="rolling" unit="derived from shot-level data" left={{ team: away.id, value: l5.away.xGPct, text: fmtPct(l5.away.xGPct), sub: `${l5.away.n} game${l5.away.n === 1 ? "" : "s"}` }} right={{ team: home.id, value: l5.home.xGPct, text: fmtPct(l5.home.xGPct), sub: `${l5.home.n} game${l5.home.n === 1 ? "" : "s"}` }} diffPct />
          : <p className="nhlp-note">{games.state === "loading" ? "Loading recent games…" : "Recent games are not available yet."}</p>}
        </div>
        </div>
        <p className="nhlp-note nhlp-foot"><MetricTip id="xG"><span>Expected goals</span></MetricTip> are MoneyPuck's model. Small samples move a lot early in the season.</p>
      </div>}
      <footer className="sp-foot">
        {!hideButton && <NhlPlusButton game={game} away={away} home={home} before={beforeOpen} className="nhlp-btn-lg" />}
        <DataStatus compact state={summary.state} updated={summary.updated} stale={summary.stale} savedCopy={summary.savedCopy} what="Season profile" onRetry={summary.retry} />
      </footer>
    </section>
  );
}
