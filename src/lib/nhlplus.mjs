// NHL+ calculations. Everything here is DERIVED from MoneyPuck source values (see moneypuck.mjs) and is labelled that way
// in the interface. Rates always use the time (or shot count) that belongs to the situation they describe: power-play
// rates divide by power-play time, penalty-kill rates by penalty-kill time. Missing values stay null, never zero.

export const SIT_LABEL = { all: "All situations", "5on5": "5-on-5", "5on4": "Power play", "4on5": "Penalty kill", other: "Other" };
export const SIT_SHORT = { all: "All", "5on5": "5v5", "5on4": "PP", "4on5": "PK", other: "Other" };
/** The filters offered on the NHL+ tab. "Other" (4-on-4, 3-on-3, empty net) exists in the data but is not offered. */
export const SIT_FILTERS = ["all", "5on5", "5on4", "4on5"];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export const fin = (v) => (isNum(v) ? v : null);

/** Per 60 minutes of the time the count was measured over. toi is in seconds, as MoneyPuck publishes it. */
export const per60 = (count, toiSeconds) => (isNum(count) && isNum(toiSeconds) && toiSeconds > 0 ? (count * 3600) / toiSeconds : null);
/** A share: a / (a + b). Used for expected-goals and shot-attempt share (0..1). */
export const share = (a, b) => (isNum(a) && isNum(b) && a + b > 0 ? a / (a + b) : null);
/** A plain ratio, null when the denominator is missing or zero. */
export const ratio = (a, b) => (isNum(a) && isNum(b) && b > 0 ? a / b : null);
/** Save percentage from goals allowed and shots on goal faced (shots on goal include goals). */
export const svPct = (goalsAgainst, shotsOnGoal) => (isNum(goalsAgainst) && isNum(shotsOnGoal) && shotsOnGoal > 0 ? 1 - goalsAgainst / shotsOnGoal : null);
/** Goals saved above expected: expected goals against minus goals allowed. Positive is better than the model expects. */
export const gsax = (xGA, GA) => (isNum(xGA) && isNum(GA) ? xGA - GA : null);
export const minutes = (toiSeconds) => (isNum(toiSeconds) ? toiSeconds / 60 : null);

/** Derived team numbers for one situation row of the team summary. */
export function teamMetrics(row) {
  if (!row) return null;
  return {
    gp: fin(row.gp), toi: fin(row.toi),
    xGF: fin(row.xGF), xGA: fin(row.xGA), GF: fin(row.GF), GA: fin(row.GA),
    xGF60: per60(row.xGF, row.toi), xGA60: per60(row.xGA, row.toi),
    xGDiff60: isNum(row.xGF) && isNum(row.xGA) ? per60(row.xGF - row.xGA, row.toi) : null,
    xGPct: share(row.xGF, row.xGA),
    GF60: per60(row.GF, row.toi), GA60: per60(row.GA, row.toi),
    shPct: ratio(row.GF, row.SOGF), svPct: svPct(row.GA, row.SOGA),
    CF: fin(row.CF), CA: fin(row.CA), CF60: per60(row.CF, row.toi), CA60: per60(row.CA, row.toi), CFPct: share(row.CF, row.CA),
    SOGF: fin(row.SOGF), SOGA: fin(row.SOGA),
    // Goals minus expected goals, for and against: how far results sit from chance quality over this sample.
    goalsVsXFor: isNum(row.GF) && isNum(row.xGF) ? row.GF - row.xGF : null,
    goalsVsXAgainst: isNum(row.GA) && isNum(row.xGA) ? row.GA - row.xGA : null,
  };
}

/** Every team's derived numbers for a situation: [{ team, ...metrics }]. */
export function teamTable(summary, sit) {
  return Object.entries(summary?.teams ?? {}).map(([team, sits]) => ({ team, ...teamMetrics(sits[sit]) })).filter((r) => r.gp != null);
}

