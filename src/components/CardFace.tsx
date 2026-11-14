import { useMemo, useState } from "react";
import type { Team } from "../types";
import { useFeed } from "../lib/polling";
import { Icon } from "./icons";

/** The three live readings under the teams: who is favoured, who has the play right now, who has deserved more of the game. */
export function MetricTrio({ away, home, homePct, momentum, deserve }: {
  away: Team; home: Team;
  /** Home win chance in percent, or null. */
  homePct: number | null;
  momentum: { leader: string | null; balance: number } | null;
  /** Share of the deserved win for the away side (0..1), or null. */
  deserve: { away: number; home: number } | null;
}) {
  const fav = homePct == null ? null : homePct >= 50 ? { t: home, p: homePct } : { t: away, p: 100 - homePct };
  const dv = deserve == null ? null : deserve.home >= deserve.away ? { t: home, p: Math.round(deserve.home * 100) } : { t: away, p: Math.round(deserve.away * 100) };
  if (!fav && !momentum && !dv) return null;
  // the marker sits where the play is: left for away, right for home
  const pos = momentum ? 50 + momentum.balance * 45 : 50;
  return (
    <div className="gcv-trio" data-testid="card-metrics">
      {fav && (
        <div className="gcv-metric" aria-label={`Win probability: ${fav.t.id} ${fav.p} percent`}>
          <h5>Win probability</h5>
          <span className="gcv-gradbar" aria-hidden="true" />
          <b>{fav.t.id} {fav.p}%</b>
        </div>
      )}
      {momentum && (
        <div className="gcv-metric" aria-label={momentum.leader ? `Momentum: ${momentum.leader === "home" ? home.id : away.id}` : "Momentum: even"}>
          <h5>Momentum</h5>
          <span className="gcv-segbar" aria-hidden="true"><i style={{ left: `${pos}%` }} /></span>
          <b>{momentum.leader ? <>{momentum.leader === "home" ? home.id : away.id} <i className="gcv-up" aria-hidden="true">▲</i></> : "Even"}</b>
        </div>
      )}
      {dv && (
        <div className="gcv-metric" aria-label={`Deserve: ${dv.t.id} ${dv.p} percent`}>
          <h5>Deserve</h5>
          <span className="gcv-gradbar alt" aria-hidden="true" />
          <b>{dv.t.id} {dv.p}%</b>
        </div>
      )}
    </div>
  );
}

/** Before the game: the win chance as one bar, each side's percentage at its end. */
export function ProbRow({ away, home, homePct }: { away: Team; home: Team; homePct: number }) {
  const a = 100 - homePct;
  return (
    <div className="gcv-probrow" role="img" aria-label={`Win probability: ${away.id} ${a} percent, ${home.id} ${homePct} percent`}>
      <span>{away.id} {a}%</span>
      <span className="gcv-probbar"><i style={{ width: `${a}%` }} /><u /></span>
      <span>{homePct}% {home.id}</span>
    </div>
  );
}

type Item = { id: string; name: string; pos: string | null; team: string; headshot: string | null; status: string; impact: { level: "high" | "medium" | "low" | null } };
const RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** The player each side misses most (by how much the team feels it), as one pill each. Reads the shared injury report; nothing is shown until it arrives. */
export function InjuryRow({ away, home, season }: { away: Team; home: Team; season: number }) {
  const { data } = useFeed<{ items: Item[] }>(`/api/injuries/${season}`, 600_000);
  const picks = useMemo(() => [away, home].map((t) => {
    const mine = (data?.items ?? []).filter((i) => i.team === t.id);
    return mine.sort((x, y) => (RANK[y.impact?.level ?? ""] ?? 0) - (RANK[x.impact?.level ?? ""] ?? 0))[0] ?? null;
  }), [data, away, home]);
  if (!picks.some(Boolean)) return null;
  return (
    <div className="gcv-injuries" data-testid="card-injuries">
      <span className="gcv-label">Injuries</span>
      {picks.map((i) => i && <InjuryPill key={i.id} item={i} />)}
    </div>
  );
}

function InjuryPill({ item }: { item: Item }) {
  const [bad, setBad] = useState(false);
  const last = item.name.split(" ").slice(-1)[0];
  const lvl = item.impact?.level === "high" ? "High" : item.impact?.level === "medium" ? "Med" : "";
  return (
    <span className="gcv-pillrow" title={`${item.name}, ${item.status}`}>
      {item.headshot && !bad && <img src={item.headshot} alt="" width="28" height="28" loading="lazy" onError={() => setBad(true)} />}
      <b>{item.team}</b> {last}{item.pos ? ` ${item.pos}` : ""} <i aria-hidden="true">·</i> <span className={`gcv-st ${item.impact?.level ?? ""}`}>{item.status}{lvl ? ` ${lvl}` : ""}</span>
    </span>
  );
}

/** What the model says: the favourite at the puck line with the total, and the most likely final score. */
export function ModelPills({ away, home, line, score }: { away: Team; home: Team; line: { favourite: string; total: number } | null; score: { home: number; away: number } | null }) {
  if (!line && !score) return null;
  const fav = line ? (line.favourite === "home" ? home : away) : null;
  return (
    <div className="gcv-pills">
      {line && fav && <span className="gcv-pillrow"><Icon name="scale" size={26} /><span>Model: <b>{fav.id} −1.5</b> · total {line.total}</span></span>}
      {score && <span className="gcv-pillrow"><Icon name="bullseye" size={26} /><span>{away.id} <b>{score.away}</b> – <b>{score.home}</b> {home.id}</span></span>}
    </div>
  );
}
