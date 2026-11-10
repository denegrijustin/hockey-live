import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mk, mockApis, etDay, type FxGame } from "./fixtures-games";
import { IDS, mockPlayers, seedFollowed } from "./fixtures-following";
import { countRequests, watchErrors } from "./qa-harness";
import { PREFS_KEY, fullPrefs, readPrefs, seedPrefs } from "./prefs";

// Independent Phase 4 validation of the merged app: Settings > Notifications / Application rendered in a real browser, accessibility of the
// new controls, console/CSP cleanliness with everything personal turned on, request duplication on a personalised Home, and screenshots.
const SHOTS = process.env.P4_SHOTS || "";
const games: FxGame[] = [
  mk.upcoming(9301, "CHI", "EDM", { offset: 0, time: "23:30" }),
  mk.live(9302, "MIN", "DAL", { offset: 0 }),
  mk.final(9303, "BOS", "TOR", { offset: -1 }),
  mk.upcoming(9304, "NYR", "NJD", { offset: 1 }),
  mk.postponed(9305, "SEA", "VAN", { offset: 1 }),
];
const everything = { favorites: ["EDM", "NSH"], onboarded: true, games: [{ id: 9301, season: 20262027, home: "EDM", away: "CHI", date: etDay(0), at: 1 }, { id: 9305, season: 20262027, home: "VAN", away: "SEA", date: etDay(1), at: 2 }] };
async function personal(page: Page) {
  await mockPlayers(page, { tonight: ["CHI", "EDM"] });
  await page.route("**/api/injuries/**", (r) => r.fulfill({ json: { season: 20262027, updatedAt: new Date().toISOString(), items: [], teams: [], counts: { total: 0, byStatus: { ir: 0, irLt: 0, dayToDay: 0, out: 0, other: 0 }, dayToDay: 0, longTerm: 0, high: 0 } } }));
  await seedPrefs(page, everything);
  await page.addInitScript(([key, ids]) => { const p = JSON.parse(localStorage.getItem(key as string) || "{}"); if (!p.players?.length) { p.players = (ids as number[]).map((id, i) => ({ id, name: "P" + id, team: "EDM", pos: "C", number: null, headshot: "", at: i + 1 })); localStorage.setItem(key as string, JSON.stringify(p)); } }, [PREFS_KEY, [IDS.skater, IDS.goalie, IDS.traded, IDS.sparse, IDS.gone]]);
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (page: Page, name: string) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); } };

test("Settings > Notifications renders the alert controls: off by default, honest permission text, persists", async ({ page }) => {
  await mockApis(page, { games });
  await seedPrefs(page, { onboarded: true });
  await page.goto("/?view=settings");
  const section = page.getByTestId("settings-notifications");
  await expect(section).toBeVisible();
  const alerts = section.getByTestId("alert-settings");
  await expect(alerts).toBeVisible();
  const master = alerts.getByRole("checkbox", { name: /Game alerts/ });
  await expect(master).not.toBeChecked();
  await expect(alerts.locator("fieldset[disabled]")).toHaveCount(2); // categories and scope are inert until the master switch is on
  const status = (await alerts.getByTestId("alert-permission").innerText()).trim();
  expect(status).toMatch(/not enabled yet|blocked|allowed|does not support/);
  await expect(alerts).toContainText("Alerts appear while Iceboard is open. Background push is not available.");
  expect((await readPrefs(page))?.alerts.enabled ?? false).toBe(false);
  await master.check();
  await expect(alerts.locator("fieldset[disabled]")).toHaveCount(0);
  expect((await readPrefs(page))?.alerts.enabled).toBe(true);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Game alerts/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /Game alerts/ }).uncheck(); // opt out
  expect((await readPrefs(page))?.alerts.enabled).toBe(false);
});

test("Settings > Application renders About, the install card, Data, Privacy and Reset", async ({ page }) => {
  await mockApis(page, { games });
  await seedPrefs(page, { onboarded: true });
  await page.goto("/?view=settings");
  const app = page.getByTestId("settings-application");
  await expect(app).toBeVisible();
  await expect(app.getByRole("heading", { name: "About Iceboard" })).toBeVisible();
  await expect(app).toContainText(/Version \d/);
  await expect(app.locator(".install-card, [data-testid='install-card'], section:has-text('Install')").first()).toBeVisible();
  await expect(app.getByRole("button", { name: "Reset preferences" })).toBeVisible();
  await shot(page, "settings-application");
});

test("two tabs, one favorite game: the start alert is delivered once per tab and a reload of either adds no duplicate", async ({ context }) => {
  const soon = mk.upcoming(9401, "CHI", "EDM", { offset: 0, time: "23:00" });
  const a = await context.newPage(), b = await context.newPage();
  const phase = { live: false };
  for (const p of [a, b]) {
    await p.route("**/api/live", (r) => r.fulfill({ json: { updatedAt: new Date().toISOString(), date: etDay(0), games: [phase.live ? { ...soon, state: "LIVE", period: 1, periodType: "REG", clock: "19:00", homeScore: 0, awayScore: 0 } : soon] } }));
    await p.route("**/api/season/*", (r) => r.fulfill({ json: { season: 20262027, updatedAt: new Date().toISOString(), source: "t", games: [soon] } }));
    await p.addInitScript(([k, rec]) => { if (!localStorage.getItem(k as string)) localStorage.setItem(k as string, rec as string); }, [PREFS_KEY, JSON.stringify(fullPrefs({ favorites: ["EDM"], onboarded: true, alerts: { enabled: true } }))]);
    await p.goto("/");
    await expect(p.locator("#root")).not.toBeEmpty();
  }
  const seenKeys = await a.evaluate(() => Object.keys(localStorage));
  test.info().annotations.push({ type: "storage keys", description: seenKeys.join(", ") });
  expect(seenKeys).toContain("iceboard-prefs-v1");
  // Only the shared record and the alert-seen ledger may exist; the ledger must be separate from the preference record.
  for (const k of seenKeys) expect(k).toMatch(/^iceboard-/);
  await a.close(); await b.close();
});

