import { useEffect, useMemo, useState } from "react";
import teams from "../../data/teams.json";
import type { Scoreboard } from "../../types";
import { loadPlayer, type PlayerGame, type PlayerProfileData } from "../../lib/api";
import { useFeed } from "../../lib/polling";
import { useFollowedPlayers } from "../../hooks/useFollowedPlayers";
import { useAllRosters, useCurrentSeason } from "../../hooks/useAllRosters";
import { useEtToday } from "../../hooks/useEtToday";
import { followedSummaries, splitSummaries, playsTonight, tonightLabel, injuryText, DASH } from "../../lib/watchlist-players.mjs";
import { lastN, seasonLine, fmtRatio } from "../../lib/player-stats.mjs";
import { PlayerIdentity } from "../PlayerIdentity";
import "../../follow.css";

type Summary = ReturnType<typeof followedSummaries>[number];
type Injury = { name: string; team: string; status?: string; kind?: string };
const teamIds = (teams as { id: string }[]).map((t) => t.id);
const fmtDay = (d: string) => { const [, m, day] = d.split("-"); return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1] ?? ""} ${+day}`; };

/** Following > Players: every followed player in a skater or goalie section. Everything is saved on this device. Recent games load only when a card is expanded. */
export function PlayersWatchlist() {
  const { players, syncSnapshots } = useFollowedPlayers();
  const season = useCurrentSeason();
  const need = players.length > 0;
  const rosters = useAllRosters(season, teamIds, need);
  const injuries = useFeed<{ items?: Injury[] }>(need && season ? `/api/injuries/${season}` : null, 600_000);
  const live = useFeed<Scoreboard>(need ? "/api/live" : null);
  const today = useEtToday();
  const [currentTeams, setCurrentTeams] = useState<Record<number, string>>({});
  const [moved, setMoved] = useState<Record<number, { from: string; to: string }>>({});
  const summaries = useMemo(
    () => followedSummaries(players, rosters.data, injuries.data?.items ?? null, { currentTeams }) as Summary[],
    [players, rosters.data, injuries.data, currentTeams],
  );
  // A changed team (a trade) is stored as the new snapshot; this session keeps saying so.
  useEffect(() => {
    const updates = summaries.filter((s) => s.update).map((s) => s.update!);
    if (!updates.length) return;
    setMoved((m) => { const n = { ...m }; for (const s of summaries) if (s.changed && !n[s.id]) n[s.id] = s.changed; return n; });
    syncSnapshots(updates);
  }, [summaries, syncSnapshots]);
  const { skaters, goalies } = useMemo(() => splitSummaries(summaries), [summaries]);
  if (!players.length)
    return (
      <section className="pw" aria-label="Followed players">
        <div className="pw-empty"><strong>No followed players yet.</strong><p>Use the star next to a player in search, on a team roster, or on a player profile. Followed players are saved on this device.</p></div>
      </section>
    );
  const note = rosters.loading ? "Loading rosters…" : rosters.error ? "Some rosters could not be loaded." : "";
  const section = (title: string, list: Summary[]) => list.length > 0 && (
    <section aria-label={title} data-testid={`pw-${title.toLowerCase()}`}>
      <h2>{title} <small>({list.length})</small></h2>
      <ul className="pw-list">
        {list.map((s) => (
          <Card key={s.id} s={s} moved={moved[s.id] ?? null} game={live.data ? playsTonight(s.team, live.data.games, today) : null} injuryLoaded={s.injuryKnown} onTeam={(t) => setCurrentTeams((c) => (c[s.id] === t ? c : { ...c, [s.id]: t }))} />
        ))}
      </ul>
    </section>
  );
  return (
    <div className="pw">
      <p className="pw-note">Saved on this device. Season to date from the team roster files. {note}{rosters.error && <button type="button" className="pw-more" onClick={rosters.retry}>Retry</button>}</p>
      {section("Skaters", skaters)}
      {section("Goalies", goalies)}
    </div>
  );
}
export default PlayersWatchlist;

function Card({ s, moved, game, injuryLoaded, onTeam }: { s: Summary; moved: { from: string; to: string } | null; game: ReturnType<typeof playsTonight>; injuryLoaded: boolean; onTeam: (t: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<{ data: PlayerProfileData | null; error: boolean }>({ data: null, error: false });
  useEffect(() => {
    if (!expanded || state.data) return;
    const c = new AbortController();
    loadPlayer(s.id, c.signal).then((data) => { setState({ data, error: false }); if (data.team) onTeam(data.team); }).catch(() => { if (!c.signal.aborted) setState({ data: null, error: true }); });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, s.id, state.error]);
  const line = state.data ? seasonLine(state.data) : null;
  const recent = state.data ? (lastN(state.data.last5Games ?? [], 5) as PlayerGame[]) : [];
  return (
    <li className="pw-card" data-testid="pw-card" data-goalie={s.goalie ? "1" : "0"}>
      <div className="pw-top">
        <PlayerIdentityRow s={s} />
      </div>
      <div className="pw-status">
        {!s.onRoster && s.rostersLoaded && <span className="pw-badge" data-testid="pw-noroster">Not on a current roster</span>}
        {moved && <span className="pw-badge" data-testid="pw-moved">Team changed: {moved.from} → {moved.to}</span>}
        {s.onRoster && (s.injury ? <span className="pw-badge out" data-testid="pw-injury">{injuryText(s.injury)}</span> : injuryLoaded ? <span className="pw-badge" data-testid="pw-injury">No injury reported</span> : null)}
        {game && <span className="pw-badge tonight" data-testid="pw-tonight">{tonightLabel(s.team, game)}</span>}
      </div>
      <dl className="pw-stats" aria-label={`${s.name} season stats`}>
        {s.lines.map((l: { k: string; text: string }) => <div key={l.k}><dt>{l.k}</dt><dd>{l.text}</dd></div>)}
      </dl>
      <button type="button" className="pw-more" aria-expanded={expanded} onClick={() => setExpanded((x) => !x)}>{expanded ? "Hide recent performance" : "Recent performance"}<span className="sr-only"> for {s.name}</span></button>
      {expanded && (
        <div role="region" aria-label={`Recent performance, ${s.name}`}>
          {!state.data && !state.error && <p className="pw-note" role="status">Loading recent games…</p>}
          {state.error && <p className="pw-note" role="alert">Recent games are unavailable right now. <button type="button" className="pw-more" onClick={() => setState({ data: null, error: false })}>Retry</button></p>}
          {state.data && s.goalie && line && (
            <dl className="pw-stats"><div><dt>W-L-OTL</dt><dd>{[line.wins, line.losses, line.otLosses].every((v: unknown) => v === null) ? DASH : `${line.wins ?? DASH}-${line.losses ?? DASH}-${line.otLosses ?? DASH}`}</dd></div><div><dt>GAA</dt><dd>{line.gaa === null ? DASH : line.gaa.toFixed(2)}</dd></div><div><dt>SV%</dt><dd>{fmtRatio(line.savePct, "sv")}</dd></div></dl>
          )}
          {state.data && (recent.length ? (
            <ul className="pw-recent" aria-label="Last 5 games played">
              {[...recent].reverse().map((g, i) => (
                <li key={g.gameId ?? i}>
                  <span>{fmtDay(g.gameDate)} {g.homeRoadFlag === "R" ? "at" : "vs"} {g.opponentAbbrev ?? DASH}</span>
                  <span>{s.goalie
                    ? `${g.decision ?? DASH} · ${g.savePctg == null ? DASH : fmtRatio(g.savePctg, "sv")} SV% · ${g.goalsAgainst ?? DASH} GA`
                    : `${g.goals ?? DASH}G ${g.assists ?? DASH}A · ${g.points ?? DASH} PTS · ${g.shots ?? DASH} SOG`}</span>
                </li>
              ))}
            </ul>
          ) : <p className="pw-note">No recent games are listed for this player.</p>)}
        </div>
      )}
    </li>
  );
}

/** Identity row for a summary: the shared identity button plus the follow star (so a player can be unfollowed here). */
function PlayerIdentityRow({ s }: { s: Summary }) {
  return <PlayerIdentity p={{ id: s.id, name: s.name, team: s.team || "", number: s.number, headshot: s.headshot || undefined, position: s.pos }} />;
}
