import { useMemo } from "react";
import { useMoneyPuck } from "../lib/moneypuck-client";
import { gsaxBoard } from "../lib/gsax.mjs";
import type { Team } from "../types";
import { TeamLogo } from "./TeamLogo";
import "./gsax.css";

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
/** Blue for goals saved, red for goals let in, deeper the further from zero. */
const tint = (v: number, max: number) => {
  const t = max > 0 ? Math.min(1, Math.abs(v) / max) : 0;
  return { background: `color-mix(in srgb, ${v >= 0 ? "#4aa3ff" : "#e0566e"} ${Math.round(14 + t * 72)}%, var(--surface-3))` };
};

/** The league ranked by goals saved above expected (all situations), the way the hockeystats graphic lays it out: three columns, best at the top left. */
export function GsaxBoard({ season, teams, current = true }: { season: number; teams: Team[]; current?: boolean }) {
  const { data, state, updated } = useMoneyPuck(season, "summary", { watchAge: current });
  const rows = useMemo(() => gsaxBoard(data), [data]);
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
  if (!rows.length) return <section className="panel gx" aria-label="Goals saved above expected"><p className="detail-note">{state === "loading" ? "Loading goals saved above expected…" : "Goals saved above expected is not available yet for this season."}</p></section>;
  const max = Math.max(...rows.map((r) => Math.abs(r.gsax)));
  const size = Math.ceil(rows.length / 3);
  const cols = [rows.slice(0, size), rows.slice(size, size * 2), rows.slice(size * 2)];
  return (
    <section className="panel gx" aria-labelledby="gx-title" data-testid="gsax-board">
      <div className="gx-head">
        <div>
          <p className="eyebrow">GOALTENDING AND DEFENCE</p>
          <h2 id="gx-title">Goals saved above expected</h2>
          <p>All situations · expected goals against minus goals allowed · MoneyPuck{updated ? `, updated ${new Date(updated).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}. Positive means a team has allowed fewer goals than the shots it faced should have produced.</p>
        </div>
      </div>
      <div className="gx-cols">
        {cols.map((col, i) => (
          <ol key={i} className="gx-col" start={col[0]?.rank}>
            {col.map((r) => (
              <li key={r.team} data-team={r.team} title={`${nameOf(r.team)}: ${r.xGA.toFixed(1)} expected goals against, ${r.GA} allowed${r.gp ? ` in ${r.gp} games` : ""}`}>
                <span className="gx-rank">{r.rank}</span>
                <TeamLogo id={r.team} size={30} />
                <span className="gx-val" style={tint(r.gsax, max)}>{signed(r.gsax)}</span>
              </li>
            ))}
          </ol>
        ))}
      </div>
    </section>
  );
}
