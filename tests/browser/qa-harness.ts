import type { Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

export const SEASON = manifest.current;
/** Collects uncaught page errors and console errors (CSP violations arrive as console errors). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  return errors;
}
/** Errors that are expected when /api/live is mocked to fail (the browser logs the failed request). */
export const benign = (e: string) => /Failed to load resource|503|net::ERR/.test(e);
/** Counts requests per path (query stripped) for requests to the app's own origin. */
export function countRequests(page: Page) {
  const counts = new Map<string, number>();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") return;
    counts.set(u.pathname, (counts.get(u.pathname) ?? 0) + 1);
  });
  return counts;
}
export const etDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
export const liveBody = (games: unknown[] = [], date = etDay(new Date())) => ({ updatedAt: new Date().toISOString(), date, games });
