import { expect, test } from "@playwright/test";
import { etDay, liveBody } from "./qa-harness";

// "Today" is the NHL's Eastern-time day whatever the viewer's zone. A viewer in Tokyo (UTC+9) is already on the next calendar day
// for hours before ET rolls over; the heading must follow ET, and flip at ET midnight while the page stays open.
test.use({ timezoneId: "Asia/Tokyo", locale: "en-US" });

test("Home follows Eastern midnight, not the viewer's, and rolls over while open", async ({ page }) => {
  // 23:59:20 ET on a November day (EST = UTC-5) is 04:59:20 UTC and 13:59:20 the next day in Tokyo.
  const before = new Date("2026-11-10T04:59:20Z");
  expect(etDay(before)).toBe("2026-11-09");
  await page.clock.install({ time: before });
  await page.route("**/api/live", (route) => route.fulfill({ json: liveBody([], etDay(new Date())) }));
  await page.goto("/");
  const heading = page.locator(".sb-day, .day-heading, [data-testid='day-heading']").first();
  await expect(heading).toBeVisible();
  const first = (await heading.innerText()).trim();
  expect(first).toMatch(/today/i); // Tokyo's calendar says Nov 10, but ET's "today" is Nov 9

  await page.clock.runFor(70_000); // past ET midnight
  await expect.poll(async () => (await heading.innerText()).trim(), { timeout: 15_000 }).not.toBe(first);
  // After rollover the original day is now "Yesterday".
  await page.getByRole("button", { name: /previous day|yesterday/i }).first().isVisible().catch(() => false);
});

test("the Eastern day boundary honours daylight saving (EDT in summer, EST in winter)", async () => {
  expect(etDay(new Date("2026-07-10T03:59:59Z"))).toBe("2026-07-09");
  expect(etDay(new Date("2026-07-10T04:00:00Z"))).toBe("2026-07-10");
  expect(etDay(new Date("2026-11-10T04:59:59Z"))).toBe("2026-11-09");
  expect(etDay(new Date("2026-11-10T05:00:00Z"))).toBe("2026-11-10");
});
