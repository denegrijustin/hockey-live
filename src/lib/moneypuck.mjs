// MoneyPuck.com data adapter: the one place that knows the MoneyPuck file formats.
//
// Used by the Worker (scheduled and manual refresh), by scripts/refresh-moneypuck.mjs (saved fallback copy) and by the
// tests. Pure functions only: no network, no storage. See moneypuck-refresh.mjs for the fetching.
//
// Only the downloads listed on https://moneypuck.com/data.htm are used. Source values are kept as published (units and
// rounding included); everything we compute is built in nhlplus.mjs and labelled as derived there.

export const MONEYPUCK = {
  name: "MoneyPuck.com",
  url: "https://moneypuck.com/",
  dataUrl: "https://moneypuck.com/data.htm",
  aboutUrl: "https://moneypuck.com/about.htm",
  glossaryUrl: "https://moneypuck.com/glossary.htm",
  dictionaryUrl: "https://peter-tanner.com/moneypuck/downloads/MoneyPuckDataDictionaryForPlayers.csv",
  shotDictionaryUrl: "https://peter-tanner.com/moneypuck/downloads/MoneyPuck_Shot_Data_Dictionary.csv",
};

/** Game situations as MoneyPuck publishes them, seen from the team (or player) the row belongs to. */
export const SITUATIONS = ["all", "5on5", "5on4", "4on5", "other"];

/** MoneyPuck names a season by the year it starts: 2026 is 2026-27, which is NHL season id 20262027. */
export const seasonYear = (seasonId) => Math.floor(Number(seasonId) / 10000);
export const seasonIdOf = (year) => Number(year) * 10000 + Number(year) + 1;

export function sourceUrls(year) {
  const base = `https://moneypuck.com/moneypuck/playerData/seasonSummary/${year}/regular`;
  return {
    teams: `${base}/teams.csv`,
    skaters: `${base}/skaters.csv`,
    goalies: `${base}/goalies.csv`,
    lines: `${base}/lines.csv`,
    shots: `https://peter-tanner.com/moneypuck/downloads/shots_${year}.zip`,
    summaryUpdated: "https://moneypuck.com/moneypuck/playerData/seasonSummary/update_date.txt",
    shotsUpdated: "https://moneypuck.com/moneypuck/playerData/shots/shots_update_time.txt",
  };
}

// ---------- CSV ----------

/** Parses CSV text into an array of objects keyed by the header row. Handles quoted fields and CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    if (quoted) {
      if (c === 34) {
        if (text.charCodeAt(i + 1) === 34) { field += '"'; i++; } else quoted = false;
      } else field += text[i];
    } else if (c === 34) quoted = true;
    else if (c === 44) { row.push(field); field = ""; }
    else if (c === 10 || c === 13) {
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += text[i];
  }
  if (field !== "" || row.length) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = r[i] ?? "";
    return o;
  });
}

/** A source number, or null when the cell is empty or not a finite number. Missing values never become zero. */
export function num(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}
const r = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// ---------- Zip (the shot file is one CSV inside a zip) ----------

