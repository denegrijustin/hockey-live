import { useEffect, useState } from "react";
import { loadPlayers } from "../lib/api";
import { fantasyDefinition, matchRoster, reportedAgo } from "../lib/injuries.mjs";
import { usePlayerProfile, type PlayerRef } from "./player/PlayerContext";
import { InjuryHeadshot } from "./InjuryHeadshot";

/** The fields of one injury row that these shared pieces read (the report's `items`). */
export type InjuryRow = {
  id: string; name: string; pos: string | null; team: string; headshot: string | null;
  status: string; fantasy?: string | null; kind: string; updated?: string | null;
  severity: { level: string; label: string };
  back: { text: string };
};

type RosterPlayer = { id: number; name: string; headshot?: string | null };
const rosters = new Map<string, Promise<RosterPlayer[]>>();
/** A team's roster (id and name), fetched once per team and season and shared by every injury row. Empty when it cannot be loaded. */
function rosterFor(season: number, team: string) {
  const key = `${season}/${team}`;
  let p = rosters.get(key);
  if (!p) {
    p = loadPlayers(season, team).then((d) => [...d.skaters, ...d.goalies].map((s) => ({ id: s.id, name: s.name, headshot: s.headshot ?? null })), () => { rosters.delete(key); return [] as RosterPlayer[]; });
    rosters.set(key, p);
  }
  return p;
}

/**
 * The player a row may link to. ESPN's athlete id is NOT the NHL player id, so the row is matched by normalized name against the team's roster file;
 * only a single exact match links, otherwise null and the name stays plain text (never a wrong person).
 */
export function usePlayerRef(item: Pick<InjuryRow, "name" | "team" | "headshot">, season: number): PlayerRef | null {
  const [ref, setRef] = useState<PlayerRef | null>(null);
  useEffect(() => {
    let live = true;
    setRef(null);
    rosterFor(season, item.team).then((r) => {
      const hit = matchRoster(item.name, r) as RosterPlayer | null;
      if (live && hit) setRef({ id: hit.id, name: hit.name, team: item.team, headshot: hit.headshot ?? item.headshot });
    });
    return () => { live = false; };
  }, [season, item.team, item.name, item.headshot]);
  return ref;
}

/** The player's name: a link to his profile when he is matched, plain text when not. */
export function InjuryPlayerName({ item, season, className = "" }: { item: Pick<InjuryRow, "name" | "team" | "headshot">; season: number; className?: string }) {
  const ref = usePlayerRef(item, season), openPlayer = usePlayerProfile();
  return ref
    ? <button type="button" className={`inj-plink ${className}`} data-testid="inj-player-link" onClick={() => openPlayer(ref)}>{item.name}</button>
    : <b className={className} data-testid="inj-player-text">{item.name}</b>;
}

/** The player's picture, opening his profile when he is matched. The picture is decorative; the name beside it is the accessible control. */
export function InjuryFace({ item, season, size }: { item: Pick<InjuryRow, "name" | "team" | "headshot">; season: number; size: number }) {
  const ref = usePlayerRef(item, season), openPlayer = usePlayerProfile();
  const face = <InjuryHeadshot src={item.headshot} name={item.name} size={size} />;
  return ref ? <button type="button" className="inj-face" tabIndex={-1} aria-hidden="true" onClick={() => openPlayer(ref)}>{face}</button> : face;
}

/** What the provider said, in its own words: the status (Injured Reserve, Day-To-Day, Out, ...) and its fantasy code (IR, IR-NR, IR-LT) with what the code means where that is certain. */
export function InjuryBadge({ item }: { item: Pick<InjuryRow, "status" | "fantasy"> }) {
  const code = item.fantasy && item.fantasy.toLowerCase() !== item.status.toLowerCase() ? item.fantasy : null;
  const def = code ? fantasyDefinition(code) : null;
  return (
    <span className="inj-badges">
      <span className="inj-status" data-testid="inj-status">{item.status}</span>
      {code && <span className="inj-code" data-testid="inj-code" title={def ?? `Provider status code: ${code}`}>{code}</span>}
    </span>
  );
}

/** The app's own estimate, labelled as such. Not shown when there is nothing (no return date, no long-term code) to base it on. */
export function InjuryEstimate({ severity, className = "inj-sev" }: { severity: { level: string; label: string }; className?: string }) {
  if (severity.level === "unknown") return null;
  return <span className={`${className} ${severity.level}`} title="Estimated from the reported return date (and the long-term injured reserve code). This is the app's own estimate, not a status from the report.">Estimate: {severity.label}</span>;
}

/** "Reported 3 days ago", with the exact time on hover. Nothing when the feed gave no timestamp. */
export function InjuryReported({ updated }: { updated?: string | null }) {
  const r = reportedAgo(updated);
  return r ? <small className="inj-reported" data-testid="inj-reported" title={r.title}>{r.text}</small> : null;
}

/** A compact list of injuries for any page (team page, player profile): who, the provider's status, the injury, the reported return date and when it was reported. */
export function InjuryList({ items, season, onNavigate }: { items: InjuryRow[]; season: number; onNavigate?: (view: "injuries") => void }) {
  return (
    <>
      <ul className="tp-inj">
        {items.map((i) => (
          <li key={i.id} data-testid="inj-row">
            <InjuryPlayerName item={i} season={season} />{i.pos ? <small> {i.pos}</small> : null}
            <InjuryBadge item={i} />
            <em>{i.kind} · {i.back.text}</em>
            <InjuryReported updated={i.updated} />
          </li>
        ))}
      </ul>
      {onNavigate && <p className="inj-more"><button type="button" className="inj-plink" onClick={() => onNavigate("injuries")}>League injury report</button></p>}
    </>
  );
}
