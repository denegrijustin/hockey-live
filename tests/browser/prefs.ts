import type { Page } from "@playwright/test";

/** The preference record's key (src/lib/prefs.mjs PREFS_KEY) and the legacy team list it migrates. */
export const PREFS_KEY = "iceboard-prefs-v1";
export const LEGACY_TEAMS_KEY = "iceboard-teams";

/** Mirrors defaultPrefs() in src/lib/prefs.mjs; kept here so specs do not import app code. */
export const defaultPrefsRecord = () => ({
  version: 1,
  favorites: [] as string[],
  myTeam: "",
  onboarded: false,
  players: [] as unknown[],
  games: [] as unknown[],
  display: {
    theme: "system", contrast: "system", motion: "system", textSize: "m", timeZone: "auto", hour12: "auto",
    density: "comfortable", defaultView: "scoreboard", homeOrder: "favorites", logos: "retro",
    sections: { myTeams: true, myPlayers: true, worth: true, pulse: true },
  },
  alerts: { enabled: false, start: true, period: false, final: true, schedule: true, scope: { teams: true, players: true, saved: true } },
});
export type PrefsRecord = ReturnType<typeof defaultPrefsRecord>;
/** A partial record: any nested field may be omitted. */
export type PartialPrefs = { [K in keyof PrefsRecord]?: PrefsRecord[K] extends unknown[] ? PrefsRecord[K] : PrefsRecord[K] extends object ? Record<string, unknown> : PrefsRecord[K] };

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== "object" || Array.isArray(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) out[k] = k in out && out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? merge(out[k], v) : v;
  return out as T;
}
/** The full record a partial one stands for (defaults filled in). */
export const fullPrefs = (partial: PartialPrefs = {}): PrefsRecord => merge(defaultPrefsRecord(), partial);

/** Writes iceboard-prefs-v1 before the page's scripts run, defaults filled in, only when no record exists yet (so a reload keeps the app's own later changes). Call before page.goto. */
export async function seedPrefs(page: Page, partial: PartialPrefs = {}) {
  const record = JSON.stringify(fullPrefs(partial));
  await page.addInitScript(([key, value]) => {
    try { if (localStorage.getItem(key) === null) localStorage.setItem(key, value); } catch { /* storage blocked */ }
  }, [PREFS_KEY, record]);
}

/** Seeds the legacy team list (pre-Phase-4 `iceboard-teams`). */
export async function seedLegacyTeams(page: Page, teams: unknown) {
  await page.addInitScript(([key, value]) => { try { localStorage.setItem(key, value); } catch { /* blocked */ } }, [LEGACY_TEAMS_KEY, JSON.stringify(teams)]);
}

/** Makes localStorage unusable: reading the property throws SecurityError ("security"), or every write throws QuotaExceededError ("quota"). */
export async function blockStorage(page: Page, mode: "security" | "quota" = "security") {
  await page.addInitScript((m) => {
    const err = (name: string) => new DOMException(name === "QuotaExceededError" ? "The quota has been exceeded." : "The operation is insecure.", name);
    if (m === "quota") {
      Storage.prototype.setItem = function () { throw err("QuotaExceededError"); };
    } else {
      Object.defineProperty(window, "localStorage", { configurable: true, get() { throw err("SecurityError"); } });
      Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw err("SecurityError"); } });
    }
  }, mode);
}

export type CorruptKind = "not-json" | "array" | "null" | "wrong-types" | "future-version" | "huge-lists" | "unknown-ids" | "bad-display" | "empty-string";
/** Raw (possibly invalid) values to store under iceboard-prefs-v1. */
export const CORRUPT_VALUES: Record<CorruptKind, string> = {
  "not-json": "{not json",
  array: "[1,2,3]",
  null: "null",
  "wrong-types": JSON.stringify({ version: "x", favorites: "EDM", players: 5, games: { a: 1 }, display: "dark", alerts: [], onboarded: "yes" }),
  "future-version": JSON.stringify({ version: 99, favorites: ["EDM"], newField: { a: 1 } }),
  "huge-lists": JSON.stringify({ version: 1, favorites: Array(500).fill("EDM"), players: Array.from({ length: 500 }, (_, i) => ({ id: 8470000 + i, name: "P" })), games: [] }),
  "unknown-ids": JSON.stringify({ version: 1, favorites: ["ZZZ", "<img src=x onerror=alert(1)>", "EDM"], players: [{ id: "abc" }, { id: 12 }], games: [{ id: 1 }] }),
  "bad-display": JSON.stringify({ version: 1, display: { theme: "neon", textSize: "huge", timeZone: "Mars/Base", defaultView: "<script>", density: 3, sections: { myTeams: "no" } } }),
  "empty-string": "",
};
/** Stores a corrupt record before the page loads. */
export async function corruptPrefs(page: Page, kind: CorruptKind = "not-json") {
  await page.addInitScript(([key, value]) => { try { localStorage.setItem(key, value); } catch { /* blocked */ } }, [PREFS_KEY, CORRUPT_VALUES[kind]]);
}

/** The parsed record currently stored (null when absent or unparsable). */
export async function readPrefs(page: Page): Promise<PrefsRecord | null> {
  return page.evaluate((key) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }, PREFS_KEY);
}

/** The old built-in default team set, for specs written against it. */
export const OLD_DEFAULT = { favorites: ["EDM", "CHI", "MIN"] };
