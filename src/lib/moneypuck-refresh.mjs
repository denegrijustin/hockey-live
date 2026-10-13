// Fetches the MoneyPuck downloads, validates them and publishes a snapshot into a store (Worker KV or a folder).
// Shared by the Worker cron / manual refresh and by scripts/refresh-moneypuck.mjs.
//
// Guarantees:
//  - Bounded: a timeout per request, three attempts with backoff, a size cap, and one refresh at a time.
//  - Validated first: nothing is written until every file has been parsed and checked.
//  - Atomic enough: per-game shots, then the parts, then the status record last, so a reader following the status
//    never sees a part that is missing. A failed refresh writes only a failure note and the last good snapshot stays.
//  - Gentle: MoneyPuck's two tiny update-time files are checked first; unchanged data is not downloaded again.
import {
  MONEYPUCK, SITUATIONS, buildGames, nhlGameId, normalizeGoalies, normalizeLines, normalizeSkaters, normalizeTeams,
  parseCsv, parseUpdateStamp, seasonIdOf, sourceUrls, unzipFirst, withMeta, SourceError,
} from "./moneypuck.mjs";

const UA = "Iceboard/1.0 (+https://nhl.elskatemm.com; non-commercial; data credited to MoneyPuck.com)";
const MAX_BYTES = 40 * 1024 * 1024;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET with a timeout, a size cap and up to `attempts` tries (rate limits and server errors only). */
export async function download(url, { fetchFn = fetch, attempts = 3, timeoutMs = 25000, binary = false, backoffMs = 600 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetchFn(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs) });
      if (response.status === 429 || response.status >= 500) throw Object.assign(Error(`${url}: HTTP ${response.status}`), { retry: true });
      if (!response.ok) throw new SourceError(`${url}: HTTP ${response.status}`);
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > MAX_BYTES) throw new SourceError(`${url}: file is larger than expected`);
      const body = binary ? new Uint8Array(await response.arrayBuffer()) : await response.text();
      if ((binary ? body.length : body.length) > MAX_BYTES) throw new SourceError(`${url}: file is larger than expected`);
      return body;
    } catch (error) {
      last = error;
      const transient = error.retry || error.name === "TimeoutError" || error.name === "TypeError";
      if (!transient || i === attempts - 1) break;
      await sleep(backoffMs * 2 ** i);
    }
  }
  throw last;
}

const keyOf = (year, part) => `mp1:${year}:${part}`;
const etDate = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** What we keep each day for trends. Only taken from real refreshes, so history starts the day we first saw it. */
export function compactHistory(teams, updated, fetchedAt) {
  const out = {};
  for (const [team, sits] of Object.entries(teams)) {
    out[team] = Object.fromEntries(["all", "5on5", "5on4", "4on5"].map((s) => {
      const v = sits[s];
      return [s, { gp: v.gp, toi: v.toi, xGF: v.xGF, xGA: v.xGA, GF: v.GF, GA: v.GA }];
    }));
  }
  return { schema: 1, source: MONEYPUCK.name, date: etDate(updated.summary ?? fetchedAt), sourceUpdated: updated, fetchedAt, teams: out };
}

/**
 * Runs one refresh. `store` is { get(key), put(key, value) }; `lock` is { acquire(): Promise<boolean>, release() }.
 * Resolves with { ok, changed, ... }; never throws for ordinary source problems (they are recorded in the status).
 */
