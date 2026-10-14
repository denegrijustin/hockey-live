import { useState } from "react";
import type { Game, GameFeed, Team } from "../../../types";
import type { GameLog, Goalie, Line } from "../../../lib/moneypuck-types";
import { useFeed } from "../../../lib/polling";
import { useMoneyPuck } from "../../../lib/moneypuck-client";
import { goalieMetrics, gsax } from "../../../lib/nhlplus.mjs";
import { isLive } from "../../../lib/game-data.mjs";
import { DataStatus } from "../shared/DataStatus";
import { Attribution } from "../shared/Attribution";
import { MetricTip } from "../shared/MetricTip";
import { fmt, fmtClockMin, fmtPct, fmtSigned, DASH } from "../shared/format";
import { ChanceFlowChart } from "./ChanceFlowChart";
import { ShotMap } from "./ShotMap";
import { SituationCompare, SituationPicker, type SitFilter } from "./SituationCompare";
import { PregameExpanded } from "./PregameExpanded";
import { useGameMoneyPuck } from "./useGameMoneyPuck";
import { isPlayoff, isShootout, modeNote, penaltyMarkers, SHOOTOUT_NOTE, topLines } from "./logic.mjs";

const face = (season: number, team: string, id: number) => `https://assets.nhle.com/mugs/nhl/${season}/${team}/${id}.png`;

function Section({ title, children, open = false, id }: { title: string; children: React.ReactNode; open?: boolean; id: string }) {
  return (
    <details className="game-center-section nhlp-section" open={open} data-testid={id}>
      <summary>{title} <span>+</span></summary>
      <div className="nhlp-section-body">{children}</div>
    </details>
  );
}

/** The NHL+ sections of the Game Center: season profile, chance flow and shots (completed games), goalies and lines. */
export function GameCenterAnalytics({ game, away, home, onClose }: { game: Game; away: Team; home: Team; onClose: () => void }) {
  const mp = useGameMoneyPuck(game, { enabled: true, wantShots: true, wantGames: true });
  const played = ["LIVE", "CRIT", "OFF", "FINAL"].includes(game.state);
  const { data: feed, error: feedError } = useFeed<GameFeed>(played ? `/api/game/${game.id}?score=${game.awayScore ?? "x"}-${game.homeScore ?? "x"}` : null, isLive(game) ? 30000 : 3600000);
  const playsState = !played ? "idle" : feed ? "ready" : feedError ? "unavailable" : "loading";
  const [sit, setSit] = useState<SitFilter>("all");
  const lines = useMoneyPuck(game.season, "lines");
  const skaters = useMoneyPuck(game.season, "skaters");
  const available = mp.mode === "final-available";
  const playoff = isPlayoff(game);
  const shots = mp.shots.data?.shots ?? null;
  const note = modeNote(game, mp.mode);
  return (
    <>
      <Section id="gc-profile" title="NHL+ season profile" open>
        <PregameExpanded game={game} away={away} home={home} summary={mp.summary} games={mp.games} beforeOpen={onClose} />
      </Section>
      <Section id="gc-flow" title={available ? "Chance flow and shots" : "Game analytics"} open={mp.mode !== "pregame"}>
        {available && mp.gameLog ? (
          <>
            {shots ? <ChanceFlowChart shots={shots} away={away} home={home} playoff={playoff} periods={mp.gameLog.periods} sit={sit} plays={feed?.plays} playsState={playsState} />
              : <p className="nhlp-note">{mp.shots.state === "loading" ? "Loading shot data…" : "Shot-by-shot detail is only kept for recent games, so the chart and shot map are not available for this one."}</p>}
            <SituationPicker value={sit} onChange={setSit} />
            <SituationCompare gameLog={mp.gameLog} shots={shots} away={away} home={home} sit={sit} />
            {shots && <ShotMap shots={sit === "all" ? shots : shots.filter((s) => s.sit === sit)} away={away} home={home} playoff={playoff} />}
            {isShootout(game) && <p className="nhlp-note" data-testid="so-note">{SHOOTOUT_NOTE}</p>}
            <DataStatus state={mp.games.state} updated={mp.games.updated} stale={mp.games.stale} savedCopy={mp.games.savedCopy} what="Completed game" />
          </>
        ) : (
          <>
            {note && <p className="nhlp-pending" data-testid="nhlp-pending" data-mode={mp.mode}>{note}</p>}
            {(mp.mode === "live" || mp.mode === "intermission") && <LiveActivity game={game} away={away} home={home} feed={feed} />}
            {mp.mode === "pregame" && <p className="nhlp-note">Chance flow and shot locations appear here once the game is final and in the nightly MoneyPuck update.</p>}
            {mp.mode !== "pregame" && <Attribution />}
          </>
        )}
      </Section>
      <Section id="gc-goalies-lines" title="Goalies and lines">
        {available && mp.gameLog && <GameGoalies seasonId={game.season} log={mp.gameLog} season={mp.summary.data?.goalies ?? null} away={away} home={home} />}
        <LinesBlock season={game.season} away={away} home={home} lines={lines} skaters={skaters} />
      </Section>
    </>
  );
}

