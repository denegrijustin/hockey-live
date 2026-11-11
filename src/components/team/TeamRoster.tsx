import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerData } from "../../types";
import { loadPlayers } from "../../lib/api";
import { useFeed } from "../../lib/polling";
import { groupRoster } from "../../lib/team-summary.mjs";
import { usePlayerProfile } from "../player/PlayerContext";
import { FollowButton } from "../FollowButton";
import { DASH, fixed } from "./format";

const GROUPS = [["F", "Forwards"], ["D", "Defense"], ["G", "Goalies"]] as const;
const toiText = (v: number | null | undefined) => (v == null || !Number.isFinite(v) || v <= 0 ? DASH : `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}`);

/** The roster, fetched only when the section is opened. Availability comes only from the injury report: no entry means "no injury reported", not "healthy". */
export function TeamRoster({ teamId, season }: { teamId: string; season: number }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ data: PlayerData | null; error: boolean; loading: boolean }>({ data: null, error: false, loading: false });
  const [attempt, setAttempt] = useState(0);
  const openPlayer = usePlayerProfile();
  const loaded = useRef("");
  const { data: inj } = useFeed<any>(open ? `/api/injuries/${season}` : null, 600_000);
  useEffect(() => {
    const key = `${season}/${teamId}/${attempt}`;
    if (!open || loaded.current === key) return; // closing and reopening keeps what was loaded
    const c = new AbortController();
    setState((s) => ({ ...s, loading: true, error: false }));
    loadPlayers(season, teamId, c.signal)
      .then((data) => { loaded.current = key; setState({ data, error: false, loading: false }); })
      .catch(() => { if (!c.signal.aborted) setState({ data: null, error: true, loading: false }); });
    return () => c.abort();
  }, [open, season, teamId, attempt]);
  const injuries = useMemo(() => (inj?.items ?? []).filter((i: any) => i.team === teamId), [inj, teamId]);
  const groups = useMemo(() => (state.data ? groupRoster([...state.data.skaters, ...state.data.goalies], injuries) : null), [state.data, injuries]);
  const { data, loading, error } = state;
  return (
    <details className="tpg-details" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary><h2>Roster</h2><span>Players by position</span></summary>
      {open && (
        <div className="tpg-body">
          {loading && !data && <p role="status" className="rs-none">Loading the roster…</p>}
          {error && <p className="rs-none" role="alert">The roster is unavailable right now. <button type="button" className="tpg-link" onClick={() => setAttempt((n) => n + 1)}>Retry</button></p>}
          {data && groups && !data.skaters.length && !data.goalies.length && <p className="rs-none">No players are listed for this team yet.</p>}
          {data && groups && GROUPS.map(([k, label]) => groups[k as "F"].length > 0 && (
            <table className="tpg-table tpg-roster" key={k}>
              <caption>{label}</caption>
              <thead>{k === "G"
                ? <tr><th scope="col">Player</th><th scope="col">GP</th><th scope="col">Sv%</th></tr>
                : <tr><th scope="col">Player</th><th scope="col">GP</th><th scope="col">G</th><th scope="col">A</th><th scope="col">PTS</th><th scope="col">TOI</th></tr>}</thead>
              <tbody>
                {groups[k as "F"].map((p: any) => (
                  <tr key={p.id}>
                    <th scope="row">
                      <button type="button" className="tpg-player" aria-label={`View ${p.name} details`} onClick={() => openPlayer({ id: p.id, name: p.name, team: teamId, headshot: p.headshot, number: p.number })}>
                        {p.name}<small>{p.position}</small>
                      </button>
                      <FollowButton compact player={{ id: p.id, name: p.name, team: teamId, pos: p.position, number: p.number, headshot: p.headshot }} />
                      {p.injury && <span className="tpg-inj" title={[p.injury.kind, p.injury.back].filter(Boolean).join(" · ")}>{p.injury.label}</span>}
                    </th>
                    <td>{p.gp ?? DASH}</td>
                    {k === "G"
                      ? <td>{p.savePct == null ? DASH : fixed(p.savePct > 1 ? p.savePct / 100 : p.savePct, 3).replace(/^0/, "")}</td>
                      : <><td>{p.goals ?? DASH}</td><td>{p.assists ?? DASH}</td><td>{p.goals != null && p.assists != null ? p.goals + p.assists : DASH}</td><td>{toiText(p.toi)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          {data && <p className="tpg-note">Season to date. A player with no tag has no injury reported; that is not a guarantee he is available.</p>}
        </div>
      )}
    </details>
  );
}
