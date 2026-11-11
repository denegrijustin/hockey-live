import type { Game, Team } from "../../types";
import { recordBeforeGame } from "../../lib/model.mjs";
import { recap } from "../../lib/watchability.mjs";
import { Icon } from "../icons";
import { GameRecap } from "../GameRecap";
import { GameInjuries } from "../GameInjuries";

/** What an opened card adds: the recap, the key stats and injuries. Loaded the first time a card is opened. */
export default function RowDetails({ game, away, home, before, allGames, projection, feed, recapText, showFlow, onFull }: {
  game: Game; away: Team; home: Team; before: any; allGames: Game[]; projection: any; feed: any; recapText: string; showFlow: boolean; onFull: () => void;
}) {
  return (
    <>
      {showFlow && <GameRecap data={feed} home={home} away={away} />}
      {recapText && <p className="sb-recap" data-testid="recap"><b>What happened</b> {recapText}</p>}
      <KeyStats game={game} away={away} home={home} before={before} allGames={allGames} projection={projection} onFull={onFull}><GameInjuries away={away} home={home} season={game.season} /></KeyStats>
    </>
  );
}

function KeyStats({ game, away, home, before, allGames, projection, onFull, children }: { game: Game; away: Team; home: Team; before: any; allGames: Game[]; projection: any; onFull: () => void; children?: React.ReactNode }) {
  const rec = (t: Team) => { const r = recordBeforeGame(allGames, game, t.id); return `${r.w}-${r.l}-${r.ot}`; };
  const per = (t: Team, k: "gf" | "ga") => { const row = before?.[t.id]; return row?.gp ? (row[k] / row.gp).toFixed(1) : "–"; };
  const form = (t: Team) => (before?.[t.id]?.results ?? []).slice(-5);
  const shots = game.homeShots != null && game.awayShots != null;
  return (
    <div className="sb-stats" data-testid="key-stats">
      <div className="sb-heads" aria-hidden="true"><span /><span>{away.id}</span><span>{home.id}</span></div>
      <dl>
        <div><dt>Record</dt><dd>{rec(away)}</dd><dd>{rec(home)}</dd></div>
        <div><dt>Goals for / against per game</dt><dd>{per(away, "gf")} / {per(away, "ga")}</dd><dd>{per(home, "gf")} / {per(home, "ga")}</dd></div>
        <div>
          <dt>Last 5</dt>
          {[away, home].map((t) => (
            <dd key={t.id} className="sb-form" aria-label={`${t.id} last five: ${form(t).map((r: any) => r.outcome).join(" ") || "none yet"}`}>
              {form(t).length ? form(t).map((r: any, i: number) => <em key={i} data-o={r.outcome} aria-hidden="true">{r.outcome}</em>) : "–"}
            </dd>
          ))}
        </div>
        {shots && <div><dt>Shots on goal</dt><dd>{game.awayShots}</dd><dd>{game.homeShots}</dd></div>}
        {projection?.score && <div><dt>Projected final</dt><dd>{projection.score.away}</dd><dd>{projection.score.home}</dd></div>}
      </dl>
      {children}
      <button className="sb-full" onClick={onFull}>
        Full game center <Icon name="chevron" size={18} />
      </button>
    </div>
  );
}
