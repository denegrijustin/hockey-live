// Saves the MoneyPuck snapshot into public/data/moneypuck/<seasonId>/ — the copy the app falls back to when the Worker
// or its KV store is unavailable, and what local development reads. Same code path as the Worker's refresh.
//   node scripts/refresh-moneypuck.mjs [--force] [--season 20262027]
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { refreshMoneyPuck } from "../src/lib/moneypuck-refresh.mjs";
import { seasonYear } from "../src/lib/moneypuck.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const manifest = JSON.parse(readFileSync(join(root, "public/data/manifest.json"), "utf8"));
const seasonId = Number(args[args.indexOf("--season") + 1]) || manifest.current;
const year = seasonYear(seasonId);
const teamIds = JSON.parse(readFileSync(join(root, "src/data/teams.json"), "utf8")).map((t) => t.id);
const dir = join(root, "public/data/moneypuck", String(seasonId));

const fileFor = (key) => {
  const part = key.split(":").slice(2).join(":");
  if (part.startsWith("shots:")) return join(dir, "shots", `${part.slice(6)}.json`);
  if (part.startsWith("history:")) return join(dir, "history", `${part.slice(8)}.json`);
  return join(dir, `${part}.json`);
};
const store = {
  async get(key) {
    const file = fileFor(key);
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  },
  async put(key, value) {
    const file = fileFor(key);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, file);
  },
};
const result = await refreshMoneyPuck({ year, teamIds, store, force, onlyIfChanged: true });
if (!result.ok) {
  console.error(`MoneyPuck refresh failed: ${result.error}. The previous snapshot was kept.`);
  process.exit(1);
}
if (result.skipped) { console.log(result.skipped); process.exit(0); }
if (!result.changed) { console.log("MoneyPuck data unchanged since", result.status.fetchedAt); process.exit(0);}
// Drop per-game shot files that are no longer in the recent window.
const keep = new Set((result.status.shotGames ?? []).map((id) => `${id}.json`));
const shotDir = join(dir, "shots");
if (existsSync(shotDir)) for (const f of readdirSync(shotDir)) if (!keep.has(f)) rmSync(join(shotDir, f));
console.log(`MoneyPuck ${seasonId}: ${JSON.stringify(result.status.counts)} · source updated ${JSON.stringify(result.status.sourceUpdated)}`);
