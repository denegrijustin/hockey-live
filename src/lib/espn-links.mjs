/** ESPN deep-link helpers. ESPN publishes no public link that starts a given stream; these open the game page (universal link -> ESPN app). */
const pad = (s) => String(s).replace(/-/g, "");
export const espnScheduleUrl = (date) => `https://www.espn.com/nhl/schedule/_/date/${pad(date)}`;
export const espnGameUrl = (id) => `https://www.espn.com/nhl/game/_/gameId/${id}`;
export const ESPN_ABBR = { NJ: "NJD", SJ: "SJS", TB: "TBL", LA: "LAK", UTAH: "UTA", VEG: "VGK", WAS: "WSH" };
export const ESPN_FAMILY = /^(?:ESPN|ABC\b)/i;
export const isEspnFamily = (network) => ESPN_FAMILY.test(String(network).trim());
export function normalizeEspnTeam(abbr, displayName, teams = []) {
  const a = String(abbr ?? "").toUpperCase();
  if (ESPN_ABBR[a]) return ESPN_ABBR[a];
  if (teams.some((t) => t.id === a)) return a;
  if (displayName) {
    const n = String(displayName).toLowerCase();
    const hit = teams.find((t) => t.name.toLowerCase() === n || n.endsWith(t.short.toLowerCase()) && n.startsWith(t.city.toLowerCase()));
    if (hit) return hit.id;
  }
  return a;
}
/** Parses ESPN's scoreboard JSON into { date, games: { "AWAY-HOME": espnId } }. */
export function parseEspnScoreboard(json, date, teams = []) {
  const games = {};
  for (const ev of json?.events ?? []) {
    const comp = ev?.competitions?.[0]?.competitors ?? [];
    const side = (ha) => comp.find((c) => c.homeAway === ha)?.team;
    const away = side("away"), home = side("home");
    if (!away || !home || !ev.id) continue;
    games[`${normalizeEspnTeam(away.abbreviation, away.displayName, teams)}-${normalizeEspnTeam(home.abbreviation, home.displayName, teams)}`] = String(ev.id);
  }
  return { date: pad(date), games };
}
