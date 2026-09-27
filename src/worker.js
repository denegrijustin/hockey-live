import teams from "./data/teams.json";
import {
  normalizeGame,
  normalizeBoxscore,
  normalizePlayers,
} from "./lib/normalize.mjs";
const API = "https://api-web.nhle.com/v1";
const ids = new Set(teams.map((t) => t.id));
const tasks = new Map();
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "public, max-age=60",
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
        if (
          season === manifest.current &&
          (!cached || Date.now() - Date.parse(cached.updatedAt) > 900000)
        )
          background(key, () => refreshSeason(season, env), ctx);
        return snapshot
          ? json(snapshot)
          : json(await refreshSeason(season, env));
      }
      if ((match = url.pathname.match(/^\/api\/boxscore\/(20\d{8})$/))) {
        const id = match[1],
          key = `dashboard-box-${id}`,
          cached = await env.TEAM_STATS.get(key, { type: "json" });
        if (
          cached &&
          (["OFF", "FINAL"].includes(cached.state) ||
            Date.now() - Date.parse(cached.updatedAt) < 60000)
        )
          return json(cached);
        const data = normalizeBoxscore(await get(`/gamecenter/${id}/boxscore`));
        if (!data.players.length)
          return json({ error: "No box score published yet" }, 404);
        ctx.waitUntil(
          env.TEAM_STATS.put(key, JSON.stringify(data), {
            expirationTtl: 86400 * 14,
          }),
        );
        return json(data);
      }
      if (
        (match = url.pathname.match(/^\/api\/players\/(20\d{6})\/([A-Z]{3})$/))
      ) {
        const season = Number(match[1]),
          team = match[2];
        if (!ids.has(team)) return json({ error: "Unknown team" }, 400);
        const key = `dashboard-players-${season}-${team}`,
          cached = await env.TEAM_STATS.get(key, { type: "json" });
        if (cached && Date.now() - Date.parse(cached.updatedAt) < 21600000)
          return json(cached);
        const source = await get(`/club-stats/${team}/${season}/2`);
        const data = normalizePlayers({ ...source, season, gameType: 2 }, team);
        ctx.waitUntil(
          env.TEAM_STATS.put(key, JSON.stringify(data), {
            expirationTtl: 86400,
          }),
        );
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