export async function refreshMoneyPuck({ year, teamIds, store, lock, fetchFn = fetch, now = () => new Date(), force = false, keepShotGames = 40, onlyIfChanged = true }) {
  const urls = sourceUrls(year);
  const startedAt = now().toISOString();
  const statusKey = keyOf(year, "status");
  const previous = (await store.get(statusKey)) ?? {};
  if (lock && !(await lock.acquire())) return { ok: true, skipped: "A refresh is already running", status: previous };
  try {
    const [summaryStamp, shotsStamp] = await Promise.all([
      download(urls.summaryUpdated, { fetchFn, attempts: 2, timeoutMs: 8000 }).then(parseUpdateStamp),
      download(urls.shotsUpdated, { fetchFn, attempts: 2, timeoutMs: 8000 }).then(parseUpdateStamp),
    ]);
    const updated = { summary: summaryStamp, shots: shotsStamp };
    if (onlyIfChanged && !force && previous.ok && previous.sourceUpdated?.summary === summaryStamp && previous.sourceUpdated?.shots === shotsStamp) {
      const status = { ...previous, lastCheckedAt: startedAt, lastError: null };
      await store.put(statusKey, status);
      return { ok: true, changed: false, status };
    }
    const [teamsCsv, goaliesCsv, skatersCsv, linesCsv, shotsZip] = await Promise.all([
      download(urls.teams, { fetchFn }), download(urls.goalies, { fetchFn }), download(urls.skaters, { fetchFn }),
      download(urls.lines, { fetchFn }), download(urls.shots, { fetchFn, binary: true, timeoutMs: 40000 }),
    ]);
    const ids = new Set(teamIds);
    const teams = normalizeTeams(parseCsv(teamsCsv), year, ids);
    const goalies = normalizeGoalies(parseCsv(goaliesCsv), year, ids);
    const skaters = normalizeSkaters(parseCsv(skatersCsv), year, ids);
    const lines = normalizeLines(parseCsv(linesCsv), year, ids);
    const { log, shots } = buildGames(parseCsv(await unzipFirst(shotsZip)), year, ids);
    const fetchedAt = now().toISOString();
    const meta = { year, fetchedAt, updated, files: { teams: urls.teams, goalies: urls.goalies, skaters: urls.skaters, lines: urls.lines, shots: urls.shots } };

    // Everything parsed and checked. Publish: shots first (only games we do not already hold), then the parts, then status.
    const gameIds = Object.keys(log).map(Number).sort((a, b) => a - b);
    const have = new Set(previous.shotGames ?? []);
    const recent = gameIds.slice(-keepShotGames);
    for (const id of recent) {
      if (have.has(id) && !force && previous.shotCounts?.[id] === log[id].shots) continue;
      await store.put(keyOf(year, `shots:${id}`), withMeta({ gameId: id, home: log[id].home, away: log[id].away, shots: shots[id] }, meta));
    }
    await store.put(keyOf(year, "skaters"), withMeta({ skaters }, meta));
    await store.put(keyOf(year, "lines"), withMeta({ lines }, meta));
    await store.put(keyOf(year, "games"), withMeta({ games: log, through: gameIds.at(-1) ?? null, derived: "Summed from MoneyPuck shot-level xGoal; shootout attempts are not in the shot file." }, meta));
    await store.put(keyOf(year, "summary"), withMeta({ teams, goalies }, meta));
    const history = compactHistory(teams, updated, fetchedAt);
    await store.put(keyOf(year, `history:${history.date}`), history);
    const dates = [...new Set([...(previous.historyDates ?? []), history.date])].sort();
    const status = {
      schema: 1, source: MONEYPUCK.name, ok: true, changed: true, season: Number(year), seasonId: seasonIdOf(year), sourceUpdated: updated, fetchedAt, lastCheckedAt: fetchedAt, lastError: null,
      counts: { teams: Object.keys(teams).length, goalies: goalies.length, skaters: skaters.length, lines: lines.length, games: gameIds.length },
      shotGames: recent, shotCounts: Object.fromEntries(recent.map((id) => [id, log[id].shots])), historyDates: dates,
    };
    await store.put(statusKey, status);
    return { ok: true, changed: true, status, parts: { teams, goalies, skaters, lines, log, shots, history } };
  } catch (error) {
    const status = { ...previous, ok: previous.ok ?? false, lastCheckedAt: now().toISOString(), lastError: String(error?.message ?? error).slice(0, 300), lastFailedAt: now().toISOString() };
    try { await store.put(statusKey, status); } catch { /* the last good snapshot is untouched either way */ }
    return { ok: false, error: status.lastError, status };
  } finally {
    await lock?.release();
  }
}

export { keyOf, nhlGameId, SITUATIONS };