/** 1 = best. Ties share a rank. higherIsBetter is false for things like expected goals against. */
export function rankBy(rows, key, higherIsBetter = true) {
  const values = rows.map((r) => r[key]).filter(isNum);
  const out = {};
  for (const r of rows) {
    const v = r[key];
    if (!isNum(v)) { out[r.team] = null; continue; }
    out[r.team] = 1 + values.filter((x) => (higherIsBetter ? x > v : x < v)).length;
  }
  return out;
}

export function leagueAverage(rows, key) {
  const values = rows.map((r) => r[key]).filter(isNum);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Goalie derived numbers for one situation row. */
export function goalieMetrics(row) {
  if (!row) return null;
  return {
    gp: fin(row.gp), toi: fin(row.toi), xGA: fin(row.xGA), GA: fin(row.GA), SOG: fin(row.SOG),
    gsax: gsax(row.xGA, row.GA),
    gsaxPer60: isNum(row.xGA) && isNum(row.GA) ? per60(row.xGA - row.GA, row.toi) : null,
    svPct: svPct(row.GA, row.SOG),
    xSvPct: svPct(row.xGA, row.SOG),
    xGAPer60: per60(row.xGA, row.toi), GAPer60: per60(row.GA, row.toi), SOGPer60: per60(row.SOG, row.toi),
    // High-danger band (unblocked attempts worth >= 20% each): attempts faced, expected goals, goals allowed, saved above expected.
    hdAtt: row.hd ? fin(row.hd.att) : null, hdxGA: row.hd ? fin(row.hd.xGA) : null, hdGA: row.hd ? fin(row.hd.GA) : null,
    hdGsax: row.hd ? gsax(row.hd.xGA, row.hd.GA) : null,
  };
}

/** A skater's numbers, kept apart by kind: individual, on-ice and team-level context is not mixed. */
export function skaterMetrics(row) {
  if (!row) return null;
  const toi = fin(row.toi);
  return {
    gp: fin(row.gp), toi, toiPerGame: isNum(toi) && row.gp > 0 ? toi / 60 / row.gp : null,
    individual: {
      G: fin(row.ind?.G), A: isNum(row.ind?.A1) && isNum(row.ind?.A2) ? row.ind.A1 + row.ind.A2 : null, P: fin(row.ind?.P),
      SOG: fin(row.ind?.SOG), ixG: fin(row.ind?.xG), ixG60: per60(row.ind?.xG, toi), P60: per60(row.ind?.P, toi), SOG60: per60(row.ind?.SOG, toi),
      goalsVsIxG: isNum(row.ind?.G) && isNum(row.ind?.xG) ? row.ind.G - row.ind.xG : null,
    },
    onIce: {
      xGF: fin(row.on?.xGF), xGA: fin(row.on?.xGA), xGPct: share(row.on?.xGF, row.on?.xGA),
      xGF60: per60(row.on?.xGF, toi), xGA60: per60(row.on?.xGA, toi), CFPct: share(row.on?.CF, row.on?.CA),
      GF: fin(row.on?.GF), GA: fin(row.on?.GA),
    },
  };
}

export function lineMetrics(line) {
  return {
    toi: fin(line.toi), gp: fin(line.gp),
    xGF60: per60(line.xGF, line.toi), xGA60: per60(line.xGA, line.toi), xGPct: share(line.xGF, line.xGA), CFPct: share(line.CF, line.CA),
    GF: fin(line.GF), GA: fin(line.GA), xGF: fin(line.xGF), xGA: fin(line.xGA),
  };
}

// ---------- Game logs (derived from shot-level data) ----------

/** One team's games in order, from the games part: [{ id, opp, home, xGF, xGA, GF, GA, ... }]. */
export function teamGameLog(games, team, sit = "all") {
  const out = [];
  for (const g of Object.values(games?.games ?? {})) {
    const mine = g.teams?.[team]?.[sit];
    if (!mine) continue;
    out.push({ id: g.id, opp: g.home === team ? g.away : g.home, home: g.home === team, overtime: !!g.overtime, ...mine });
  }
  return out.sort((a, b) => a.id - b.id);
}

/**
 * Rolling window over the last n games: summed values, then shares and differences from the sums (not averages of
 * per-game shares). Returns one point per game once n games exist, or per game with a shorter window while n is not reached.
 */
export function rolling(log, n, { partial = false } = {}) {
  const out = [];
  for (let i = 0; i < log.length; i++) {
    const size = Math.min(n, i + 1);
    if (size < n && !partial) continue;
    const w = log.slice(i + 1 - size, i + 1);
    const sum = (k) => w.reduce((t, g) => t + (g[k] ?? 0), 0);
    out.push({
      id: log[i].id, n: size,
      xGF: sum("xGF"), xGA: sum("xGA"), GF: sum("GF"), GA: sum("GA"),
      xGPct: share(sum("xGF"), sum("xGA")),
      goalsVsXFor: sum("GF") - sum("xGF"), goalsVsXAgainst: sum("GA") - sum("xGA"),
    });
  }
  return out;
}

/** A goalie's games, from the per-game goalie records in the games part. */
export function goalieGameLog(games, goalieId) {
  const out = [];
  for (const g of Object.values(games?.games ?? {})) {
    const k = g.goalies?.find((x) => x.id === goalieId);
    if (k) out.push({ id: g.id, team: k.team, xGA: k.xGA, GA: k.GA, SOG: k.SOG, gsax: gsax(k.xGA, k.GA) });
  }
  return out.sort((a, b) => a.id - b.id);
}

// ---------- Chance flow (completed games) ----------

/** Seconds in each regulation period, and the length of overtime periods, for this game type. */
export const periodLength = (period, playoff) => (period <= 3 ? 1200 : playoff ? 1200 : 300);
/** The game-clock length of the whole timeline: 60 minutes, plus overtime actually played. */
export function timelineEnd(shots, { playoff = false, periods = 3 } = {}) {
  const maxPeriod = Math.max(periods, ...shots.map((s) => s.p));
  let end = 3600;
  for (let p = 4; p <= maxPeriod; p++) end += periodLength(p, playoff);
  return end;
}

/** Elapsed game seconds -> "P2 7:30" (period, minutes:seconds into that period); a period's last second is its 20:00. */
export function clockLabel(t, playoff = false) {
  let rest = Math.max(0, Math.round(t)), p = 1;
  while (rest > periodLength(p, playoff) && p < 12) { rest -= periodLength(p, playoff); p++; }
  const m = Math.floor(rest / 60), sec = rest % 60;
  return `${p <= 3 ? `P${p}` : `OT${p - 3}`} ${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Cumulative expected goals for each team across the game: [{ t, home, away }], one step per shot, starting at 0.
 * Optional `through` stops the line at a game-clock second (so a partly played game leaves the rest unfilled).
 */
export function chanceFlow(shots, home, away, { through = Infinity, sit = "all" } = {}) {
  const points = [{ t: 0, home: 0, away: 0 }];
  let h = 0, a = 0;
  for (const s of shots) {
    if (s.t > through) break;
    if (sit !== "all" && s.sit !== sit) continue;
    if (s.team === home) h += s.xg; else if (s.team === away) a += s.xg;
    points.push({ t: s.t, home: h, away: a, shot: s });
  }
  return points;
}

/** Totals by team and situation from a game's shots (used for the situation comparison in the Game Center). */
export function shotTotals(shots, team, sit = "all") {
  const mine = shots.filter((s) => s.team === team && (sit === "all" || s.sit === sit));
  return { xGF: mine.reduce((t, s) => t + s.xg, 0), GF: mine.filter((s) => s.g).length, SOGF: mine.filter((s) => s.sog).length, attempts: mine.length };
}

// ---------- Which data does a game get? ----------

/**
 * pregame            no MoneyPuck game data yet: season profile only
 * live               in progress: MoneyPuck has nothing live (its files update nightly), season profile only
 * final-available    completed and in the latest MoneyPuck download: game analytics enabled
 * final-pending      completed but not in the download yet: shown as pending, never invented
 */
export function gameDataStatus(game, gamesPart) {
  const state = game?.state;
  if (["LIVE", "CRIT"].includes(state)) return "live";
  if (["OFF", "FINAL"].includes(state)) return gamesPart?.games?.[game.id] ? "final-available" : "final-pending";
  return "pregame";
}

/** How old a MoneyPuck stamp is, in hours (null when unknown). */
export const ageHours = (iso, now = Date.now()) => (iso && Number.isFinite(Date.parse(iso)) ? (now - Date.parse(iso)) / 3600000 : null);
/** Nightly data older than 36 hours is stale for display purposes. */
export const STALE_HOURS = 36;
export const isStale = (iso, now = Date.now()) => {
  const h = ageHours(iso, now);
  return h == null ? true : h > STALE_HOURS;
};

// ---------- Matchup helpers ----------

/**
 * Rows for "chance creation against suppression" between two teams: each side's rate of creating chances against the
 * other side's rate of allowing them, in the same situation, per 60 minutes of that situation. Exact values only; the
 * two are shown side by side, never blended into a prediction.
 */
export function matchupPairs(summary, a, b) {
  const m = (team, sit) => teamMetrics(summary?.teams?.[team]?.[sit]);
  const rows = [];
  for (const [x, y] of [[a, b], [b, a]]) {
    rows.push({ id: `${x}-5v5`, label: "5-on-5 chances created vs. allowed", unit: "xG/60", offenseTeam: x, defenseTeam: y, sit: "5on5", offense: m(x, "5on5")?.xGF60 ?? null, defense: m(y, "5on5")?.xGA60 ?? null });
    rows.push({ id: `${x}-special`, label: "Power play vs. penalty kill", unit: "xG/60", offenseTeam: x, defenseTeam: y, sit: "5on4", offense: m(x, "5on4")?.xGF60 ?? null, defense: m(y, "4on5")?.xGA60 ?? null });
  }
  return rows;
}

/** The single most lopsided, sample-backed difference between two teams, as a short factual line (or null). */
export function matchupDetail(summary, a, b, { minToi5v5 = 600 } = {}) {
  const ma = teamMetrics(summary?.teams?.[a]?.["5on5"]), mb = teamMetrics(summary?.teams?.[b]?.["5on5"]);
  const pa = teamMetrics(summary?.teams?.[a]?.["5on4"]), pb = teamMetrics(summary?.teams?.[b]?.["5on4"]);
  const ka = teamMetrics(summary?.teams?.[a]?.["4on5"]), kb = teamMetrics(summary?.teams?.[b]?.["4on5"]);
  const options = [];
  if (ma?.toi >= minToi5v5 && mb?.toi >= minToi5v5) {
    if (isNum(ma.xGPct) && isNum(mb.xGPct)) options.push({ gap: Math.abs(ma.xGPct - mb.xGPct) * 100, text: `${ma.xGPct > mb.xGPct ? a : b} lead 5-on-5 xG share, ${(Math.max(ma.xGPct, mb.xGPct) * 100).toFixed(1)}% to ${(Math.min(ma.xGPct, mb.xGPct) * 100).toFixed(1)}%` });
  }
  const pp = (x, p, k, opp) => p?.xGF60 != null && k?.xGA60 != null && p.toi >= 120 && k.toi >= 120 ? { gap: Math.abs(p.xGF60 - k.xGA60) * 4, text: `${x} power play creates ${p.xGF60.toFixed(1)} xG/60; ${opp} penalty kill allows ${k.xGA60.toFixed(1)}` } : null;
  for (const o of [pp(a, pa, kb, b), pp(b, pb, ka, a)]) if (o) options.push(o);
  options.sort((x, y) => y.gap - x.gap);
  return options[0]?.text ?? null;
}
