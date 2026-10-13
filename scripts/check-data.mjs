// Gate for the data the app fetches (public/data): every file the manifest names must exist, parse and have its
// basic shape. Hard problems exit 1; staleness is only a warning.
//   node scripts/check-data.mjs
import { existsSync, readFileSync } from "node:fs";

const dir = new URL("../public/data/", import.meta.url);
const problems = [];
const warn = (m) => console.log(`::warning title=Data check::${m}`);
const read = (rel) => {
  const f = new URL(rel, dir);
  if (!existsSync(f)) return void problems.push(`public/data/${rel} is missing`);
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch (e) {
    return void problems.push(`public/data/${rel} is not valid JSON: ${e.message}`);
  }
};

const manifest = read("manifest.json");
if (manifest) {
  if (!Array.isArray(manifest.seasons) || !manifest.seasons.length) problems.push("manifest lists no seasons");
  if (!manifest.seasons?.includes(manifest.current)) problems.push(`manifest.current ${manifest.current} is not in its seasons`);
  const age = (Date.now() - Date.parse(manifest.updatedAt)) / 864e5;
  if (Number.isFinite(age) && age > 10) warn(`manifest was last updated ${Math.round(age)} days ago`);
  for (const season of manifest.seasons ?? []) {
    const s = read(`seasons/${season}.json`);
    if (s && !Array.isArray(s.games)) problems.push(`seasons/${season}.json has no games array`);
    else if (s && season === manifest.current && s.games.length === 0) warn(`the current season (${season}) has no games`);
  }
}
const teams = read("teams.json");
if (teams && !(Array.isArray(teams) ? teams.length : Object.keys(teams.teams ?? teams).length)) problems.push("teams.json is empty");
for (const f of ["imperialism/cells.json", "imperialism/land.json"]) read(f);

// MoneyPuck (NHL+): the saved snapshot for the current season must be whole and attributed. Missing is only a warning
// (the Worker serves live data); a present-but-broken snapshot is an error because the app falls back to it.
if (manifest?.current) {
  const base = `moneypuck/${manifest.current}`;
  if (!existsSync(new URL(`${base}/status.json`, dir))) warn(`no saved MoneyPuck snapshot for ${manifest.current}`);
  else {
    const parts = { summary: read(`${base}/summary.json`), skaters: read(`${base}/skaters.json`), lines: read(`${base}/lines.json`), games: read(`${base}/games.json`) };
    for (const [name, part] of Object.entries(parts)) {
      if (!part) continue;
      if (part.source !== "MoneyPuck.com" || part.seasonId !== manifest.current) problems.push(`${base}/${name}.json is not a ${manifest.current} MoneyPuck snapshot`);
      if (!part.sourceUpdated?.summary && !part.sourceUpdated?.shots) problems.push(`${base}/${name}.json has no MoneyPuck update stamp`);
    }
    if (parts.summary && Object.keys(parts.summary.teams ?? {}).length < 30) problems.push(`${base}/summary.json has fewer than 30 teams`);
    if (parts.summary && !(parts.summary.goalies?.length)) problems.push(`${base}/summary.json has no goalies`);
    if (parts.skaters && !(parts.skaters.skaters?.length)) problems.push(`${base}/skaters.json has no skaters`);
    if (parts.games && !Object.keys(parts.games.games ?? {}).length) warn(`${base}/games.json has no games yet`);
    const stamp = parts.summary?.sourceUpdated?.summary;
    const days = stamp ? (Date.now() - Date.parse(stamp)) / 864e5 : null;
    if (days != null && days > 3) warn(`the saved MoneyPuck snapshot is ${Math.round(days)} days old`);
  }
}

if (problems.length) {
  for (const p of problems) console.log(`::error title=Data check::${p}`);
  process.exit(1);
}
console.log("Data check passed.");
