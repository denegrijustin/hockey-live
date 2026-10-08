import { mkdir, readFile, writeFile } from "node:fs/promises";
import { normalizeLeagueMatchups } from "../src/lib/matchup-data.mjs";

const manifest = JSON.parse(await readFile("public/data/manifest.json", "utf8"));
const teamIds = JSON.parse(await readFile("src/data/team-ids.json", "utf8"));
const idToAbbrev = Object.fromEntries(Object.entries(teamIds).map(([abbrev, id]) => [String(id), abbrev]));

async function report(name, season, limit) {
  const url = new URL(`https://api.nhle.com/stats/rest/en/${name}/summary`);
  url.search = new URLSearchParams({
    isAggregate: "false",
    isGame: "false",
    start: "0",
    limit: String(limit),
    cayenneExp: `seasonId=${season} and gameTypeId=2`,
  }).toString();
  const response = await fetch(url, {
    headers: { "User-Agent": "Iceboard/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error(`${name}: NHL returned ${response.status}`);
  return (await response.json()).data;
}

await mkdir("public/data/league-matchups", { recursive: true });
for (const season of manifest.seasons) {
  const [teams, goalies] = await Promise.all([
    report("team", season, 50),
    report("goalie", season, 100),
  ]);
  const snapshot = normalizeLeagueMatchups(teams, goalies, idToAbbrev, season);
  if (snapshot.poolSize < 20) throw Error(`${season}: incomplete pool (${snapshot.poolSize})`);
  await writeFile(`public/data/league-matchups/${season}.json`, JSON.stringify(snapshot));
  console.log(`${season}: ${snapshot.poolSize} teams and ${goalies.length} goalies`);
}
