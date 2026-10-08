import { useEffect, useMemo, useState } from "react";
import { simulatePlayoffs } from "../lib/playoff-sim.mjs";
import type { Game, Team } from "../types";
import "./playoff-odds.css";

const SIMS = 20000;
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
              <h3>{conf === "E" ? "Eastern Conference" : "Western Conference"}</h3>
              <div className="po-grid" data-testid={`po-grid-${conf}`} tabIndex={0} role="region" aria-label={`${conf === "E" ? "Eastern" : "Western"} Conference playoff probabilities`}>
                <table className="po-table">
                  <thead>
                    <tr>
                      <th className="po-team">Team</th>
                      <th>Record</th>
                      <th>Pts</th>
                      <th>Proj. pts</th>
                      <th>Div 1st</th>
                      <th>Div 2nd</th>
                      <th>Div 3rd</th>
                      <th>WC1</th>
                      <th>WC2</th>
                      <th>Make it</th>
                      <th className="po-first">#1 in conf.</th>
                      <th>Presidents’ Trophy</th>
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
                              <img src={`/logos/${t.id}.svg`} alt="" loading="lazy" width={22} height={22} />
                              <span>{t.short}<br /><small className="po-sub">{t.division}</small></span>
                            </div>
                          </td>
                          <td>{row.w}–{row.l}–{row.ot}</td>
                          <td>{row.pts}</td>
                          <td>{Math.round(x.expPts)}</td>
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
            </div>
          );
        })}
    </section>
  );
}
