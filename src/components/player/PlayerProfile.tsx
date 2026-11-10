import { useCallback, useEffect, useMemo, useState } from "react";
import { loadPlayer, loadPlayers, loadPlayerLog, type PlayerGame, type PlayerProfileData } from "../../lib/api";
import type { PlayerData, PlayerSeason } from "../../types";
import { useFeed } from "../../lib/polling";
import { normName } from "../../lib/injuries.mjs";
import { lastN, seasonLabel, seasonLine, rankOn, teamShare, fmtRatio } from "../../lib/player-stats.mjs";
import { useTeamProfile } from "../TeamProfile";
import teams from "../../data/teams.json";
import { Skeleton } from "../Skeleton";
import type { PlayerRef } from "./PlayerContext";
import { StatGrid, type Stat } from "./StatGrid";
import { RecentGames } from "./RecentGames";

type Line = NonNullable<ReturnType<typeof seasonLine>>;
type InjuryItem = { name: string; team: string; status?: string; kind?: string; severity?: { label?: string } };
const ord = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
const feetInches = (inches?: number) => (inches ? `${Math.floor(inches / 12)}′${inches % 12}″` : null);
const initials = (name: string) => name.split(" ").map((n) => n[0]).slice(0, 2).join("");

/** Everything inside the player dialog: loads the profile, then shows the skater or the goalie layout. */
export default function PlayerProfile({ player, onClose, onLeave }: { player: PlayerRef; onClose: () => void; onLeave: () => void }) {
  const [tries, setTries] = useState(0);
  const [state, setState] = useState<{ data: PlayerProfileData | null; error: string }>({ data: null, error: "" });
  useEffect(() => {
    const c = new AbortController();
    setState({ data: null, error: "" });
    loadPlayer(player.id, c.signal).then((data) => setState({ data, error: "" })).catch((e) => { if (!c.signal.aborted) setState({ data: null, error: e?.message === "Player not found" ? "This player could not be found." : "Player details are unavailable right now." }); });
    return () => c.abort();
  }, [player.id, tries]);
  const { data, error } = state;
  const name = data?.name ?? player.name ?? "Player";
  if (!data)
    return (
      <>
        <h2>{player.name ?? "Player profile"}</h2>
        {error ? (
          <div className="pp-status" role="alert"><p>{error}</p><div className="pp-actions"><button type="button" onClick={() => setTries((t) => t + 1)}>Retry</button><button type="button" onClick={onClose}>Close</button></div></div>
        ) : <Skeleton rows={2} label="Loading player details" />}
      </>
    );
  return <Loaded key={data.updatedAt} data={data} ref0={player} name={name} onLeave={onLeave} />;
}

