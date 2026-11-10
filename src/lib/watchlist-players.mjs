// Pure: turns the followed-player list plus the already-loaded roster files into watchlist summaries. No fetching, nothing invented:
// a stat the roster does not carry is null (shown as "—"), a player on no roster is said to be on no roster, and an injury is shown only
// for exactly one name + team match in the injury report (anything else is "No injury reported", which is not a health claim).
import { matchRoster, normName } from "./injuries.mjs";
import { isCalledOff, isLive } from "./game-data.mjs";

export const DASH = "—";
const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const int = (v) => (num(v) === null ? null : Math.round(Number(v)));

/** Roster `toi` is minutes per game as a decimal; "21:03". Null when absent or not positive. */
export function toiText(v) {
  const n = num(v);
  if (n === null || n <= 0) return null;
  let m = Math.floor(n), s = Math.round((n - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}`;
}
/** SV% as ".911" (a value above 1 is read as a percentage). */
export function svText(v) {
  const n = num(v);
  if (n === null) return null;
  return (n > 1 ? n / 100 : n).toFixed(3).replace(/^0/, "");
}
const storable = (h) => typeof h === "string" && /^https:\/\/assets\.nhle\.com\//.test(h);
const signedText = (n) => (n === null ? null : n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** Every roster entry for each player id: Map id -> [{ p, list: "skaters" | "goalies" }]. `rosters` is an array of {skaters, goalies} files. */
export function indexRosters(rosters) {
  const by = new Map();
  for (const r of rosters ?? []) {
    for (const list of ["skaters", "goalies"]) {
      for (const p of r?.[list] ?? []) {
        const id = Number(p?.id);
        if (!id) continue;
        if (!by.has(id)) by.set(id, []);
        by.get(id).push({ p, list });
      }
    }
  }
  return by;
}

/**
 * The entry that describes a player's current team. One entry: that one. Several (a traded player is in both teams' files): the team the profile
 * reports (`currentTeam`) when given; otherwise the stored team's entry (we cannot tell which stint is later, so no trade is claimed).
 */
function pickEntry(entries, stored, currentTeam) {
  if (!entries?.length) return null;
  if (entries.length === 1) return entries[0];
  if (currentTeam) { const e = entries.find((x) => x.p.team === currentTeam); if (e) return e; }
  return entries.find((x) => x.p.team === stored) ?? null;
}

function skaterLines(p) {
  const g = int(p.goals), a = int(p.assists);
  return [
    { k: "GP", v: int(p.gp) },
    { k: "G", v: g },
    { k: "A", v: a },
    { k: "PTS", v: g !== null && a !== null ? g + a : null },
    { k: "+/−", v: signedText(int(p.plusMinus)) },
    { k: "Shots", v: int(p.shots) },
    { k: "TOI", v: toiText(p.toi) },
  ];
}
function goalieLines(p) {
  const sa = int(p.shotsAgainst);
  const saves = int(p.saves);
  const ga = int(p.goalsAgainst) ?? (sa !== null && saves !== null && sa >= saves ? sa - saves : null);
  return [
    { k: "GP", v: int(p.gp) },
    { k: "SV%", v: svText(p.savePct) },
    { k: "Saves", v: saves },
    { k: "GA", v: ga },
  ];
}
const withDash = (lines) => lines.map((l) => ({ k: l.k, text: l.v === null || l.v === undefined ? DASH : String(l.v), missing: l.v === null || l.v === undefined }));

/** Exactly one injury report entry for this name on this team, only when the roster name is unique too; otherwise null (never a guess). */
export function injuryFor(name, team, injuries, rosterOfTeam = []) {
  if (!injuries || !team) return null;
  const sameName = rosterOfTeam.filter((p) => normName(p.name) === normName(name));
  if (sameName.length > 1) return null;
  return matchRoster(name, injuries.filter((i) => i.team === team)) ?? null;
}
export const injuryText = (i) => [i?.status, i?.kind].filter(Boolean).join(" · ") || "Listed on the injury report";

/**
 * One summary per followed player (same order as the input).
 *  followed: prefs.players  rosters: roster files  injuries: report items or null (not loaded)  opts.currentTeams: { [id]: abbr } from loaded profiles.
 * Fields: id, name, headshot, number, pos, goalie, team (current), storedTeam, onRoster, changed ({from,to} when the roster team differs from the stored one),
 * lines [{k,text,missing}], injury (item | null), injuryKnown (the report was loaded), update ({id,team,pos,number,headshot} to store when the snapshot is stale, else null).
 */
export function followedSummaries(followed, rosters, injuries = null, opts = {}) {
  const index = indexRosters(rosters);
  const byTeam = new Map();
  for (const r of rosters ?? []) for (const list of ["skaters", "goalies"]) for (const p of r?.[list] ?? []) {
    if (!byTeam.has(p.team)) byTeam.set(p.team, []);
    byTeam.get(p.team).push(p);
  }
  return (followed ?? []).map((f) => {
    const id = Number(f.id);
    const hit = pickEntry(index.get(id), f.team, opts.currentTeams?.[id]);
    const base = { id, name: f.name || (hit?.p.name ?? ""), storedTeam: f.team || "" };
    if (!hit) {
      const goalie = f.pos === "G";
      return { ...base, headshot: f.headshot || "", number: f.number || null, pos: f.pos || "", goalie, team: f.team || "", onRoster: false, rostersLoaded: (rosters ?? []).length > 0, changed: null, lines: withDash(goalie ? goalieLines({}) : skaterLines({})), injury: null, injuryKnown: !!injuries, update: null };
    }
    const { p, list } = hit;
    const goalie = list === "goalies";
    const team = p.team || f.team || "";
    const changed = f.team && team && f.team !== team ? { from: f.team, to: team } : null;
    const number = p.number ?? (f.number || null), pos = p.position || f.pos || "";
    // The store only keeps NHL-hosted photos, so only those count as a newer snapshot (anything else would re-trigger forever).
    const headshot = storable(p.headshot) ? p.headshot : f.headshot || p.headshot || "";
    const stale = changed || (pos && pos !== f.pos) || (number !== null && number !== (f.number || null)) || (storable(p.headshot) && p.headshot !== f.headshot);
    return {
      ...base, name: p.name || base.name, headshot, number, pos, goalie, team, onRoster: true, rostersLoaded: true, changed,
      lines: withDash(goalie ? goalieLines(p) : skaterLines(p)),
      injury: injuryFor(p.name || f.name, team, injuries, byTeam.get(team) ?? []),
      injuryKnown: !!injuries,
      update: stale ? { id, team, pos, number, headshot } : null,
    };
  });
}

/** Skaters and goalies as two lists, each sorted by name. */
export function splitSummaries(list) {
  const by = (a, b) => String(a.name).localeCompare(String(b.name));
  return { skaters: list.filter((s) => !s.goalie).sort(by), goalies: list.filter((s) => s.goalie).sort(by) };
}

/** Today's not-yet-finished game for a team in the loaded schedule, or null. `today` is the Eastern calendar day (YYYY-MM-DD). Postponed games do not count. */
export function playsTonight(team, games, today) {
  if (!team || !today) return null;
  return (games ?? []).find((g) => g.date === today && (g.home === team || g.away === team) && g.state !== "OFF" && g.state !== "FINAL" && !isCalledOff(g)) ?? null;
}
export const tonightLabel = (team, game) => {
  if (!game) return "";
  const opp = game.home === team ? game.away : game.home;
  const where = game.home === team ? "vs" : "at";
  return isLive(game) ? `Playing now ${where} ${opp}` : `Plays tonight ${where} ${opp}`;
};

/** Apply `update` snapshots (team/pos/number/headshot) to matching followed players; returns the same array when nothing changes. */
export function applySnapshots(players, updates) {
  const by = new Map(updates.map((u) => [u.id, u]));
  let changed = false;
  const next = players.map((p) => {
    const u = by.get(Number(p.id));
    if (!u) return p;
    const n = { ...p, team: u.team || p.team, pos: u.pos || p.pos, number: u.number ?? p.number, headshot: u.headshot || p.headshot };
    if (n.team !== p.team || n.pos !== p.pos || n.number !== p.number || n.headshot !== p.headshot) { changed = true; return n; }
    return p;
  });
  return changed ? next : players;
}