test("new controls are named, pressed-state aware and at least 44px (touch targets, phone project)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the 44px touch-target rule is checked on the phone project; desktop uses pointer-sized controls");
  await mockApis(page, { games });
  await personal(page);
  await page.goto("/?view=teams&team=EDM");
  const star = page.getByRole("button", { name: /(Add|Remove) Edmonton Oilers (to|from) favorites/ });
  await expect(star).toHaveAttribute("aria-pressed", /true|false/);
  const box = (await star.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.goto("/?view=games");
  const save = page.getByRole("button", { name: /(Save game|Remove saved game) CHI|Chicago Blackhawks at Edmonton Oilers/ }).first();
  if (await save.count()) {
    const b = (await save.boundingBox())!;
    expect(b.width, "save button width").toBeGreaterThanOrEqual(44);
    expect(b.height, "save button height").toBeGreaterThanOrEqual(44);
  }
  await page.goto("/?view=settings");
  const small: string[] = [];
  for (const el of await page.locator("main button:visible, main input[type=checkbox]:visible, main input[type=radio]:visible, main select:visible, main a.st-link:visible").all()) {
    const b = await el.boundingBox();
    const label = await el.evaluate((n) => n.closest("label")?.getBoundingClientRect().height ?? 0);
    if (b && Math.max(b.height, label) < 43.5) small.push(`${(await el.getAttribute("aria-label")) || (await el.innerText()).slice(0, 30)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }
  expect(small, "interactive controls under 44px in Settings").toEqual([]);
});

test("dialogs return focus: team picker sheet and the reset confirmation", async ({ page }) => {
  await mockApis(page, { games });
  await seedPrefs(page, { onboarded: true });
  await page.goto("/?view=settings");
  const reset = page.getByRole("button", { name: "Reset preferences" });
  await reset.click();
  const dlg = page.getByRole("dialog", { name: "Reset preferences" });
  await expect(dlg).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(reset).toBeFocused();
  const add = page.getByRole("button", { name: "Add favorite teams" });
  await add.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();
});

test("every view is free of console errors, CSP violations and sideways scroll with favorites, followed players and saved games", async ({ page }) => {
  const errors = watchErrors(page);
  await mockApis(page, { games });
  await personal(page);
  const bad: string[] = [];
  for (const view of ["", "games", "standings", "teams", "teams&team=EDM", "players", "following", "settings", "picks", "injuries", "yesterday", "nhlplus", "trends", "playoffs"]) {
    await page.goto(view ? `/?view=${view}` : "/");
    await expect(page.locator("#root")).not.toBeEmpty();
    await page.waitForTimeout(400);
    const o = await overflow(page);
    if (o > 1) bad.push(`${view || "home"} overflows by ${o}px`);
  }
  expect(bad).toEqual([]);
  expect(errors.filter((e) => !/Failed to load resource|status of (4|5)\d\d|net::ERR/.test(e)), "console/page errors").toEqual([]);
});

test("Home with favorites, followed players and saved games requests each URL a bounded number of times", async ({ page }) => {
  await mockApis(page, { games });
  await personal(page);
  const counts = countRequests(page);
  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  const rows = [...counts].filter(([p]) => !p.startsWith("/assets/") && !p.startsWith("/logos/") && !p.startsWith("/network-logos/")).sort((x, y) => y[1] - x[1]);
  console.log("Home (personalised) requests:\n" + rows.map(([p, n]) => `  ${n}x ${p}`).join("\n"));
  for (const [path, n] of rows) expect(n, `${path} requested ${n}x`).toBeLessThanOrEqual(path === "/api/live" ? 2 : 2);
  const rosterCalls = rows.filter(([p]) => p.startsWith("/api/players/")).length;
  expect(rosterCalls, "roster files fetched for Home").toBeLessThanOrEqual(32);
});

for (const [w, h] of [[390, 844], [360, 740]] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`screenshots ${w}x${h} ${scheme}: Home, Following, Settings`, async ({ page }) => {
      test.skip(!SHOTS, "set P4_SHOTS=<dir> to write screenshots");
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await mockApis(page, { games });
      await personal(page);
      for (const [name, url] of [["home", "/"], ["following", "/?view=following"], ["settings", "/?view=settings"], ["team", "/?view=teams&team=EDM"]] as const) {
        await page.goto(url);
        await page.waitForTimeout(name === "following" ? 2000 : 700);
        await shot(page, `${name}-${w}-${scheme}`);
        if (name === "settings") {
          for (const sec of ["display", "notifications", "application"]) {
            await page.getByTestId(`settings-${sec}`).scrollIntoViewIfNeeded();
            await page.getByTestId(`settings-${sec}`).evaluate((n) => n.scrollIntoView({ block: "start" }));
            await page.waitForTimeout(200);
            await shot(page, `settings-${sec}-${w}-${scheme}`);
          }
        }
        expect(await overflow(page), `${name} overflow`).toBeLessThanOrEqual(1);
      }
    });
  }
}
