import { expect, test } from "@playwright/test";
import { DATA_NOW } from "./clock";
import { liveBody } from "./qa-harness";

// While the tab is hidden nothing polls; when it is shown again the stale feeds catch up with one request each.
test("no /api/live polling while hidden, one catch-up fetch on show", async ({ page }) => {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    (window as unknown as { __setHidden: (v: boolean) => void }).__setHidden = (v) => { hidden = v; document.dispatchEvent(new Event("visibilitychange")); };
  });
  await page.clock.install({ time: DATA_NOW });
  const live: number[] = [];
  await page.route("**/api/live", (route) => { live.push(Date.now()); return route.fulfill({ json: liveBody() }); });
  await page.goto("/");
  await expect.poll(() => live.length).toBeGreaterThanOrEqual(1);

  await page.evaluate(() => (window as unknown as { __setHidden: (v: boolean) => void }).__setHidden(true));
  await page.clock.runFor(1000);
  const atHide = live.length;
  await page.clock.runFor(5 * 60_000); // ten poll periods while hidden
  expect(live.length, "requests made while hidden").toBe(atHide);

  await page.evaluate(() => (window as unknown as { __setHidden: (v: boolean) => void }).__setHidden(false));
  await expect.poll(() => live.length - atHide, { message: "catch-up requests after show" }).toBe(1);
  await page.clock.runFor(500);
  expect(live.length - atHide).toBe(1);

  await page.clock.runFor(31_000); // and normal polling resumes
  await expect.poll(() => live.length - atHide).toBeGreaterThanOrEqual(2);
});