function LiveActivity({ game, away, home, feed }: { game: Game; away: Team; home: Team; feed: GameFeed | null }) {
  const pens = penaltyMarkers(feed?.plays, isPlayoff(game));
  const count = (t: string) => pens.filter((p) => p.team === t).length;
  return (
    <p className="nhlp-activity" data-testid="live-activity"><b>NHL feed</b> · Shots on goal {away.id} {game.awayShots ?? DASH}, {home.id} {game.homeShots ?? DASH}
      {feed?.plays ? ` · Penalties ${away.id} ${count(away.id)}, ${home.id} ${count(home.id)}` : ""}</p>
  );
}

function GameGoalies({ log, season, seasonId, away, home }: { log: GameLog; season: Goalie[] | null; seasonId: number; away: Team; home: Team }) {
  return (
    <div className="nhlp-goalies" data-testid="game-goalies">
      <h4 className="nhlp-h">Goalies in this game <em>MoneyPuck</em></h4>
      <div className="nhlp-table-wrap"><table className="nhlp-table">
        <thead><tr><th>Goalie</th><th><MetricTip id="xG"><span>xGA</span></MetricTip></th><th>GA</th><th>SOG</th><th><MetricTip id="gsax"><span>GSAx</span></MetricTip> game</th><th>GSAx season</th></tr></thead>
        <tbody>
          {log.goalies.map((g) => {
            const row = season?.find((s) => s.id === g.id);
            const m = row ? goalieMetrics(row.sit?.all) : null;
            return (
              <tr key={g.id} data-testid="goalie-row">
                <td><img src={face(seasonId, g.team, g.id)} alt="" width="22" height="22" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />{g.name} <small>{g.team === away.id ? away.id : home.id}</small></td>
                <td>{fmt(g.xGA)}</td><td>{g.GA}</td><td>{g.SOG}</td>
                <td><b>{fmtSigned(gsax(g.xGA, g.GA))}</b></td>
                <td>{m?.gsax != null ? <>{fmtSigned(m.gsax)} <small>{m.gp} GP · {fmtClockMin(m.toi)} TOI</small></> : <small>Not in season data</small>}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </div>
  );
}

function LinesBlock({ season, away, home, lines, skaters }: { season: number; away: Team; home: Team; lines: ReturnType<typeof useMoneyPuck<"lines">>; skaters: ReturnType<typeof useMoneyPuck<"skaters">> }) {
  if (lines.state === "loading" || skaters.state === "loading") return <p className="nhlp-note" role="status">Loading lines…</p>;
  if (!lines.data) return <DataStatus state={lines.state} updated={null} what="Line data" onRetry={lines.retry} />;
  const MIN = 600;
  return (
    <div className="nhlp-lines" data-testid="lines-block">
      <h4 className="nhlp-h"><span>Top 5-on-5 lines and pairings</span> <em>Season, at least {MIN / 60} minutes together</em></h4>
      <div className="nhlp-lines-grid">
        {[away, home].map((t) => {
          const { lines: ls, pairings } = topLines(lines.data, skaters.data, t.id, { minToi: MIN, limit: 3 });
          return (
            <div key={t.id} className="nhlp-team-lines">
              <h5><img src={`/logos/${t.id}.svg`} alt="" width="18" height="18" />{t.short}</h5>
              {[...ls, ...pairings].length === 0 && <p className="nhlp-note">No combination has {MIN / 60}+ minutes at 5-on-5 yet.</p>}
              {[...ls, ...pairings].map((l) => (
                <div className="nhlp-line" key={l.id} data-testid="line-row">
                  <span className="nhlp-faces">{l.players.map((p) => <img key={p.id} src={face(season, t.id, p.id)} alt="" width="24" height="24" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />)}</span>
                  <span className="nhlp-line-names">{l.players.map((p) => p.name ?? DASH).map((n) => n.split(" ").slice(-1)[0]).join(" · ")}<small>{l.type === "line" ? "Forwards" : "Defense"} · {lines.data!.lines.find((x: Line) => x.id === l.id)?.gp ?? DASH} GP</small></span>
                  <span className="nhlp-line-nums"><b>{fmtPct(l.metrics.xGPct)}</b><small>xG% · {fmtClockMin(l.metrics.toi)} TOI</small></span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <DataStatus compact state={lines.state} updated={lines.updated} stale={lines.stale} savedCopy={lines.savedCopy} what="Line data" />
    </div>
  );
}
