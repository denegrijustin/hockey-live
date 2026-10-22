import { useMemo } from "react";
import { teamTable } from "../../../lib/nhlplus.mjs";
import { analyzeSeason } from "../../../lib/model.mjs";
import { CELLS, PLAY_ROWS, RESULT_COLS, playMatrix } from "../../../lib/play-matrix.mjs";
import type { Ctx } from "../context";
import { Loading, Logo, Panel, TEAMS, Unavailable, teamName } from "../common";

type Entry = { team: string; xgPct: number; ptsPct: number; gp: number };

const pct = (v: number) => `${v.toFixed(1)}%`;
const points = (v: number) => v.toFixed(3).replace(/^0/, "");

export function MatrixView({ ctx }: { ctx: Ctx }) {
  const { summary, appGames } = ctx;
  const matrix: Record<string, Entry[]> | null = useMemo(() => {
    if (!summary.data) return null;
    const rows = teamTable(summary.data, "5on5").map((r: any) => ({ team: r.team, xGPct: r.xGPct == null ? null : r.xGPct * 100 }));
    return playMatrix(rows, analyzeSeason(appGames, TEAMS).table);
  }, [summary.data, appGames]);
  if (summary.state === "loading") return <Loading what="team data" />;
  if (!summary.data || !matrix) return <Unavailable what="Team data" onRetry={summary.retry} />;
  const placed = Object.values(matrix).reduce((n, l) => n + l.length, 0);
  return (
    <Panel
      id="np-matrix"
      title="Playing well? Winning?"
      sub={<>Every club by how it plays (5-on-5 expected-goal share) and what it has to show for it (points %). The off-diagonal corners are the ones to watch: results that don’t match the play tend to move toward it.</>}
    >
      {placed === 0 ? <p className="np-note">No games played yet this season.</p> : (
        <div className="pm" role="table" aria-label="Teams by play and results">
          <div className="pm-corner" aria-hidden="true" />
          {RESULT_COLS.map((c) => (
            <div key={c.key} className="pm-colhead" role="columnheader"><b>{c.label}</b><span>{c.note}</span></div>
          ))}
          {PLAY_ROWS.map((r) => (
            <div key={r.key} className="pm-rowgroup" role="row">
              <div className="pm-rowhead" role="rowheader"><b>{r.label}</b><span>{r.note}</span></div>
              {RESULT_COLS.map((c) => {
                const cell = CELLS[`${r.key}/${c.key}` as keyof typeof CELLS];
                const list = matrix[`${r.key}/${c.key}`];
                return (
                  <div key={c.key} className={`pm-cell ${cell.tone}`} role="cell" data-cell={`${r.key}/${c.key}`}>
                    <h4>{cell.title}<span className="pm-res">· {c.label}</span></h4>
                    <ul>
                      {list.map((t) => (
                        <li key={t.team} title={`${teamName(t.team)} · ${pct(t.xgPct)} xG share · ${points(t.ptsPct)} points % · ${t.gp} GP`}>
                          <Logo team={t.team} size={36} />
                          <span className="pm-name">{t.team}</span>
                          <span className="pm-stat">{pct(t.xgPct)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <p className="np-note pm-foot">Under each logo: 5-on-5 xG share. Play: 5-on-5 expected-goal share · results: points %. Hover or long-press a team for its numbers.</p>
    </Panel>
  );
}
