/** Open a game's Game Center from anywhere (search, team and player pages). The Home screen listens for this event, so the opener only needs the NHL game id. */
export const OPEN_GAME_EVENT = "iceboard:open-game";
/** Optional landing spot inside the Game Center: a tab (overview | pbp | stats | players | intel) and a play-by-play event id (e.g. a goal). */
export type OpenGameOptions = { tab?: "overview" | "pbp" | "stats" | "players" | "intel"; event?: number };
export function openGame(id: number | string, opts: OpenGameOptions = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_GAME_EVENT, { detail: { id: Number(id), ...opts } }));
}
