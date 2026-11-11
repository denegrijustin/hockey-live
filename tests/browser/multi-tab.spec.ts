import { expect, test, type Page } from "@playwright/test";
import { readPrefs } from "./prefs";
import { liveBody } from "./qa-harness";

// Two tabs of one browser context share localStorage. A favorite changed in tab A must show in tab B through the `storage` event
// (src/lib/prefs.ts subscribes to it). The store has no consumer in the UI until the favorites work is merged, so this probes the
// favorite star (`button[aria-label^="Add "|"Remove "][aria-pressed]`, docs/phase4-contracts.md) and skips, with the reason, when absent.
const star = (page: Page) => page.locator('button[aria-pressed][aria-label^="Add "], button[aria-pressed][aria-label^="Remove "]').first();

test("a favorite toggled in one tab appears in the other without a reload", async ({ context }) => {
  const a = await context.newPage(), b = await context.newPage();
  for (const p of [a, b]) {
    await p.route("**/api/live", (route) => route.fulfill({ json: liveBody() }));
    await p.goto("/?view=teams&team=EDM");
  }
  await expect(star(a)).toBeVisible();
  await expect(star(b)).toBeVisible();
  const before = await star(b).getAttribute("aria-pressed");
  await star(a).click();
  await expect(star(a)).not.toHaveAttribute("aria-pressed", before!);
  await expect(star(b)).not.toHaveAttribute("aria-pressed", before!, { timeout: 5000 });
  expect((await readPrefs(b))?.favorites).toContain("EDM");
  await star(b).click(); // and back, from the other tab
  await expect(star(a)).toHaveAttribute("aria-pressed", before!, { timeout: 5000 });
});

test("a corrupt record written by another tab does not break the open tab", async ({ context }) => {
  const a = await context.newPage(), b = await context.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  for (const p of [a, b]) {
    await p.route("**/api/live", (route) => route.fulfill({ json: liveBody() }));
    await p.goto("/");
  }
  await b.evaluate(() => localStorage.setItem("iceboard-prefs-v1", "{not json"));
  await b.evaluate(() => localStorage.setItem("iceboard-prefs-v1", JSON.stringify({ favorites: "EDM", display: 5 })));
  await a.waitForTimeout(300);
  await expect(a.locator("#root")).not.toBeEmpty();
  expect(errors).toEqual([]);
});
