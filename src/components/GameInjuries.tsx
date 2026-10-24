import { useState } from "react";
import type { Team } from "../types";
import { useFeed } from "../lib/polling";
import { ordinal } from "../lib/injuries.mjs";
import { TeamLogo } from "./TeamLogo";

type Item = { id: string; name: string; pos: string | null; team: string; kind: string; status: string; severity: { level: string; label: string }; back: { text: string }; impact: { basis: "season" | "last" | "none"; level: "high" | "medium" | "low" | null; label: string; percentile: number | null; gp: number; small?: boolean } };
type Report = { items: Item[]; stale?: boolean };
const SHOWN = 4;
const basis = (i: Item["impact"]) => (i.basis === "none" ? "no earlier games" : i.basis === "last" ? `${i.gp} GP last season` : i.small ? `${i.gp} GP, small sample` : `${i.gp} GP this season`);

function Side({ team, items }: { team: Team; items: Item[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  const high = items.filter((i) => i.impact.level === "high").length;
  return (
    <div className="gi-side" data-team={team.id}>
      <h4><TeamLogo id={team.id} size={20} /> {team.short} <span>{items.length ? `${items.length} out${high ? ` · ${high} high-impact` : ""}` : "No injuries reported"}</span></h4>
      {items.length > 0 && (
        <ul>
          {shown.map((i) => (
            <li key={i.id} data-testid="game-injury" data-impact={i.impact.level ?? "none"}>
              <span className="gi-name"><b>{i.name}</b>{i.pos ? <small> {i.pos}</small> : null}</span>
              <span className={`gi-sev ${i.severity.level}`}>{i.severity.label}</span>
              <span className="gi-line">{i.kind} · {i.back.text}</span>
              <span className={`gi-impact ${i.impact.level ?? "none"}`} title={`Judged on ${basis(i.impact)}`}>{i.impact.label}{i.impact.percentile != null ? ` · ${ordinal(i.impact.percentile)} pct` : ""} <small>({basis(i.impact)})</small></span>
            </li>
          ))}
        </ul>
      )}
      {items.length > SHOWN && <button type="button" className="gi-more" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${items.length}`}</button>}
    </div>
  );
}

/** Who is hurt on each side of this game, how serious it is, when they may be back, and how much the team misses them (from earlier games, else last season). */
export function GameInjuries({ away, home, season }: { away: Team; home: Team; season: number }) {
  const { data, error } = useFeed<Report>(`/api/injuries/${season}`, 600_000);
  if (!data) return error ? <p className="gi-note" data-testid="game-injuries">The injury report is unavailable right now.</p> : <p className="gi-note" role="status" data-testid="game-injuries">Loading injuries…</p>;
  const of = (t: Team) => data.items.filter((i) => i.team === t.id);
  return (
    <section className="game-injuries" data-testid="game-injuries" aria-label={`Injuries: ${away.name} and ${home.name}`}>
      <h3 className="gi-title">Injuries</h3>
      <div className="gi-grid">
        <Side team={away} items={of(away)} />
        <Side team={home} items={of(home)} />
      </div>
      <p className="gi-note">Impact is judged on the player’s earlier games this season, or last season if he has few. Source: ESPN. Return dates are estimates.</p>
    </section>
  );
}
