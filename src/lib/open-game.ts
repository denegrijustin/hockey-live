/** Open a game's Game Center from anywhere (search, team and player pages). The Home screen listens for this event, so the opener only needs the NHL game id. */
export const OPEN_GAME_EVENT = "iceboard:open-game";
export function openGame(id: number | string) {
  window.dispatchEvent(new CustomEvent(OPEN_GAME_EVENT, { detail: { id: Number(id) } }));
}