function Loaded({ data, ref0, name, onLeave }: { data: PlayerProfileData; ref0: PlayerRef; name: string; onLeave: () => void }) {
  const goalie = data.position === "G";
  const line = useMemo(() => seasonLine(data), [data]);
  const season = line?.season ?? null;
  const [roster, setRoster] = useState<PlayerData | null | undefined>(undefined);
  useEffect(() => {
    if (!season || !data.team) { setRoster(null); return; }
    const c = new AbortController();
    loadPlayers(season, data.team, c.signal).then(setRoster).catch(() => { if (!c.signal.aborted) setRoster(null); });
    return () => c.abort();
  }, [season, data.team]);
  const [n, setN] = useState<5 | 10>(5);
  const [log, setLog] = useState<{ games: PlayerGame[] | null; failed: boolean }>({ games: null, failed: false });
  const needLog = season !== null && (n === 10 || !data.last5Games);
  useEffect(() => {
    if (!needLog || !season) return;
    const c = new AbortController();
    loadPlayerLog(data.id ?? ref0.id, season, c.signal).then((l) => setLog({ games: l.games ?? [], failed: false })).catch(() => { if (!c.signal.aborted) setLog({ games: null, failed: true }); });
    return () => c.abort();
  }, [needLog, season, data.id, ref0.id]);
  const games: PlayerGame[] = useMemo(() => {
    const src = n === 10 || !data.last5Games ? (log.games ?? data.last5Games ?? []) : data.last5Games;
    return lastN(src, n);
  }, [n, log.games, data.last5Games]);
  const logPending = needLog && !log.games && !log.failed;
  const me = (roster ? (goalie ? roster.goalies : roster.skaters).find((p) => String(p.id) === String(data.id ?? ref0.id)) : undefined) as PlayerSeason | undefined;
  return (
    <>
      <Header data={data} ref0={ref0} name={name} season={season} goalie={goalie} onLeave={onLeave} />
      {line ? (goalie ? <GoalieStats line={line} /> : <SkaterStats line={line} hits={me?.hits ?? null} />) : <p className="pp-note">Statistics for this season have not been published yet.</p>}
      <RecentGames games={games} goalie={goalie} n={n} setN={setN} pending={logPending} failed={n === 10 && log.failed && !!data.last5Games} unavailable={!games.length && !logPending} onLeave={onLeave} />
      <TeamContext goalie={goalie} roster={roster} id={data.id ?? ref0.id} season={season} team={data.team} />
      <a className="pp-ext" href={`https://www.nhl.com/player/${data.id ?? ref0.id}`} target="_blank" rel="noreferrer">Full NHL profile and career history ↗</a>
    </>
  );
}

function Header({ data, ref0, name, season, goalie, onLeave }: { data: PlayerProfileData; ref0: PlayerRef; name: string; season: number | null; goalie: boolean; onLeave: () => void }) {
  const openTeam = useTeamProfile();
  const [failed, setFailed] = useState(false);
  const src = data.headshot || ref0.headshot || undefined;
  const team = teams.find((t) => t.id === data.team);
  const injuries = useFeed<{ items?: InjuryItem[] }>(season ? `/api/injuries/${season}` : null, 600_000);
  const hurt = injuries.data?.items?.find((i) => normName(i.name) === normName(name) && i.team === data.team);
  const bio = [data.birthDate ? `Born ${data.birthDate}${data.birthCity?.default ? ` in ${data.birthCity.default}` : ""}` : null, feetInches(data.height), data.weight ? `${data.weight} lb` : null].filter(Boolean).join(" · ");
  const jersey = data.number ?? ref0.number;
  return (
    <header className="profile-bio pp-head">
      {src && !failed ? <img src={src} alt="" width="96" height="96" onError={() => setFailed(true)} /> : <span className="pp-initials" aria-hidden="true">{initials(name)}</span>}
      <div className="pp-who">
        <h2>{name}</h2>
        <p>
          {jersey != null ? `#${jersey} · ` : ""}{goalie ? "Goalie" : (data.position ?? "—")}{data.shoots ? ` · ${goalie ? "Catches" : "Shoots"} ${data.shoots}` : ""}
        </p>
        {data.team && (
          <p>
            <button type="button" className="team-link pp-team" onClick={() => { onLeave(); openTeam(data.team!); }} aria-label={`Open ${team?.name ?? data.team} team profile`}>{team?.name ?? data.team}</button>
          </p>
        )}
        {bio && <p className="pp-bio">{bio}</p>}
        <p>
          {hurt ? <span className="pp-badge out" data-testid="player-injury">{[hurt.status, hurt.kind].filter(Boolean).join(" · ")}</span>
            : injuries.data ? <span className="pp-badge" data-testid="player-injury">No injury reported</span> : null}
          {injuries.data && <small className="pp-src"> ESPN injury report{hurt ? "" : "; absence is not a health confirmation"}</small>}
        </p>
      </div>
    </header>
  );
}

