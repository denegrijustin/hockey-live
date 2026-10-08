import teamIds from "./data/team-ids.json";
import {
  normalizeScoreboard,
  normalizeGameFeed,
  normalizeEdge,
} from "./lib/game-data.mjs";
import teams from "./data/teams.json";
import { parseEspnScoreboard } from "./lib/espn-links.mjs";
import {
  normalizeGame,
  normalizeBoxscore,
  normalizePlayers,
  value,
} from "./lib/normalize.mjs";
const API = "https://api-web.nhle.com/v1";
const ids = new Set(teams.map((t) => t.id));
const tasks = new Map();
const json = (data, status = 200, ttl = 60) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": `public, max-age=${ttl}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
async function get(path) {
  const r = await fetch(`${API}${path}`, {
    signal: AbortSignal.timeout(18000),
  });
  if (!r.ok) throw Error(`NHL returned ${r.status}`);
  return r.json();
}
async function refreshSeason(season, env) {
  let index = 0;
  const schedules = [];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < teams.length) {
        const t = teams[index++];
        const j = await get(`/club-schedule-season/${t.id}/${season}`);
        if (!Array.isArray(j.games)) throw Error("Incomplete NHL schedule");
        schedules.push(...j.games.map(normalizeGame));
      }
    }),
  );
  const data = {
    season,
    updatedAt: new Date().toISOString(),
    source: "NHL schedule feed",
    games: [...new Map(schedules.map((g) => [g.id, g])).values()].sort((a, b) =>
      a.start.localeCompare(b.start),
    ),
  };
  if (data.games.length < 100) throw Error("Incomplete NHL season");
  await env.TEAM_STATS.put(`dashboard-season-${season}`, JSON.stringify(data));
  return data;
}
function background(key, fn, ctx) {
  if (!tasks.has(key)) {
    const p = fn()
      .catch((e) => console.error(key, e.message))
      .finally(() => tasks.delete(key));
    tasks.set(key, p);
    ctx.waitUntil(p);
  }
}
async function staticData(env, request, path) {
  const r = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
  if (!r.ok || !r.headers.get("content-type")?.includes("json")) return null;
  return r.json();
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "GET")
      return json({ error: "Method not allowed" }, 405);
    try {
      let match;
      if (
        url.pathname === "/api/live" ||
        /^\/api\/game\/20\d{8}$/.test(url.pathname)
      ) {
        const cacheKey = new Request(url.origin + url.pathname);
        const hit = await caches.default.match(cacheKey);
        if (hit) return hit;
        const live = url.pathname === "/api/live";
        const data = live
          ? normalizeScoreboard(await get("/score/now"))
          : normalizeGameFeed(
              await get(
                `/gamecenter/${url.pathname.split("/").pop()}/play-by-play`,
              ),
            );
        const response = json(
          data,
          200,
          live || !["OFF", "FINAL"].includes(data.state) ? 15 : 3600,
        );
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
        return response;
      }
      if (
        (match = url.pathname.match(/^\/api\/edge\/(20\d{6})\/([A-Z]{3})$/))
      ) {
        const season = Number(match[1]),
          team = match[2],
          manifest = await staticData(env, request, "/data/manifest.json");
        if (!ids.has(team) || !manifest?.seasons.includes(season))
          return json({ error: "Unknown team or season" }, 400);
        const key = `edge-v3-${season}-${team}`,
          cached = await env.TEAM_STATS.get(key, { type: "json" });
        if (cached && Date.now() - Date.parse(cached.updatedAt) < 300000)
          return json(cached);
        let data;
        try {
          data = normalizeEdge(await get(`/edge/team-detail/${teamIds[team]}/${season}/2`), team, season, season);
        } catch (error) {
          const previous = manifest.seasons.find(s => s < season);
          if (!previous) throw error;
          data = normalizeEdge(await get(`/edge/team-detail/${teamIds[team]}/${previous}/2`), team, previous, season);
        }
        ctx.waitUntil(
          env.TEAM_STATS.put(key, JSON.stringify(data), {
            expirationTtl: 86400,
          }),
        );
        return json(data);
      }

      if ((match = url.pathname.match(/^\/api\/espn\/(20\d{6})$/))) {
        const date = match[1],
          today = new Date()
            .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
            .replace(/-/g, "");
        try {
          const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${date}`,
            { signal: AbortSignal.timeout(10000) },
          );
          if (!r.ok) throw Error(`ESPN returned ${r.status}`);
          return json(
            parseEspnScoreboard(await r.json(), date, teams),
            200,
            date === today ? 60 : 3600,
          );
        } catch {
          // ESPN is optional; clients fall back to the schedule page.
          return json({ date, games: {} }, 200, 60);
        }
      }
      if ((match = url.pathname.match(/^\/api\/season\/(20\d{6})$/))) {
        const season = Number(match[1]),
          manifest = await staticData(env, request, "/data/manifest.json");
        if (!manifest?.seasons.includes(season))
          return json({ error: "Season not supported" }, 400);
        const key = `dashboard-season-${season}`;
        const cached = await env.TEAM_STATS.get(key, { type: "json" });
        const snapshot =
          cached ??
          (await staticData(env, request, `/data/seasons/${season}.json`));
        // While any game is live, refresh far more often than the normal
        // 15-minute window so scores keep pace with play.
        const live = cached?.games?.some((g) =>
          ["LIVE", "CRIT"].includes(g.state),
        );
        const staleAfter = live ? 45000 : 900000;
        if (
          season === manifest.current &&
          (!cached || Date.now() - Date.parse(cached.updatedAt) > staleAfter)
        )
          background(key, () => refreshSeason(season, env), ctx);
        return snapshot
          ? json(snapshot)
          : json(await refreshSeason(season, env));
      }
      if ((match = url.pathname.match(/^\/api\/boxscore\/(20\d{8})$/))) {
        const cacheKey = new Request(url.origin + url.pathname);
        const cached = await caches.default.match(cacheKey);
        if (cached) return cached;
        const data = normalizeBoxscore(
          await get(`/gamecenter/${match[1]}/boxscore`),
        );
        if (!data.players.length)
          return json({ error: "No box score published yet" }, 404, 15);
        const response = json(
          data,
          200,
          ["OFF", "FINAL"].includes(data.state) ? 3600 : 15,
        );
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
        return response;
      }
      if (
        (match = url.pathname.match(/^\/api\/players\/(20\d{6})\/([A-Z]{3})$/))
      ) {
        const season = Number(match[1]),
          team = match[2];
        if (!ids.has(team)) return json({ error: "Unknown team" }, 400);
        const key = `dashboard-players-v3-${season}-${team}`,
          cached = await env.TEAM_STATS.get(key, { type: "json" });
        if (cached && Date.now() - Date.parse(cached.updatedAt) < 300000)
          return json(cached);
        const source = await get(`/club-stats/${team}/${season}/2`);
        if (Number(source.season) !== season) throw Error("Season mismatch");
        const roster = await get(`/roster/${team}/${season}`).catch(() => ({}));
        const jerseys = Object.fromEntries(Object.values(roster).flat().filter(p => p?.id).map(p => [p.id, p.sweaterNumber]));
        const data = normalizePlayers({ ...source, season, gameType: 2 }, team);
        for (const player of [...data.skaters, ...data.goalies]) player.number = jerseys[player.id] ?? null;
        if (data.skaters.length) {
          try {
            const url = new URL('https://api.nhle.com/stats/rest/en/skater/realtime');
            url.search = new URLSearchParams({isAggregate:'false',isGame:'false',limit:'100',cayenneExp:`seasonId=${season} and gameTypeId=2 and teamId=${teamIds[team]}`}).toString();
            const response = await fetch(url, {signal:AbortSignal.timeout(10000)});
            if (response.ok) {
              const report = await response.json();
              for (const p of data.skaters) {
                const row = report.data?.find(r=>r.playerId===p.id && r.seasonId===season && r.teamAbbrevs===team && r.gamesPlayed===p.gp);
                p.hits = row?.hits ?? null;
              }
            }
          } catch { /* Keep core statistics available when the hits report lags. */ }
        }
        ctx.waitUntil(
          env.TEAM_STATS.put(key, JSON.stringify(data), {
            expirationTtl: 86400,
          }),
        );
        return json(data);
      }
      if ((match = url.pathname.match(/^\/api\/player\/(\d{7})$/))) {
        const key = `profile-${match[1]}`;
        const cached = await env.TEAM_STATS.get(key, {type: "json"});
        if (cached && Date.now() - Date.parse(cached.updatedAt) < 300000) return json(cached);
        const raw = await get(`/player/${match[1]}/landing`);
        const data = { id:raw.playerId, name:`${value(raw.firstName)} ${value(raw.lastName)}`, number:raw.sweaterNumber, headshot:raw.headshot, position:raw.position, team:raw.currentTeamAbbrev, birthDate:raw.birthDate, height:raw.heightInInches, weight:raw.weightInPounds, shoots:raw.shootsCatches, seasons:(raw.seasonTotals ?? []).filter(s=>s.leagueAbbrev === 'NHL'), updatedAt:new Date().toISOString() };
        ctx.waitUntil(env.TEAM_STATS.put(key,JSON.stringify(data),{expirationTtl:3600}));
        return json(data);
      }
      // Preserve the original API for existing links and clients.
      if (url.pathname === "/api/team-stats") {
        const team = url.searchParams.get("team"),
          season = url.searchParams.get("season") ?? "20252026";
        if (!ids.has(team)) return json({ error: "Unknown team" }, 400);
        const existing = await env.TEAM_STATS.get(`${team}-${season}`, {
          type: "json",
        });
        return existing
          ? json(existing)
          : json(
              {
                error: "Legacy snapshot unavailable. Use /api/season/{season}.",
              },
              404,
            );
      }
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json(
        { error: "NHL data is temporarily unavailable. Please retry." },
        502,
      );
    }
  },
  async scheduled(event, env, ctx) {
    const r = await env.ASSETS.fetch(
      new Request("https://assets.local/data/manifest.json"),
    );
    const manifest = await r.json();
    ctx.waitUntil(
      refreshSeason(manifest.current, env).catch((e) =>
        console.error("Scheduled refresh failed", e.message),
      ),
    );
  },
};
