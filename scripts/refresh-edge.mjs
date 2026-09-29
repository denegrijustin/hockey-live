import { readFile, writeFile, mkdir } from "node:fs/promises";
import { normalizeEdge } from "../src/lib/game-data.mjs";
const manifest = JSON.parse(
    await readFile("public/data/manifest.json", "utf8"),
  ),
  ids = JSON.parse(await readFile("src/data/team-ids.json", "utf8"));
async function get(id, season) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(
      `https://api-web.nhle.com/v1/edge/team-detail/${id}/${season}/2`,
    );
    if (r.status === 404) return null;
    if (r.ok) return r.json();
    if (r.status !== 429) throw Error(`NHL ${r.status}`);
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw Error("NHL rate limit");
}
for (const season of [...manifest.seasons].reverse()) {
  await mkdir(`public/data/edge/${season}`, { recursive: true });
  for (const [team, id] of Object.entries(ids)) {
    const raw = await get(id, season);
    let data;
    if (raw) data = normalizeEdge(raw, team, season, season);
    else {
      const previous = manifest.seasons.find((s) => s < season);
      if (!previous) continue;
      data = {
        ...JSON.parse(
          await readFile(`public/data/edge/${previous}/${team}.json`, "utf8"),
        ),
        requestedSeason: season,
      };
    }
    await writeFile(
      `public/data/edge/${season}/${team}.json`,
      JSON.stringify(data),
    );
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log("EDGE imported", season, Object.keys(ids).length, "teams");
}
