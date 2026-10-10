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

if (problems.length) {
  for (const p of problems) console.log(`::error title=Data check::${p}`);
  process.exit(1);
}
console.log("Data check passed.");