/** Reads the first file out of a zip held in memory (deflate or stored). */
export async function unzipFirst(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw Error("Not a zip file");
  const entries = view.getUint16(eocd + 10, true);
  if (!entries) throw Error("Empty zip file");
  let p = view.getUint32(eocd + 16, true);
  if (view.getUint32(p, true) !== 0x02014b50) throw Error("Bad zip directory");
  const method = view.getUint16(p + 10, true);
  const compressed = view.getUint32(p + 20, true);
  const local = view.getUint32(p + 42, true);
  if (view.getUint32(local, true) !== 0x04034b50) throw Error("Bad zip entry");
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = bytes.subarray(start, start + compressed);
  if (method === 0) return new TextDecoder().decode(data);
  if (method !== 8) throw Error(`Unsupported zip method ${method}`);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

// ---------- Validation ----------

export class SourceError extends Error {}

function requireColumns(rows, columns, label) {
  if (!rows.length) throw new SourceError(`${label}: no rows`);
  const have = new Set(Object.keys(rows[0]));
  const missing = columns.filter((c) => !have.has(c));
  if (missing.length) throw new SourceError(`${label}: missing columns ${missing.slice(0, 5).join(", ")}`);
}

function requireSeason(rows, year, label) {
  const bad = rows.find((row) => String(row.season) !== String(year));
  if (bad) throw new SourceError(`${label}: season ${bad.season} in a ${year} file`);
}

function requireKnownTeams(rows, teamIds, label, key = "team") {
  const unknown = [...new Set(rows.map((row) => row[key]))].filter((t) => !teamIds.has(t));
  if (unknown.length) throw new SourceError(`${label}: unknown team code ${unknown.slice(0, 3).join(", ")}`);
}

// ---------- Season files ----------

/**
 * Team season summary: one row per team and situation. Keeps the counts and the times they are measured over so that
 * rates can be built with the right denominator later. toi is seconds, as published.
 */
export function normalizeTeams(rows, year, teamIds) {
  requireColumns(rows, ["team", "season", "situation", "games_played", "iceTime", "xGoalsFor", "xGoalsAgainst", "goalsFor", "goalsAgainst", "shotsOnGoalFor", "shotsOnGoalAgainst", "shotAttemptsFor", "shotAttemptsAgainst"], "teams.csv");
  requireSeason(rows, year, "teams.csv");
  requireKnownTeams(rows, teamIds, "teams.csv");
  const teams = {};
  for (const row of rows) {
    if (!SITUATIONS.includes(row.situation)) continue;
    (teams[row.team] ??= {})[row.situation] = {
      gp: num(row.games_played), toi: num(row.iceTime),
      xGF: num(row.xGoalsFor), xGA: num(row.xGoalsAgainst), GF: num(row.goalsFor), GA: num(row.goalsAgainst),
      SOGF: num(row.shotsOnGoalFor), SOGA: num(row.shotsOnGoalAgainst), CF: num(row.shotAttemptsFor), CA: num(row.shotAttemptsAgainst),
      hdxGF: num(row.highDangerxGoalsFor), hdxGA: num(row.highDangerxGoalsAgainst), hdGF: num(row.highDangerGoalsFor), hdGA: num(row.highDangerGoalsAgainst),
      hdSF: num(row.highDangerShotsFor), hdSA: num(row.highDangerShotsAgainst),
      penF: num(row.penaltiesFor), penA: num(row.penaltiesAgainst), pimF: num(row.penalityMinutesFor), pimA: num(row.penalityMinutesAgainst),
      src: { xGoalsPercentage: num(row.xGoalsPercentage), corsiPercentage: num(row.corsiPercentage), fenwickPercentage: num(row.fenwickPercentage) },
    };
  }
  const complete = Object.values(teams).filter((t) => SITUATIONS.every((s) => t[s]));
  if (complete.length < 30) throw new SourceError(`teams.csv: only ${complete.length} complete teams`);
  return teams;
}

const dangerBlock = (row, prefix) => ({
  SOG: num(row[`${prefix}DangerShots`]), xGA: num(row[`${prefix}DangerxGoals`]), GA: num(row[`${prefix}DangerGoals`]),
});

/** Goalie season summary: one row per goalie and situation, against the shots they faced. */
export function normalizeGoalies(rows, year, teamIds) {
  requireColumns(rows, ["playerId", "name", "team", "season", "situation", "games_played", "icetime", "xGoals", "goals", "ongoal"], "goalies.csv");
  requireSeason(rows, year, "goalies.csv");
  requireKnownTeams(rows, teamIds, "goalies.csv");
  const byKey = new Map();
  for (const row of rows) {
    if (!SITUATIONS.includes(row.situation)) continue;
    const key = `${row.playerId}-${row.team}`;
    const g = byKey.get(key) ?? { id: num(row.playerId), name: row.name, team: row.team, sit: {} };
    g.sit[row.situation] = {
      gp: num(row.games_played), toi: num(row.icetime),
      xGA: num(row.xGoals), GA: num(row.goals), SOG: num(row.ongoal),
      xRebounds: num(row.xRebounds), rebounds: num(row.rebounds),
      ld: dangerBlock(row, "low"), md: dangerBlock(row, "medium"), hd: dangerBlock(row, "high"),
    };
    byKey.set(key, g);
  }
  const goalies = [...byKey.values()].filter((g) => g.sit.all);
  if (!goalies.length) throw new SourceError("goalies.csv: no goalies");
  return goalies.sort((a, b) => (b.sit.all.toi ?? 0) - (a.sit.all.toi ?? 0));
}

/**
 * Skater season summary. Three kinds of numbers are kept apart: individual (the player's own shots and points),
 * on-ice (everything that happened for and against the team while the player was out there), and off-ice.
 */
export function normalizeSkaters(rows, year, teamIds) {
  requireColumns(rows, ["playerId", "name", "team", "season", "position", "situation", "games_played", "icetime", "I_F_goals", "I_F_xGoals", "OnIce_F_xGoals", "OnIce_A_xGoals"], "skaters.csv");
  requireSeason(rows, year, "skaters.csv");
  requireKnownTeams(rows, teamIds, "skaters.csv");
  const byKey = new Map();
  for (const row of rows) {
    if (!SITUATIONS.includes(row.situation)) continue;
    const key = `${row.playerId}-${row.team}`;
    const p = byKey.get(key) ?? { id: num(row.playerId), name: row.name, team: row.team, pos: row.position, sit: {} };
    p.sit[row.situation] = {
      gp: num(row.games_played), toi: num(row.icetime), shifts: num(row.shifts), gameScore: num(row.gameScore),
      ind: {
        G: num(row.I_F_goals), A1: num(row.I_F_primaryAssists), A2: num(row.I_F_secondaryAssists), P: num(row.I_F_points),
        SOG: num(row.I_F_shotsOnGoal), SA: num(row.I_F_shotAttempts), xG: num(row.I_F_xGoals), hits: num(row.I_F_hits),
        take: num(row.I_F_takeaways), give: num(row.I_F_giveaways), pen: num(row.penalties), pim: num(row.I_F_penalityMinutes), penDrawn: num(row.penaltiesDrawn),
      },
      on: {
        xGF: num(row.OnIce_F_xGoals), xGA: num(row.OnIce_A_xGoals), GF: num(row.OnIce_F_goals), GA: num(row.OnIce_A_goals),
        CF: num(row.OnIce_F_shotAttempts), CA: num(row.OnIce_A_shotAttempts),
        src: { xGoalsPercentage: num(row.onIce_xGoalsPercentage), corsiPercentage: num(row.onIce_corsiPercentage) },
      },
      off: { src: { xGoalsPercentage: num(row.offIce_xGoalsPercentage), corsiPercentage: num(row.offIce_corsiPercentage) } },
    };
    byKey.set(key, p);
  }
  const skaters = [...byKey.values()].filter((p) => p.sit.all);
  if (skaters.length < 200) throw new SourceError(`skaters.csv: only ${skaters.length} skaters`);
  return skaters.sort((a, b) => (b.sit.all.toi ?? 0) - (a.sit.all.toi ?? 0));
}

/** A line id is the player ids run together, seven digits each. */
export const linePlayerIds = (lineId) => (String(lineId).match(/\d{7}/g) ?? []).map(Number);

/** Forward lines and defense pairings, 5-on-5 only (the only situation MoneyPuck publishes for them). */
export function normalizeLines(rows, year, teamIds) {
  requireColumns(rows, ["lineId", "name", "team", "season", "position", "situation", "games_played", "icetime", "xGoalsFor", "xGoalsAgainst", "goalsFor", "goalsAgainst"], "lines.csv");
  requireSeason(rows, year, "lines.csv");
  requireKnownTeams(rows, teamIds, "lines.csv");
  const lines = rows.filter((row) => row.situation === "5on5").map((row) => ({
    id: String(row.lineId), name: row.name, team: row.team, type: row.position === "pairing" ? "pairing" : "line",
    players: linePlayerIds(row.lineId), sit: "5on5",
    gp: num(row.games_played), toi: num(row.icetime),
    xGF: num(row.xGoalsFor), xGA: num(row.xGoalsAgainst), GF: num(row.goalsFor), GA: num(row.goalsAgainst),
    CF: num(row.shotAttemptsFor), CA: num(row.shotAttemptsAgainst), SOGF: num(row.shotsOnGoalFor), SOGA: num(row.shotsOnGoalAgainst),
    src: { xGoalsPercentage: num(row.xGoalsPercentage), corsiPercentage: num(row.corsiPercentage) },
  }));
  if (!lines.length) throw new SourceError("lines.csv: no 5-on-5 lines");
  return lines.sort((a, b) => (b.toi ?? 0) - (a.toi ?? 0));
}

// ---------- Shot file (completed games) ----------

/** The situation a shot was taken in, from the shooting team's side: its skaters against the other team's. */
export function shotSituation(own, opp) {
  if (own === 5 && opp === 5) return "5on5";
  if (own === 5 && opp === 4) return "5on4";
  if (own === 4 && opp === 5) return "4on5";
  return "other";
}
const flip = { all: "all", "5on5": "5on5", "5on4": "4on5", "4on5": "5on4", other: "other" };

/** MoneyPuck's game id has no season prefix; the NHL's is the season year in front of it. */
export const nhlGameId = (year, mpGameId) => Number(year) * 1000000 + Number(mpGameId);

/**
 * Turns the season's shot file into (a) one compact record per completed game: team and goalie expected goals by
 * situation, and (b) the shots themselves per game for the chance-flow chart. Shootout attempts are not in the file.
 * These are sums of the shot-level xGoal, so they can differ slightly from the season summary files.
 */
export function buildGames(rows, year, teamIds) {
  requireColumns(rows, ["game_id", "season", "teamCode", "homeTeamCode", "awayTeamCode", "isHomeTeam", "period", "time", "event", "xGoal", "goal", "homeSkatersOnIce", "awaySkatersOnIce"], "shots.csv");
  requireSeason(rows, year, "shots.csv");
  requireKnownTeams(rows, teamIds, "shots.csv", "teamCode");
  const games = new Map();
  for (const row of rows) {
    const id = nhlGameId(year, row.game_id);
    let g = games.get(id);
    if (!g) {
      g = { id, home: row.homeTeamCode, away: row.awayTeamCode, playoff: row.isPlayoffGame === "1" || row.isPlayoffGame === "1.0", periods: 3, teams: {}, goalies: new Map(), shots: [] };
      for (const t of [g.home, g.away]) g.teams[t] = Object.fromEntries(SITUATIONS.map((s) => [s, { xGF: 0, xGA: 0, GF: 0, GA: 0, SOGF: 0, SOGA: 0 }]));
      games.set(id, g);
    }
    const isHome = Number(row.isHomeTeam) === 1;
    const team = row.teamCode, opp = isHome ? g.away : g.home;
    const hs = num(row.homeSkatersOnIce), as = num(row.awaySkatersOnIce);
    if (!g.teams[team] || !g.teams[opp]) throw new SourceError(`shots.csv: ${row.teamCode} is not in game ${row.game_id}`);
    const own = isHome ? hs : as, other = isHome ? as : hs;
    const sit = shotSituation(own, other);
    const xg = num(row.xGoal) ?? 0, goal = Number(row.goal) === 1, onGoal = goal || Number(row.shotWasOnGoal) === 1;
    const period = num(row.period), t = num(row.time);
    if (period == null || t == null) throw new SourceError(`shots.csv: shot without a time in game ${row.game_id}`);
    g.periods = Math.max(g.periods, period);
    for (const s of ["all", sit]) {
      const mine = g.teams[team][s], theirs = g.teams[opp][flip[s]];
      mine.xGF += xg; theirs.xGA += xg;
      if (goal) { mine.GF++; theirs.GA++; }
      if (onGoal) { mine.SOGF++; theirs.SOGA++; }
    }
    const goalieId = num(row.goalieIdForShot);
    if (goalieId) {
      const gk = g.goalies.get(goalieId) ?? { id: goalieId, name: row.goalieNameForShot, team: opp, xGA: 0, GA: 0, SOG: 0 };
      gk.xGA += xg;
      if (goal) gk.GA++;
      if (onGoal) gk.SOG++;
      g.goalies.set(goalieId, gk);
    }
    g.shots.push({
      t, p: period, team, xg: r(xg, 4), g: goal ? 1 : 0, sog: onGoal ? 1 : 0, sit,
      type: row.shotType || null, x: num(row.xCordAdjusted), y: num(row.yCordAdjusted),
      by: num(row.shooterPlayerId) ? { id: num(row.shooterPlayerId), name: row.shooterName } : null,
      gk: goalieId ? { id: goalieId, name: row.goalieNameForShot } : null,
      en: Number(row.shotOnEmptyNet) === 1 ? 1 : 0,
    });
  }
  const log = {}, shots = {};
  for (const [id, g] of games) {
    g.shots.sort((a, b) => a.t - b.t);
    const teams = {};
    for (const [t, sits] of Object.entries(g.teams)) {
      teams[t] = Object.fromEntries(Object.entries(sits).map(([s, v]) => [s, { ...v, xGF: r(v.xGF, 3), xGA: r(v.xGA, 3) }]));
    }
    log[id] = {
      id, home: g.home, away: g.away, periods: g.periods, overtime: g.periods > 3,
      goals: { home: teams[g.home].all.GF, away: teams[g.away].all.GF },
      shots: g.shots.length, teams,
      goalies: [...g.goalies.values()].map((k) => ({ ...k, xGA: r(k.xGA, 3) })),
    };
    shots[id] = g.shots;
  }
  if (!Object.keys(log).length) throw new SourceError("shots.csv: no games");
  return { log, shots };
}

/** The timestamp MoneyPuck publishes next to a download, e.g. "2026-10-13 06:31:35.562837-04:00", as ISO UTC. */
export function parseUpdateStamp(text) {
  const m = String(text ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?([+-]\d{2}:\d{2}|Z)?/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}${m[3] ?? "Z"}`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Stamps every published part the same way, so the app always knows what it is looking at and how old it is. */
export function withMeta(body, { year, fetchedAt, updated, files }) {
  return {
    schema: 1, source: MONEYPUCK.name, sourceUrl: MONEYPUCK.dataUrl,
    season: Number(year), seasonId: seasonIdOf(year), gameType: "regular",
    fetchedAt, sourceUpdated: updated, files, ...body,
  };
}
