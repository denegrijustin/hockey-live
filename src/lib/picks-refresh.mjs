// The Worker's side of the picks: read the odds and the season, update the stored snapshot, and write it back only when something changed.
// Everything it needs comes in as arguments, so the tests can run it without a network or a KV store.
import { SCHEMA, isCurrentSnapshot, parseOdds, updatePicks } from "./picks.mjs";

export const picksKey = (season) => `picks-v1-${season}`;

/** What the API returns before any pick has been logged for a season (or when a stored snapshot is not one this code understands). */
export const emptyPicks = (season) => ({ schema: SCHEMA, season, startedAt: null, updatedAt: null, picks: [] });

/**
 * @param {{ season: number, store: { get(key: string): Promise<any>, put(key: string, value: any): Promise<void> }, loadOdds(): Promise<any>,
 *   loadGames(): Promise<any[]>, loadBaseline?(): Promise<any>, teams: any[], now?: number }} args
 */
export async function refreshPicks({ season, store, loadOdds, loadGames, loadBaseline, teams, now = Date.now() }) {
  const [existing, oddsJson, games] = await Promise.all([store.get(picksKey(season)), loadOdds().catch(() => null), loadGames()]);
  const baseline = (await loadBaseline?.().catch(() => null)) ?? {};
  const { snapshot, added, graded } = updatePicks({ season, games, odds: parseOdds(oddsJson), existing, teams, baseline, now });
  const rebuilt = !isCurrentSnapshot(existing, season);
  if (added || graded || rebuilt) await store.put(picksKey(season), snapshot);
  return { added, graded, rebuilt, total: snapshot.picks.length };
}
