/** Transparent descriptive models. No proprietary WAR or calibrated probabilities. */
import { projectGame } from "./projection.mjs";
export const finished = (g) => ["OFF", "FINAL"].includes(g.state);
export const signed = (n, digits = 0) =>
  `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
const gamesBefore = (games, game) =>
  games.filter(
    (candidate) =>
      candidate.id !== game.id &&
      candidate.season === game.season &&
      candidate.type === game.type &&
      finished(candidate) &&
      candidate.start < game.start,
  );
export function recordBeforeGame(games, game, team) {
  const record = { w: 0, l: 0, ot: 0 };
  for (const result of gamesBefore(games, game)) {
    if (result.home !== team && result.away !== team) continue;
    const goalsFor = result.home === team ? result.homeScore : result.awayScore;
    const goalsAgainst = result.home === team ? result.awayScore : result.homeScore;
    if (goalsFor == null || goalsAgainst == null || goalsFor === goalsAgainst)
      continue;
    if (goalsFor > goalsAgainst) record.w++;
    else if (result.end === "OT" || result.end === "SO") record.ot++;
    else record.l++;
  }
  return record;
}
export function seasonSeriesBeforeGame(games, game) {
  const series = { away: 0, home: 0, played: 0 };
  for (const result of gamesBefore(games, game)) {
    if (
      !(
        (result.home === game.home && result.away === game.away) ||
        (result.home === game.away && result.away === game.home)
      )
    )
      continue;
    if (
      result.homeScore == null ||
      result.awayScore == null ||
      result.homeScore === result.awayScore
    )
      continue;
    const winner =
      result.homeScore > result.awayScore ? result.home : result.away;
    series[winner === game.away ? "away" : "home"]++;
    series.played++;
  }
  return series;
}
export function blankStandings(teams) {
  return Object.fromEntries(
    teams.map((t) => [
      t.id,
      {
        id: t.id,
        gp: 0,
        w: 0,
        l: 0,
        ot: 0,
        pts: 0,
        gf: 0,
        ga: 0,
        rw: 0,
        results: [],
      },
    ]),
  );
}
export function applyResult(table, g) {
  if (
    g.type !== 2 ||
    !finished(g) ||
    g.homeScore == null ||
    g.awayScore == null ||
    g.homeScore === g.awayScore
  )
    return;
  const h = table[g.home],
    a = table[g.away];
  if (!h || !a) return;
  for (const [t, forGoals, against] of [
    [h, g.homeScore, g.awayScore],
    [a, g.awayScore, g.homeScore],
  ]) {
    t.gp++;
    t.gf += forGoals;
    t.ga += against;
    let outcome;
    if (forGoals > against) {
      t.w++;
      t.pts += 2;
      if (g.end === "REG") t.rw++;
      outcome = "W";
    } else if (g.end === "OT" || g.end === "SO") {
      t.ot++;
      t.pts++;
      outcome = "OT";
    } else {
      t.l++;
      outcome = "L";
    }
    t.results.push({
      date: g.date,
      pts: outcome === "W" ? 2 : outcome === "OT" ? 1 : 0,
      gf: forGoals,
      ga: against,
      outcome,
    });
  }
}
const clone = (table) =>
  Object.fromEntries(
    Object.entries(table).map(([k, v]) => [
      k,
      { ...v, results: [...v.results] },
    ]),
  );
export function pointsRank(table, id, ids = Object.keys(table)) {
  const pts = table[id].pts;
  return {
    rank: 1 + ids.filter((k) => table[k].pts > pts).length,
    tied: ids.some((k) => k !== id && table[k].pts === pts),
  };
}
export function entryLine(table, id, teams) {
  const own = teams.find((t) => t.id === id);
  const order = (a, b) =>
    table[b.id].pts - table[a.id].pts ||
    table[b.id].rw - table[a.id].rw ||
    a.id.localeCompare(b.id);
  const division = teams.filter((t) => t.division === own.division).sort(order);
  const conf = teams.filter((t) => t.conference === own.conference);
  const automatic = new Set(
    [...new Set(conf.map((t) => t.division))].flatMap((d) =>
      conf
        .filter((t) => t.division === d)
        .sort(order)
        .slice(0, 3)
        .map((t) => t.id),
    ),
  );
  const wild = conf.filter((t) => !automatic.has(t.id)).sort(order);
  return Math.min(table[division[2].id].pts, table[wild[1].id].pts);
}
export function scenario(table, g, id, outcome, teams) {
  const next = clone(table),
    opp = g.home === id ? g.away : g.home;
  const points = outcome === "win" ? 2 : outcome === "otl" ? 1 : 0;
  next[id].pts += points;
  next[opp].pts += outcome === "win" ? 0 : 2;
  next[id].gp++;
  next[opp].gp++;
  const conf = teams
    .filter((t) => t.conference === teams.find((t) => t.id === id).conference)
    .map((t) => t.id);
  return {
    points: next[id].pts,
    gain: points,
    rank: pointsRank(next, id, conf),
    gap: next[id].pts - entryLine(next, id, teams),
    opponentGain: outcome === "win" ? 0 : 2,
  };
}
export function importance(g, table, teams, games) {
  if (g.type === 1)
    return {
      score: 0,
      reasons: ["Preseason: no standings points at stake."],
      kind: "Preseason",
    };
  if (g.type === 3) {
    const series = games.filter(
      (x) =>
        x.type === 3 &&
        finished(x) &&
        x.date < g.date &&
        ((x.home === g.home && x.away === g.away) ||
          (x.away === g.home && x.home === g.away)),
    );
    const wins = (id) =>
      series.filter((x) =>
        x.home === id ? x.homeScore > x.awayScore : x.awayScore > x.homeScore,
      ).length;
    const elimination = wins(g.home) >= 3 || wins(g.away) >= 3;
    return {
      score: Math.min(100, 72 + (g.round ?? 1) * 4 + (elimination ? 12 : 0)),
      reasons: [
        `Playoff round ${g.round ?? "—"}: series advancement at stake.`,
        elimination
          ? "An elimination opportunity based on completed games."
          : "Every win moves a team toward four in the series.",
      ],
      kind: "Playoff stakes",
    };
  }
  const home = teams.find((t) => t.id === g.home),
    away = teams.find((t) => t.id === g.away);
  const sameDivision = home.division === away.division,
    sameConference = home.conference === away.conference;
  const seasonGames = (id) =>
    games.filter((x) => x.type === 2 && (x.home === id || x.away === id))
      .length;
  const progress = (id) =>
    games.filter(
      (x) =>
        x.type === 2 && x.date < g.date && (x.home === id || x.away === id),
    ).length / Math.max(1, seasonGames(id));
  const urgency = Math.max(progress(g.home), progress(g.away));
  const bubble = (id) =>
    table[id].gp >= 10
      ? Math.max(
          0,
          1 - Math.abs(table[id].pts - entryLine(table, id, teams)) / 14,
        )
      : 0;
  const pressure = Math.max(bubble(g.home), bubble(g.away));
  const score = Math.round(
    22 +
      (sameConference ? 12 : 0) +
      (sameDivision ? 12 : 0) +
      26 * urgency +
      28 * pressure,
  );
  const reasons = [
    sameDivision
      ? "Division matchup: points gained also deny a nearby rival."
      : sameConference
        ? "Conference matchup: both teams compete for the same playoff places."
        : "Cross-conference matchup: two standings points, less direct competition.",
  ];
  reasons.push(
    `${Math.round(urgency * 100)}% of the scheduled season precedes this game.`,
  );
  reasons.push(
    pressure > 0
      ? `Playoff-line pressure contributes ${Math.round(28 * pressure)} rating points.`
      : "No established close playoff-line pressure in the available standings.",
  );
  return {
    score: Math.min(100, score),
    reasons,
    kind: finished(g) ? "Pregame stakes" : "Outlook",
  };
}
export function analyzeSeason(games, teams) {
  const ordered = [...games].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );
  const table = blankStandings(teams);
  /** @type {Record<number, any>} */ const before = {};
  /** @type {Record<number, any>} */ const analysis = {};
  for (const date of [...new Set(ordered.map((g) => g.date))]) {
    const day = ordered.filter((g) => g.date === date);
    const snapshot = clone(table);
    for (const g of day)
      if (finished(g)) {
        before[g.id] = snapshot;
        analysis[g.id] = importance(g, snapshot, teams, games);
      }
    for (const g of day) applyResult(table, g);
  }
  for (const g of games)
    if (!finished(g)) {
      before[g.id] = table;
      analysis[g.id] = importance(g, table, teams, games);
    }
  for (const type of [1, 2, 3])
    for (const past of [true, false]) {
      const cohort = games
        .filter((g) => g.type === type && finished(g) === past)
        .sort(
          (a, b) => analysis[b.id].score - analysis[a.id].score || a.id - b.id,
        );
      for (const g of cohort) {
        const score = analysis[g.id].score;
        analysis[g.id] = {
          ...analysis[g.id],
          rank:
            type === 1
              ? null
              : 1 + cohort.filter((x) => analysis[x.id].score > score).length,
          tied: cohort.filter((x) => analysis[x.id].score === score).length > 1,
          total: cohort.length,
        };
      }
    }
  return { table, before, analysis };
}
export function skaterImpact(p) {
  // A box-score index, not goals or wins above replacement. Deliberately auditable.
  const n = (k) => Number(p[k] ?? 0);
  return (
    n("goals") +
    0.7 * n("assists") +
    0.1 * n("shots") +
    0.25 * n("plusMinus") -
    0.1 * n("pim")
  );
}
export function goalieImpact(p) {
  if (p.saves == null || p.shotsAgainst == null || p.shotsAgainst === 0)
    return null;
  return p.saves - 0.9 * p.shotsAgainst;
}
export function rollingSeries(team, metric, window) {
  return team.results.map((g, i) => {
    const slice = team.results.slice(Math.max(0, i - window + 1), i + 1);
    return {
      date: g.date,
      value:
        slice.reduce(
          (s, x) =>
            s +
            (metric === "points"
              ? x.pts / 2
              : metric === "difference"
                ? x.gf - x.ga
                : x[metric]),
          0,
        ) / slice.length,
    };
  });
}

const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
function playoffField(table, teams) {
  const qualified = new Set();
  for (const conference of [...new Set(teams.map((team) => team.conference))]) {
    const conferenceTeams = teams.filter((team) => team.conference === conference);
    const automatic = new Set();
    for (const division of [...new Set(conferenceTeams.map((team) => team.division))]) {
      conferenceTeams
        .filter((team) => team.division === division)
        .sort((a, b) => table[b.id].pts - table[a.id].pts || table[b.id].rw - table[a.id].rw)
        .slice(0, 3)
        .forEach((team) => automatic.add(team.id));
    }
    automatic.forEach((id) => qualified.add(id));
    conferenceTeams
      .filter((team) => !automatic.has(team.id))
      .sort((a, b) => table[b.id].pts - table[a.id].pts || table[b.id].rw - table[a.id].rw)
      .slice(0, 2)
      .forEach((team) => qualified.add(team.id));
  }
  return qualified;
}

/** Heuristic playoff likelihood; these percentages are not calibrated odds. */
export function playoffChances(table, games, teams, baseline = {}, options = {}) {
  const includeLive = options.includeLive !== false;
  const rows = Object.fromEntries(
    teams.map((team) => {
      const current = table[team.id] ?? { gp: 0, pts: 0, rw: 0 };
      const total = games.filter(
        (game) => game.type === 2 && (game.home === team.id || game.away === team.id),
      ).length;
      const remaining = Math.max(0, total - current.gp);
      const prior = baseline?.[team.id];
      const priorPct = prior?.gp ? prior.pts / (2 * prior.gp) : 0.55;
      const rate = (current.pts + 40 * priorPct) / (2 * (current.gp + 20));
      return [team.id, { projected: current.pts + remaining * 2 * rate, remaining, rate, chance: 50 }];
    }),
  );

  if (includeLive) {
    for (const game of games.filter(
      (candidate) => candidate.type === 2 && ["LIVE", "CRIT"].includes(candidate.state),
    )) {
      const projection = projectGame(game, table, baseline);
      if (!projection) continue;
      for (const [team, winChance] of [
        [game.home, projection.homeWin],
        [game.away, 1 - projection.homeWin],
      ]) {
        const row = rows[team];
        if (!row) continue;
        // Approximate the chance of one standings point in an OT/SO loss.
        const liveExpected = 2 * winChance + 0.18 * (1 - winChance);
        row.projected += liveExpected - 2 * row.rate;
      }
    }
  }

  const projectedTable = Object.fromEntries(
    teams.map((team) => [team.id, {
      ...(table[team.id] ?? {}),
      pts: rows[team.id].projected,
      rw: table[team.id]?.rw ?? 0,
    }]),
  );
  const complete = Object.values(rows).every((row) => row.remaining === 0);
  const qualified = complete ? playoffField(projectedTable, teams) : null;
  for (const team of teams) {
    const row = rows[team.id];
    if (qualified) {
      row.chance = qualified.has(team.id) ? 99 : 1;
      continue;
    }
    const line = entryLine(projectedTable, team.id, teams);
    const uncertainty = Math.max(2.5, Math.sqrt(row.remaining) * 0.9);
    row.chance = clamp(100 / (1 + Math.exp(-(row.projected - line) / uncertainty)), 1, 99);
  }
  return rows;
}

export function playoffTrend(games, teams, baseline = {}) {
  const table = blankStandings(teams);
  const series = Object.fromEntries(teams.map((team) => [team.id, []]));
  const start = playoffChances(table, games, teams, baseline, { includeLive: false });
  for (const team of teams)
    series[team.id].push({ date: "Season start", game: 0, value: start[team.id].chance });

  const completed = games
    .filter((game) => game.type === 2 && finished(game))
    .sort((a, b) => a.start.localeCompare(b.start));
  for (const date of [...new Set(completed.map((game) => game.date))]) {
    const day = completed.filter((game) => game.date === date);
    const played = new Set();
    for (const game of day) {
      applyResult(table, game);
      played.add(game.home);
      played.add(game.away);
    }
    const chances = playoffChances(table, games, teams, baseline, { includeLive: false });
    for (const team of played)
      series[team].push({ date, game: table[team].gp, value: chances[team].chance });
  }

  const liveTeams = new Set(
    games
      .filter((game) => game.type === 2 && ["LIVE", "CRIT"].includes(game.state))
      .flatMap((game) => [game.home, game.away]),
  );
  if (liveTeams.size) {
    const live = playoffChances(table, games, teams, baseline);
    for (const team of liveTeams)
      series[team].push({ date: "Live", game: table[team].gp + 1, value: live[team].chance, live: true });
  }
  return series;
}
