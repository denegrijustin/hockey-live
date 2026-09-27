import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import {
  normalizeGame,
  normalizeBoxscore,
  normalizePlayers,
  value,
} from "../src/lib/normalize.mjs";
const api = "https://api-web.nhle.com/v1";
const root = new URL("../public/", import.meta.url);
const save = async (path, data) => {
  const url = new URL(path, root);
  await mkdir(new URL(".", url), { recursive: true });
  await writeFile(url, JSON.stringify(data));
};
async function get(path) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetch(`${api}${path}`, {
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) throw Error(`${path}: ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt === 5) throw e;
      await new Promise((r) =>
        setTimeout(r, Math.min(30000, 3000 * 2 ** attempt)),
      );
    }
  }
}
async function pool(items, fn) {
  let i = 0;
  const results = [];
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (i < items.length) {
        const n = i++;
        results[n] = await fn(items[n]);
        await new Promise((r) => setTimeout(r, 700));
      }
    }),
  );
  return results;
}
const standing = await get("/standings/now");
const colors = { EDM: "#ef7d32", CHI: "#e85d68", MIN: "#60bf9e" };
const teams = standing.standings
  .map((t) => ({
    id: value(t.teamAbbrev),
    name: value(t.teamName),
    short: value(t.teamCommonName),
    city: value(t.placeName),
    division: t.divisionName,
    conference: t.conferenceAbbrev,
    color: colors[value(t.teamAbbrev)] ?? "#65a6db",
    logo: t.teamLogoDark ?? t.teamLogo,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
if (teams.length !== 32)
  throw Error(`Expected 32 current teams, got ${teams.length}`);
await save("data/teams.json", teams);
await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../src/data/teams.json", import.meta.url),
  JSON.stringify(teams, null, 2),
);
const probe = await get("/club-schedule-season/EDM/now");
const current = probe.currentSeason ?? 20262027;
const seasons = [
  current,
  Number(
    `${Number(String(current).slice(0, 4)) - 1}${String(current).slice(0, 4)}`,
  ),
];
const manifest = {
  updatedAt: new Date().toISOString(),
  current,
  seasons,
  source: "NHL public schedule and box-score feeds",
  defaultTeams: ["EDM", "CHI", "MIN"],
};
for (const season of seasons) {
  console.log(`Fetching ${season}: all 32 schedules and player statistics`);
  const schedules = await pool(teams, async (t) => {
    const j = await get(`/club-schedule-season/${t.id}/${season}`);
    if (!Array.isArray(j.games)) throw Error(`Missing schedule ${t.id}`);
    return j.games.map(normalizeGame);
  });
  const games = [
    ...new Map(schedules.flat().map((g) => [g.id, g])).values(),
  ].sort((a, b) => a.start.localeCompare(b.start));
  const snapshot = {
    season,
    updatedAt: new Date().toISOString(),
    source: `${api}/club-schedule-season/{team}/${season}`,
    games,
  };
  await save(`data/seasons/${season}.json`, snapshot);
  await pool(teams, async (t) => {
    let stats = games.some(
      (g) => g.type === 2 && ["OFF", "FINAL"].includes(g.state),
    )
      ? await get(`/club-stats/${t.id}/${season}/2`)
      : { skaters: [], goalies: [] };
    await save(
      `data/players/${season}/${t.id}.json`,
      normalizePlayers({ ...stats, season, gameType: 2 }, t.id),
    );
  });
  const completed = games.filter((g) => ["OFF", "FINAL"].includes(g.state));
  const ids = [
    ...new Set(
      teams.flatMap((t) =>
        completed
          .filter((g) => g.home === t.id || g.away === t.id)
          .slice(-3)
          .map((g) => g.id),
      ),
    ),
  ];
  await pool(ids, async (id) => {
    const dest = new URL(`data/games/${id}.json`, root);
    try {
      await access(dest);
      return;
    } catch {}
    await save(
      `data/games/${id}.json`,
      normalizeBoxscore(await get(`/gamecenter/${id}/boxscore`)),
    );
  });
  console.log(
    `${season}: ${games.length} games; ${ids.length} recent box scores cached`,
  );
}
await pool(teams, async (t) => {
  const r = await fetch(t.logo);
  if (!r.ok) throw Error(`Logo ${t.id}: ${r.status}`);
  await mkdir(new URL("logos/", root), { recursive: true });
  await writeFile(new URL(`logos/${t.id}.svg`, root), await r.text());
});
await save("data/manifest.json", manifest);
console.log("Data snapshot complete", manifest);
