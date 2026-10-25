import { useMemo } from "react";
import { buildTracker } from "../lib/playoff-tracker.mjs";
import type { Team } from "../types";
import { TeamLogo } from "./TeamLogo";

const pctText = (p: number) => (p >= 99.5 ? ">99%" : p < 0.5 ? "<1%" : `${Math.round(p)}%`);

/** Who is in, who is on the bubble and who is out, for each conference, sorted from the same simulation as the tables below. Click a logo for the team. */
export function PlayoffTracker({ teams, result }: { teams: Team[]; result: { teams: Record<string, { pPlayoffs: number }>; sims: number; remainingGames: number; complete: boolean } }) {
  const conferences = useMemo(() => buildTracker({ teams, result }), [teams, result]);
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
  return (
    <div className="pt" data-testid="playoff-tracker">
      <div className="pt-band">
        <div><h3>Playoff tracker</h3><p>{result.complete ? "Final results" : `${result.remainingGames.toLocaleString()} games left`} · 16 spots, 8 in each conference</p></div>
        <span>{result.sims.toLocaleString()} simulated seasons</span>
      </div>
      <div className="pt-confs">
        {conferences.map((c) => (
          <section key={c.conf} className="pt-conf" data-conf={c.conf} aria-label={c.conf === "E" ? "Eastern Conference tracker" : "Western Conference tracker"}>
            <header>
              <img src={`/logos/league/${c.conf === "E" ? "east" : "west"}.webp`} alt={c.conf === "E" ? "Eastern Conference" : "Western Conference"} width="64" height="47" />
              <span><b>{c.spots} spots</b><small>{c.contention} teams in contention</small></span>
            </header>
            <div className={`pt-tier in`}>
              <h4>In the field <small>made it in every simulated season</small><b data-testid="pt-in-count">{c.inField}/{c.spots}</b></h4>
              <ul className="pt-slots">
                {Array.from({ length: c.spots }, (_, i) => {
                  const t = c.tiers[0].teams[i];
                  return t
                    ? <li key={t.id} className="pt-chip" title={`${nameOf(t.id)}: in`}><TeamLogo id={t.id} size={34} /></li>
                    : <li key={`a${i}`} className="pt-avail" aria-label="Spot still open"><span>AVAIL</span></li>;
                })}
              </ul>
            </div>
            {c.tiers.slice(1).map((tier) => (
              <div key={tier.key} className={`pt-tier ${tier.key}`} data-tier={tier.key}>
                <h4>{tier.label} <small>{tier.note}</small><b>{tier.teams.length}</b></h4>
                {tier.teams.length ? (
                  <ul className="pt-logos">
                    {tier.teams.map((t) => (
                      <li key={t.id} className="pt-chip" title={`${nameOf(t.id)}: ${tier.key === "out" ? "out of the race" : `${t.p.toFixed(1)}% to make the playoffs`}`}>
                        <TeamLogo id={t.id} size={tier.key === "out" ? 28 : 34} />
                        {tier.key !== "out" && <small>{pctText(t.p)}</small>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="pt-none">{tier.key === "out" ? "Nobody is out yet." : "No teams in this group."}</p>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
