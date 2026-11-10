/**
 * Iceboard preferences: one versioned, device-local record. Pure (no DOM/storage) so it is unit-tested with node.
 * Stable identifiers: team = NHL abbreviation (src/data/teams.json), player = 7-digit NHL id, game = numeric NHL game id.
 * Everything here is sanitised against allow-lists and caps, so a corrupted or hand-edited value can only fall back to defaults.
 */
export const PREFS_KEY = "iceboard-prefs-v1";
export const LEGACY_TEAMS_KEY = "iceboard-teams";
export const LIMITS = { favorites: 32, players: 100, games: 100 };

const THEMES = ["system", "dark", "light"];
const CONTRASTS = ["system", "more"];
const MOTIONS = ["system", "reduce", "full"];
const TEXT = ["s", "m", "l", "xl"];
const HOUR = ["auto", "12", "24"];
const DENSITY = ["comfortable", "compact"];
const ORDER = ["favorites", "league"];

export const defaultPrefs = () => ({
  version: 1,
  favorites: [],
  onboarded: false,
  players: [],
  games: [],
  display: {
    theme: "system", contrast: "system", motion: "system", textSize: "m", timeZone: "auto", hour12: "auto",
    density: "comfortable", defaultView: "scoreboard", homeOrder: "favorites",
    sections: { myTeams: true, myPlayers: true, worth: true, pulse: true },
  },
  alerts: { enabled: false, start: true, period: false, final: true, schedule: true, scope: { teams: true, players: true, saved: true } },
});

const pick = (v, list, d) => (list.includes(v) ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const str = (v, n = 80) => (typeof v === "string" ? v.slice(0, n) : "");
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
export const validPlayerId = (id) => /^\d{7}$/.test(String(id));
export const validGameId = (id) => Number.isInteger(Number(id)) && Number(id) > 1e9 && Number(id) < 1e11;
const validZone = (z) => {
  if (z === "auto" || z === "ET") return true;
  try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return typeof z === "string"; } catch { return false; }
};

/** Keep only known fields with valid values. `teamIds` is the list of valid team abbreviations. */
export function sanitize(raw, teamIds) {
  const d = defaultPrefs();
  if (!isObj(raw)) return d;
  const ids = new Set(teamIds);
  const seen = new Set();
  const favorites = (Array.isArray(raw.favorites) ? raw.favorites : []).filter((t) => ids.has(t) && !seen.has(t) && seen.add(t)).slice(0, LIMITS.favorites);
  const pseen = new Set();
  const players = (Array.isArray(raw.players) ? raw.players : [])
    .filter((p) => isObj(p) && validPlayerId(p.id) && !pseen.has(String(p.id)) && pseen.add(String(p.id)))
    .slice(0, LIMITS.players)
    .map((p) => ({ id: Number(p.id), name: str(p.name), team: ids.has(p.team) ? p.team : "", pos: str(p.pos, 3), number: Number.isFinite(Number(p.number)) ? Number(p.number) : null, headshot: typeof p.headshot === "string" && /^https:\/\/assets\.nhle\.com\//.test(p.headshot) ? p.headshot : "", at: Number(p.at) || 0 }));
  const gseen = new Set();
  const games = (Array.isArray(raw.games) ? raw.games : [])
    .filter((g) => isObj(g) && validGameId(g.id) && !gseen.has(Number(g.id)) && gseen.add(Number(g.id)))
    .slice(0, LIMITS.games)
    .map((g) => ({ id: Number(g.id), season: Number(g.season) || 0, home: ids.has(g.home) ? g.home : "", away: ids.has(g.away) ? g.away : "", date: /^\d{4}-\d{2}-\d{2}$/.test(g.date) ? g.date : "", at: Number(g.at) || 0 }));
  const x = isObj(raw.display) ? raw.display : {};
  const s = isObj(x.sections) ? x.sections : {};
  const a = isObj(raw.alerts) ? raw.alerts : {};
  const sc = isObj(a.scope) ? a.scope : {};
  return {
    version: 1,
    favorites,
    onboarded: bool(raw.onboarded, false),
    players,
    games,
    display: {
      theme: pick(x.theme, THEMES, d.display.theme), contrast: pick(x.contrast, CONTRASTS, d.display.contrast),
      motion: pick(x.motion, MOTIONS, d.display.motion), textSize: pick(x.textSize, TEXT, d.display.textSize),
      timeZone: validZone(x.timeZone) ? x.timeZone : "auto", hour12: pick(x.hour12, HOUR, "auto"),
      density: pick(x.density, DENSITY, d.display.density), defaultView: str(x.defaultView, 24).replace(/[^a-z]/g, "") || "scoreboard",
      homeOrder: pick(x.homeOrder, ORDER, d.display.homeOrder),
      sections: { myTeams: bool(s.myTeams, true), myPlayers: bool(s.myPlayers, true), worth: bool(s.worth, true), pulse: bool(s.pulse, true) },
    },
    alerts: {
      enabled: bool(a.enabled, false), start: bool(a.start, true), period: bool(a.period, false), final: bool(a.final, true), schedule: bool(a.schedule, true),
      scope: { teams: bool(sc.teams, true), players: bool(sc.players, true), saved: bool(sc.saved, true) },
    },
  };
}

/** Version migrations. v0 = no record yet (optionally the legacy `iceboard-teams` list, which becomes the favorites). */
export function migrate(raw, legacyTeams) {
  if (isObj(raw) && raw.version === 1) return raw;
  if (isObj(raw) && Number(raw.version) > 1) return raw; // written by a newer build: keep what we understand
  const legacy = Array.isArray(legacyTeams) && legacyTeams.length ? { favorites: legacyTeams, onboarded: true } : {};
  return { ...legacy };
}

/** Parse the stored JSON text (and the legacy value) into a safe record. Never throws. */
export function parsePrefs(text, { teamIds, legacy } = {}) {
  let raw = null;
  try { raw = text ? JSON.parse(text) : null; } catch { raw = null; }
  let legacyTeams = null;
  try { legacyTeams = legacy ? JSON.parse(legacy) : null; } catch { legacyTeams = null; }
  return sanitize(migrate(raw, legacyTeams), teamIds ?? []);
}

export const serialize = (prefs) => JSON.stringify(prefs);

/** Pure reducers: each returns a new record. */
export const isFavorite = (p, id) => p.favorites.includes(id);
export const toggleFavorite = (p, id) => ({ ...p, favorites: p.favorites.includes(id) ? p.favorites.filter((t) => t !== id) : [...p.favorites, id].slice(0, LIMITS.favorites) });
export const isFollowing = (p, id) => p.players.some((x) => x.id === Number(id));
export const toggleFollow = (p, ref) =>
  isFollowing(p, ref.id) ? { ...p, players: p.players.filter((x) => x.id !== Number(ref.id)) }
    : { ...p, players: [...p.players, { id: Number(ref.id), name: ref.name ?? "", team: ref.team ?? "", pos: ref.pos ?? "", number: ref.number ?? null, headshot: ref.headshot ?? "", at: ref.at ?? 0 }].slice(0, LIMITS.players) };
export const isSaved = (p, id) => p.games.some((x) => x.id === Number(id));
export const toggleSaved = (p, ref) =>
  isSaved(p, ref.id) ? { ...p, games: p.games.filter((x) => x.id !== Number(ref.id)) }
    : { ...p, games: [...p.games, { id: Number(ref.id), season: ref.season ?? 0, home: ref.home ?? "", away: ref.away ?? "", date: ref.date ?? "", at: ref.at ?? 0 }].slice(0, LIMITS.games) };
