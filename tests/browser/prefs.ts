import type { Page } from "@playwright/test";

/** Writes a preference record (iceboard-prefs-v1) before the app loads. `partial` is merged over the defaults (display is merged one level deeper). */
export async function seedPrefs(page: Page, partial: Record<string, any> = {}) {
  await page.addInitScript((p) => {
    try {
      const base = {
        version: 1, favorites: [], onboarded: true, players: [], games: [],
        display: { theme: "system", contrast: "system", motion: "system", textSize: "m", timeZone: "auto", hour12: "auto", density: "comfortable", defaultView: "scoreboard", homeOrder: "favorites", sections: { myTeams: true, myPlayers: true, worth: true, pulse: true } },
        alerts: { enabled: false, start: true, period: false, final: true, schedule: true, scope: { teams: true, players: true, saved: true } },
      };
      const value = { ...base, ...p, display: { ...base.display, ...(p.display ?? {}), sections: { ...base.display.sections, ...(p.display?.sections ?? {}) } } };
      if (!localStorage.getItem("iceboard-prefs-v1")) localStorage.setItem("iceboard-prefs-v1", JSON.stringify(value));
    } catch {}
  }, partial);
}
/** The old built-in default team set, for specs written against it. */
export const OLD_DEFAULT = { favorites: ["EDM", "CHI", "MIN"] };
