const TEAMS = [
  "ANA","ARI","BOS","BUF","CGY","CAR","CHI","COL","CBJ","DAL","DET","EDM",
  "FLA","LAK","MIN","MTL","NSH","NJD","NYI","NYR","OTT","PHI","PIT","SJS",
  "STL","TBL","TOR","UTA","VAN","WSH","WPG","VGK","SEA",
];

const CURRENT_SEASON = "20252026";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/team-stats")) {
      return handleTeamStats(url, env);
    }

    // Everything else: serve the built React app
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    for (const team of TEAMS) {
      ctx.waitUntil(refreshTeam(team, CURRENT_SEASON, env));
    }
  },
};

async function handleTeamStats(url, env) {
  const team = url.searchParams.get("team");
  const season = url.searchParams.get("season") || CURRENT_SEASON;

  if (!team) {
    return json({ error: "team query param required, e.g. /api/team-stats?team=CHI" }, 400);
  }

  const key = `${team}-${season}`;
  const cached = await env.TEAM_STATS.get(key, { type: "json" });

  if (!cached) {
    // Cold start: compute on demand so first-ever load isn't empty,
    // then the cron keeps it fresh after that.
    try {
      const computed = await buildTeamStats(team, season);
      await env.TEAM_STATS.put(key, JSON.stringify(computed));
      return json(computed, 200, { "Cache-Control": "public, max-age=3600" });
    } catch (err) {
      return json({ error: `No data yet for ${key}: ${err.message}` }, 404);
    }
  }

  return json(cached, 200, { "Cache-Control": "public, max-age=3600" });
}

async function refreshTeam(team, season, env) {
  try {
    const computed = await buildTeamStats(team, season);
    await env.TEAM_STATS.put(`${team}-${season}`, JSON.stringify(computed));
  } catch (err) {
    console.error(`Failed to refresh ${team}-${season}:`, err.message);
  }
}

async function buildTeamStats(team, season) {
  const games = await fetchTeamGameLog(team, season);
  return computeDerivedStats(games);
}

async function fetchTeamGameLog(team, season) {
  const res = await fetch(
    `https://api-web.nhle.com/v1/club-schedule-season/${team}/${season}`
  );
  if (!res.ok) throw new Error(`schedule fetch failed: ${res.status}`);
  const schedule = await res.json();

  const completed = (schedule.games || []).filter(g => g.gameState === "OFF");

  const boxscores = await Promise.all(
    completed.map(async g => {
      const r = await fetch(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`);
      if (!r.ok) return null;
      return r.json();
    })
  );

  return boxscores.filter(Boolean);
}

function computeDerivedStats(boxscores) {
  const perGame = boxscores.map(b => {
    const home = b.homeTeam;
    const away = b.awayTeam;
    return {
      gameId: b.id,
      date: b.gameDate,
      shotsFor: home?.sog ?? 0,
      shotsAgainst: away?.sog ?? 0,
      goalsFor: home?.score ?? 0,
      goalsAgainst: away?.score ?? 0,
      corsiFor: (home?.sog ?? 0) + (home?.blocks ?? 0) + (home?.missedShots ?? 0),
      xGoalsFor: null, // placeholder — needs play-by-play shot coordinates
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    perGame,
    rolling5: rollingAverage(perGame, 5),
    rolling10: rollingAverage(perGame, 10),
    seasonTotals: sumGames(perGame),
  };
}

function rollingAverage(games, window) {
  return games.map((_, i) => {
    const slice = games.slice(Math.max(0, i - window + 1), i + 1);
    const avg = key => slice.reduce((s, g) => s + (g[key] || 0), 0) / slice.length;
    return {
      date: games[i].date,
      shotsFor: avg("shotsFor"),
      shotsAgainst: avg("shotsAgainst"),
      goalsFor: avg("goalsFor"),
      goalsAgainst: avg("goalsAgainst"),
    };
  });
}

function sumGames(games) {
  return games.reduce(
    (acc, g) => ({
      shotsFor: acc.shotsFor + g.shotsFor,
      shotsAgainst: acc.shotsAgainst + g.shotsAgainst,
      goalsFor: acc.goalsFor + g.goalsFor,
      goalsAgainst: acc.goalsAgainst + g.goalsAgainst,
    }),
    { shotsFor: 0, shotsAgainst: 0, goalsFor: 0, goalsAgainst: 0 }
  );
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
