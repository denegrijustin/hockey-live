import type { Page } from "@playwright/test";

/** Seeds the device-local preference record before the app loads (what Settings/Teams would have saved). Only when none exists yet, so a reload keeps later changes. */
export async function seedPrefs(page: Page, partial: Record<string, unknown> = {}) {
  await page.addInitScript((p) => {
    try {
      if (!localStorage.getItem("iceboard-prefs-v1")) localStorage.setItem("iceboard-prefs-v1", JSON.stringify({ version: 1, onboarded: true, ...p }));
    } catch {}
  }, partial);
}
/** The old built-in default team set, for specs written against it. */
export const OLD_DEFAULT = { favorites: ["EDM", "CHI", "MIN"] };