function SkaterStats({ line, hits }: { line: Line; hits: number | null }) {
  const stats: Stat[] = [
    { k: "GP", v: line.gp }, { k: "G", v: line.goals }, { k: "A", v: line.assists }, { k: "P", v: line.points },
    { k: "+/−", v: line.plusMinus, signed: true }, { k: "Shots", v: line.shots }, { k: "Shooting %", text: fmtRatio(line.shootingPct), derived: line.shootingPct !== null },
    { k: "TOI / GP", text: line.avgToi ?? "—" }, { k: "PIM", v: line.pim },
    ...(hits !== null ? [{ k: "Hits", v: hits }] : []),
  ];
  return <StatGrid title={seasonLabel(line.season)} stats={stats} note="Season to date, all teams." />;
}
function GoalieStats({ line }: { line: Line }) {
  const stats: Stat[] = [
    { k: "GP", v: line.gp }, { k: "Starts", v: line.starts }, { k: "W", v: line.wins }, { k: "L", v: line.losses }, { k: "OTL", v: line.otLosses },
    { k: "GAA", text: line.gaa === null ? "—" : line.gaa.toFixed(2) }, { k: "SV%", text: fmtRatio(line.savePct, "sv") }, { k: "SO", v: line.shutouts },
    { k: "Saves", v: line.saves, derived: line.saves !== null }, { k: "Shots against", v: line.shotsAgainst },
  ];
  return <StatGrid title={seasonLabel(line.season)} stats={stats} note="Season to date, all teams." />;
}

function TeamContext({ goalie, roster, id, season, team }: { goalie: boolean; roster: PlayerData | null | undefined; id: number | string; season: number | null; team?: string }) {
  if (roster === undefined) return <p className="pp-note" role="status">Loading team context…</p>;
  const label = season ? seasonLabel(season) : "";
  const list = roster ? (goalie ? roster.goalies : roster.skaters) : [];
  if (!roster || !list.some((p) => String(p.id) === String(id)))
    return <section className="pp-ctx" aria-label="Team context"><h3>On the team</h3><p className="pp-note">Team context is unavailable: this player is not in the {team ?? "team"} roster file for this season.</p></section>;
  const rows: { k: string; v: string }[] = [];
  if (goalie) {
    const share = teamShare((list.find((p) => String(p.id) === String(id)) as PlayerSeason).gp, list.reduce((a, p) => a + (p.gp || 0), 0));
    const rank = rankOn(list.filter((p) => p.gp > 0), id, (p: PlayerSeason & { savePct?: number | null }) => p.savePct);
    if (share !== null) rows.push({ k: "Share of team goalie appearances", v: `${Math.round(share * 100)}%` });
    if (rank) rows.push({ k: "SV% rank among team goalies", v: `${ord(rank.rank)} of ${rank.of}` });
  } else {
    const me = list.find((p) => String(p.id) === String(id)) as PlayerSeason;
    const pts = (p: PlayerSeason) => (p.goals ?? 0) + (p.assists ?? 0);
    const g = teamShare(me.goals, list.reduce((a, p) => a + (p.goals || 0), 0)), p = teamShare(pts(me), list.reduce((a, q) => a + pts(q), 0));
    const rp = rankOn(list, id, pts), rg = rankOn(list, id, (q: PlayerSeason) => q.goals);
    if (g !== null) rows.push({ k: "Share of team goals", v: `${Math.round(g * 100)}%` });
    if (p !== null) rows.push({ k: "Share of team points", v: `${Math.round(p * 100)}%` });
    if (rp) rows.push({ k: "Points rank on team", v: `${ord(rp.rank)} of ${rp.of}` });
    if (rg) rows.push({ k: "Goals rank on team", v: `${ord(rg.rank)} of ${rg.of}` });
  }
  return (
    <section className="pp-ctx" aria-label="Team context">
      <h3>On the team <small className="pp-derived">Derived</small></h3>
      {rows.length ? <dl className="pp-ctx-list">{rows.map((r) => <div key={r.k}><dt>{r.k}</dt><dd>{r.v}</dd></div>)}</dl> : <p className="pp-note">No team context is available for this player yet.</p>}
      <p className="pp-note">{label}. Compared with the stints on {team} in the team roster file; players who left the team still count in team totals.</p>
    </section>
  );
}
