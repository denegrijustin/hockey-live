import { useEffect, useMemo, useState } from "react";
import { simulatePlayoffs } from "../lib/playoff-sim.mjs";
import type { Game, Team } from "../types";
import "./playoff-odds.css";
import { TeamLogo } from "./TeamLogo";
import { TeamLink } from "./TeamProfile";

const SIMS = 20000;
const DIV_FILE: Record<string, string> = { Atlantic: "atlantic", Metropolitan: "metro", Central: "central", Pacific: "pacific" };
const COLS: [string, string, string][] = [["Div 1st", "D1", "Chance to finish first in the division"], ["Div 2nd", "D2", "Chance to finish second in the division"], ["Div 3rd", "D3", "Chance to finish third in the division"], ["WC1", "W1", "Chance to take the first wild-card spot"], ["WC2", "W2", "Chance to take the second wild-card spot"], ["Make it", "Make", "Chance to make the playoffs"], ["#1 in conf.", "#1", "Chance to finish first in the conference"], ["Presidents’ Trophy", "Pres.", "Chance to finish first in the league"]];
const fmt = (p: number) => (p >= 99.5 ? ">99" : p < 0.5 ? "–" : String(Math.round(p)));
const Cell = ({ p, cls = "" }: { p: number; cls?: string }) => (
  <td
    className={`po-cell ${cls} ${p < 0.5 ? "po-zero" : ""}`}
    style={{ ["--p" as any]: Math.min(1, p / 100) }}
    title={`${p.toFixed(1)}%`}
  >
    {fmt(p)}
  </td>
);

export function PlayoffOdds({
  teams,
  games,
  table,
  baseline,
  season,
}: {
  teams: Team[];
  games: Game[];
  table: Record<string, any>;
  baseline?: Record<string, any>;
  season: number;
}) {
  const [result, setResult] = useState<any>(null);
  const sig = useMemo(() => ({ teams, games, table, baseline }), [teams, games, table, baseline]);
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      setResult(simulatePlayoffs({ ...sig, baseline: sig.baseline ?? {}, sims: SIMS, seed: 1 }));
    };
    setResult(null);
    const w = window as any;
    const handle = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 500 }) : setTimeout(run, 30);
    return () => {
      cancelled = true;
      w.cancelIdleCallback ? w.cancelIdleCallback(handle) : clearTimeout(handle);
    };
  }, [sig]);

  const s = String(season);
  const seasonLabel = s.length === 8 ? `${s.slice(0, 4)}–${s.slice(6)}` : s;

  return (
    <section className="panel po-panel" aria-labelledby="po-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PLAYOFF PICTURE</p>
          <h2 id="po-title">Playoff odds</h2>
          <p className="po-note">
            {result
              ? result.complete
                ? `The ${seasonLabel} regular season is complete, so these are final results, not forecasts. `
                : `Based on ${result.sims.toLocaleString()} simulated seasons with ${result.remainingGames.toLocaleString()} regular-season games remaining. `
              : "Simulating the rest of the season… "}
            This is an uncalibrated model of goals scored and allowed, not official odds. Ties in points are broken by
            regulation wins and then a coin flip; the NHL's full tiebreak procedure is not implemented. Cells show
            percent chance; “–” means under 0.5%.
          </p>
        </div>
      </div>
      {!result && <p className="po-loading" role="status">Running simulations…</p>}
      {result &&
        (["E", "W"] as const).map((conf) => {
          const rows = teams
            .filter((t) => t.conference === conf)
            .sort(
              (a, b) =>
                result.teams[b.id].pPlayoffs - result.teams[a.id].pPlayoffs ||
                (table[b.id]?.pts ?? 0) - (table[a.id]?.pts ?? 0) ||
                a.name.localeCompare(b.name),
            );
          return (
            <div className="po-conf" key={conf}>
              <h3><img className="po-conf-logo" src={`/logos/league/${conf === "E" ? "east" : "west"}.webp`} alt={conf === "E" ? "Eastern Conference" : "Western Conference"} width="84" height="61" /></h3>
              <div className="po-grid" data-testid={`po-grid-${conf}`} role="region" aria-label={`${conf === "E" ? "Eastern" : "Western"} Conference playoff probabilities`}>
                <table className="po-table">
                  <thead>
                    <tr>
                      <th className="po-team" scope="col">Team</th>
                      <th className="po-rec">Record</th>
                      <th className="po-rec">Pts</th>
                      <th className="po-proj" title="Projected points at the end of the season"><span className="po-long">Proj. pts</span><span className="po-short">Proj</span></th>
                      {COLS.map(([long, short, tip]) => <th key={long} className={long === "#1 in conf." ? "po-first" : ""} title={tip} scope="col"><span className="po-long">{long}</span><span className="po-short">{short}</span></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const x = result.teams[t.id];
                      const row = table[t.id] ?? { w: 0, l: 0, ot: 0, pts: 0 };
                      return (
                        <tr key={t.id}>
                          <td className="po-team">
                            <div className="po-team-cell">
                              <i className="po-accent" style={{ background: t.cardColor ?? t.color }} />
                              <TeamLogo id={t.id} size={22} />
                              <span className="po-name"><b><TeamLink id={t.id}>{t.short}</TeamLink></b><small className="po-sub"><img className="po-div-logo" src={`/logos/league/${DIV_FILE[t.division] ?? "atlantic"}.webp`} alt={`${t.division} Division`} width="32" height="21" title={`${t.division} Division`} /><span className="po-line">{row.w}–{row.l}–{row.ot} · {row.pts}<span className="po-ptsword"> pts</span></span></small></span>
                            </div>
                          </td>
                          <td className="po-rec">{row.w}–{row.l}–{row.ot}</td>
                          <td className="po-rec">{row.pts}</td>
                          <td className="po-proj">{Math.round(x.expPts)}</td>
                          <Cell p={x.pDivision[0]} />
                          <Cell p={x.pDivision[1]} />
                          <Cell p={x.pDivision[2]} />
                          <Cell p={x.pWildCard[0]} />
                          <Cell p={x.pWildCard[1]} />
                          <Cell p={x.pPlayoffs} cls="po-make" />
                          <Cell p={x.pConferenceFirst} cls="po-first" />
                          <Cell p={x.pPresidents} cls="po-pres" />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="po-legend">Proj = projected points · D1–D3 = finishing 1st–3rd in the division · W1–W2 = wild-card spots · Make = makes the playoffs · #1 = top of the conference · Pres. = Presidents’ Trophy</p>
            </div>
          );
        })}
    </section>
  );
}
