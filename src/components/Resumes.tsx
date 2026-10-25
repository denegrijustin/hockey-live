import { useMemo } from "react";
import type { Game, Team } from "../types";
import { buildResumes } from "../lib/resumes.mjs";
import { TeamLogo } from "./TeamLogo";
import "./resumes.css";

type Meet = { id: number; opp: string; oppRank: number; home: boolean; gf: number; ga: number; end: string; bad?: boolean };
type Row = { team: string; rank: number; gp: number; record: string; pts: number; bestWins: Meet[]; losses: Meet[]; moreLosses: number; lossCount: number; badLosses: number; sos: { rank: number; value: number }; off: { rank: number; value: number }; def: { rank: number; value: number } };

/** Rank 1 is dark green, the last rank is red: the same read as the football resumé board. */
const heat = (rank: number, size: number) => {
  const t = size > 1 ? (rank - 1) / (size - 1) : 0;
  return { background: `color-mix(in srgb, ${t < 0.5 ? "var(--green-5, #3fb68b)" : "var(--red-5, #e06a6a)"} ${Math.round(Math.abs(t - 0.5) * 2 * 70)}%, transparent)` };
};

function Chip({ m, win }: { m: Meet; win: boolean }) {
  return (
    <li className={`rs-chip${m.bad ? " bad" : ""}`} title={`${win ? "Won" : "Lost"} ${win ? m.gf : m.gf}–${m.ga}${m.end ? ` (${m.end})` : ""} ${m.home ? "at home against" : "on the road against"} the #${m.oppRank} team${m.bad ? ". A bad loss: the opponent is in the bottom ten." : ""}`}>
      <TeamLogo id={m.opp} size={22} />
      <span className="rs-chip-s"><b>{m.gf}–{m.ga}</b>{m.end ? <small>{m.end}</small> : null}</span>
      <span className="rs-chip-w">{m.home ? "vs" : "at"} #{m.oppRank}</span>
      {m.bad && <em className="rs-bad">BAD</em>}
    </li>
  );
}

function Cell({ label, rank, size, sub }: { label: string; rank: number; size: number; sub: string }) {
  return (
    <span className="rs-cell" style={heat(rank, size)} title={`${label}: ranked ${rank} of ${size}${sub ? ` (${sub})` : ""}`}>
      <small>{label}</small><b>{rank}</b>{sub ? <i>{sub}</i> : null}
    </span>
  );
}

/** Every team's resumé: best wins, losses, schedule strength, offense and defense, in the order of the standings. */
export function Resumes({ teams, table, games }: { teams: Team[]; table: Record<string, any>; games: Game[] }) {
  const rows = useMemo(() => buildResumes({ teams, table, games }) as Row[], [teams, table, games]);
  const shortOf = (id: string) => teams.find((t) => t.id === id)?.short ?? id;
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
  if (!rows.length) return <p className="detail-note">Resumés appear once teams have played.</p>;
  return (
    <div className="rs" data-testid="resumes">
      <p className="rs-key">
        Order is the standings, by points percentage. <b>Best wins</b> are ranked by how good the opponent is now; <b>vs</b> is at home, <b>at</b> is on the road, <b>#</b> is the opponent’s rank. <b>SOS</b>, <b>OFF</b> and <b>DEF</b> are ranks among {rows.length} teams (1 is best):
        schedule strength is the opponents’ average points %, offense is goals per game, defense is goals against per game. <b className="rs-bad-key">BAD</b> is a loss to a team ranked 23rd or lower. Regular season only.
      </p>
      <ol className="rs-list">
        {rows.map((r) => (
          <li key={r.team} className="rs-row" data-team={r.team}>
            <span className="rs-rank">{r.rank}</span>
            <span className="rs-team"><TeamLogo id={r.team} size={30} /><span><b title={nameOf(r.team)}>{shortOf(r.team)}</b><small>{r.record} · {r.pts} pts</small></span></span>
            <div className="rs-wins"><h4>Best wins</h4>{r.bestWins.length ? <ul>{r.bestWins.map((m) => <Chip key={m.id} m={m} win />)}</ul> : <p className="rs-none">No wins yet</p>}</div>
            <div className="rs-losses"><h4>Losses</h4>{r.lossCount ? <ul>{r.losses.map((m) => <Chip key={m.id} m={m} win={false} />)}{r.moreLosses > 0 && <li className="rs-more">+{r.moreLosses} more</li>}</ul> : <p className="rs-none">Unbeaten</p>}</div>
            <span className="rs-cells">
              <Cell label="SOS" rank={r.sos.rank} size={rows.length} sub="" />
              <Cell label="OFF" rank={r.off.rank} size={rows.length} sub={r.off.value.toFixed(1)} />
              <Cell label="DEF" rank={r.def.rank} size={rows.length} sub={r.def.value.toFixed(1)} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
