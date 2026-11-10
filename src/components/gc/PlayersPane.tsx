import { useMemo, useState } from "react";
import { useGameCenter } from "./GameCenterContext";
import { useGameBox } from "../../hooks/useGameBox";
import { usePlayerProfile } from "../player/PlayerContext";
import { skaterLines, goalieLines, sortLines, notablePerformances, SKATER_COLS, GOALIE_COLS, DEFAULT_SORT, fmtNum, fmtSigned, fmtSv, fmtToi, DASH } from "../../lib/gc-stats.mjs";
import { Src, BoxNotice } from "./StatsBits";

type Sort = { key: string; dir: "asc" | "desc" };
type Line = any;

function NameButton({ p, sub }: { p: { id: number; name: string; team: string; number?: number | null; headshot?: string; position?: string }; sub?: string }) {
  const openPlayer = usePlayerProfile();
  return (
    <button type="button" className="gcs-name" onClick={() => openPlayer({ id: p.id, name: p.name, team: p.team, headshot: p.headshot, number: p.number })} aria-label={`View ${p.name} details`}>
      <strong>{p.name}</strong>
      <small>{[p.number != null ? `#${p.number}` : null, p.position].filter(Boolean).join(" · ")}</small>
      {sub && <small className="sub">{sub}</small>}
    </button>
  );
}

function Head({ cols, sort, onSort }: { cols: { key: string; label: string; text?: boolean }[]; sort: Sort; onSort: (k: string, text: boolean) => void }) {
  return (
    <thead>
      <tr>
        {cols.map((c) => (
          <th key={c.key} scope="col" className={`col-${c.key}`} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
            <button type="button" onClick={() => onSort(c.key, !!c.text)}>{c.label}</button>
          </th>
        ))}
      </tr>
    </thead>
  );
}

function useSort(initial: Sort): [Sort, (k: string, text: boolean) => void] {
  const [sort, setSort] = useState<Sort>(initial);
  return [sort, (key, text) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: text ? "asc" : "desc" }))];
}

/**
 * Game Center "Players": notable performances, then Skaters and Goalies tables per team (sortable). Official player lines from the box score;
 * points and save % are computed here. Notable performances are display filters on real stats (docs/phase5-stats.md).
 */
export default function PlayersPane() {
  const { game, live } = useGameCenter();
  const state = useGameBox();
  const { box } = state;
  const [skSort, onSk] = useSort(DEFAULT_SORT.skaters as Sort);
  const [gSort, onG] = useSort(DEFAULT_SORT.goalies as Sort);
  const notable = useMemo(() => notablePerformances(box, { live }), [box, live]);
  return (
    <div className="gcs" data-testid="gc-players" aria-label="Players">
      <BoxNotice {...state} />
      {box && (
        <>
          <section aria-labelledby="gcs-notable-h" data-testid="gc-notable">
            <h3 id="gcs-notable-h">Notable performances <Src kind="derived" /></h3>
            {notable.length ? (
              <ul className="gcs-notable">
                {notable.map((c: Line) => (
                  <li key={c.id} data-testid="gc-notable-card" data-kind={c.kind}>
                    <NameButton p={c} sub={undefined} />
                    <p>{c.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="gcs-note">{live ? "No standout lines yet." : "No standout lines in this game."}</p>
            )}
            <p className="gcs-note">Display filters on the official stats: 3+ points, hat trick, 6+ shots on goal; goalies with 25+ saves, a shutout on 15+ shots or a .950+ save % on 15+ shots. Cards are ordered by the existing game score (skaters) and goalie impact index; no new score.</p>
          </section>
          {[game.away, game.home].map((team) => {
            const sk = sortLines(skaterLines(box, team), skSort.key, skSort.dir) as Line[];
            const gl = sortLines(goalieLines(box, team), gSort.key, gSort.dir) as Line[];
            return (
              <section key={team} className="gcs-team" aria-label={`${team} players`} data-team={team}>
                <h3>{team}</h3>
                <table className="gcs-sk" data-testid={`gc-skaters-${team}`}>
                  <caption>{team} skaters <Src kind="official" /></caption>
                  <Head cols={SKATER_COLS} sort={skSort} onSort={onSk} />
                  <tbody>
                    {sk.map((p) => (
                      <tr key={p.id} data-player-id={p.id}>
                        <td><NameButton p={p} sub={`+/- ${fmtSigned(p.plusMinus)} · Hits ${fmtNum(p.hits)} · BLK ${fmtNum(p.blocks)} · PIM ${fmtNum(p.pim)}`} /></td>
                        <td>{fmtNum(p.goals)}</td><td>{fmtNum(p.assists)}</td><td>{fmtNum(p.points)}</td>
                        <td>{fmtNum(p.shots)}</td><td className="col-hits">{fmtNum(p.hits)}</td><td className="col-blocks">{fmtNum(p.blocks)}</td>
                        <td className="col-pim">{fmtNum(p.pim)}</td><td className="col-plusMinus">{fmtSigned(p.plusMinus)}</td><td>{fmtToi(p.toi)}</td>
                      </tr>
                    ))}
                    {!sk.length && <tr><td colSpan={SKATER_COLS.length}>{DASH} No skater lines yet.</td></tr>}
                  </tbody>
                </table>
                <table className="gcs-gl" data-testid={`gc-goalies-${team}`}>
                  <caption>{team} goalies <Src kind="official" /></caption>
                  <Head cols={GOALIE_COLS} sort={gSort} onSort={onG} />
                  <tbody>
                    {gl.map((p) => (
                      <tr key={p.id} data-player-id={p.id}>
                        <td><NameButton p={p} /></td>
                        <td>{fmtNum(p.saves)}</td><td>{fmtNum(p.shotsAgainst)}</td><td>{fmtNum(p.goalsAgainst)}</td>
                        <td>{fmtSv(p.savePct)}</td><td>{fmtToi(p.toi)}</td>
                      </tr>
                    ))}
                    {!gl.length && <tr><td colSpan={GOALIE_COLS.length}>{DASH} No goalie has played yet.</td></tr>}
                  </tbody>
                </table>
              </section>
            );
          })}
          <p className="gcs-note">Points = goals + assists. Save % = saves ÷ shots against, computed here. Goalies who did not play are not listed. On narrow screens hits, blocks, penalty minutes and +/- move under the name.</p>
        </>
      )}
    </div>
  );
}
