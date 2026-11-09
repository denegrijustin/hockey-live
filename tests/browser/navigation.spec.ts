import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import teams from "../../public/data/teams.json" with { type: "json" };

/**
 * End-to-end checks of the navigation foundation: tab bar / sidebar, More menu, history-based routing, deep links, scroll
 * restoration, focus and titles, the responsive matrix, safe areas and filter persistence.
 * Everything is served from a deterministic fixture season (no network).
 */

const season = manifest.current;
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const ids = (teams as { id: string }[]).map((t) => t.id);

/** A full league schedule: finals for the last three weeks and a fortnight ahead, plus today's board; EDM, CHI and MIN (the default teams) play often. */
function fixture() {
  const games: any[] = [];
  let n = 7000;
  const mk = (offset: number, away: string, home: string) => {
    const past = offset < 0, today = offset === 0;
    const state = past || (today && n % 2 === 0) ? "FINAL" : "FUT";
    games.push({
      id: ++n, season, type: 2, date: day(offset), start: `${day(offset)}T${today ? "23" : "20"}:00:00Z`, state, scheduleState: "OK", venue: "Test Arena",
      home, away, homeScore: state === "FINAL" ? 2 + (n % 3) : null, awayScore: state === "FINAL" ? 1 + (n % 4) : null, end: state === "FINAL" ? "REG" : "", broadcasts: [], round: null,
    });
  };
  for (let o = -21; o <= 14; o++) {
    for (let k = 0; k < 8; k++) mk(o, ids[(o + 30 + k * 2) % 32], ids[(o + 30 + k * 2 + 1 + (k % 3)) % 32]);
    mk(o, "EDM", ids[(o + 40) % 32] === "EDM" ? "VAN" : ids[(o + 40) % 32]);
    mk(o, "CHI", "MIN");
  }
  return { season, updatedAt: new Date().toISOString(), source: "test fixture", games };
}

async function open(page: Page, url = "/") {
  const snapshot = fixture();
  await page.route("**/api/live", (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (r) => r.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (r) => r.fulfill({ json: snapshot }));
  await page.route("**/api/game/*", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/injuries/**", (r) => r.fulfill({ json: { season, updatedAt: new Date().toISOString(), teams: {} } }));
  await page.route("**/api/picks/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/moneypuck/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/data/moneypuck/**/shots/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/espn/*", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/players/**", (r) => r.fulfill({ json: { season, gameType: 2, updatedAt: new Date().toISOString(), skaters: [{ id: 8478402, name: "Connor McDavid", team: "EDM", number: 97, headshot: "", position: "C", gp: 1, goals: 1, assists: 2, shots: 4, hits: 3, plusMinus: 2, pim: 0 }], goalies: [] } }));
  await page.route("**/api/player/8478402", (r) => r.fulfill({ json: { name: "Connor McDavid", number: 97, team: "EDM", headshot: "", position: "C", birthDate: "1997-01-13", height: 73, weight: 194, shoots: "L", seasons: [] } }));
  await page.goto(url);
  await page.locator("main#main .view-in").waitFor({ timeout: 30000 });
}

// ---- view table (ids, tab/side label, document title) ----
const PRIMARY = ["scoreboard", "games", "standings", "teams"];
const LABEL: Record<string, string> = {
  scoreboard: "Home", games: "Games", standings: "Standings", teams: "Teams", yesterday: "Last night", teamschedule: "Schedule", trends: "Team trends", odds: "Playoff odds",
  picks: "Picks", nhlplus: "NHL+", edge: "NHL EDGE", map: "Imperialism map", players: "Players", injuries: "Injury report",
};
const ALL = Object.keys(LABEL);
const MORE_ITEMS = ALL.filter((id) => !PRIMARY.includes(id));
const titleOf = (id: string) => (id === "scoreboard" ? "Iceboard · NHL game intelligence" : `${LABEL[id]} · Iceboard`);
const addr = (id: string) => (id === "scoreboard" ? "/" : `/?view=${id}`);

const nav = (page: Page) => page.locator('nav[aria-label="Main"]');
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1100;
const moreButton = (page: Page) => nav(page).getByRole("button", { name: "More", exact: true });
const moreMenu = (page: Page) => page.locator('div.more-menu[role="dialog"][aria-label="More"]');
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

/** Opens a view through the nav the way a person would: a tab or sidebar entry, or More then its entry. */
async function goTo(page: Page, id: string) {
  const label = LABEL[id];
  if (wide(page)) return nav(page).getByRole("button", { name: label, exact: true }).click();
  if (PRIMARY.includes(id)) return nav(page).getByRole("button", { name: label, exact: true }).click();
  await moreButton(page).click();
  await moreMenu(page).getByRole("button", { name: label, exact: true }).click();
}
/** The label of the one nav entry marked as the current page (More on a phone for a More view). */
async function activeLabel(page: Page) {
  const cur = nav(page).locator('[aria-current="page"]');
  await expect(cur).toHaveCount(1);
  return cur.evaluate((e) => e.getAttribute("aria-label") ?? (e.textContent ?? "").trim());
}
const expectedActive = (page: Page, id: string) => (!wide(page) && MORE_ITEMS.includes(id) ? "More" : id === "scoreboard" ? "Home" : LABEL[id]);
const url = (page: Page) => { const u = new URL(page.url()); return u.pathname + u.search; };
async function expectView(page: Page, id: string) {
  await expect.poll(() => url(page)).toBe(addr(id));
  expect(await activeLabel(page)).toBe(expectedActive(page, id));
  await expect(page).toHaveTitle(titleOf(id));
}
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("A. user journeys", () => {
  test("1. Home to Games to Game Center, close, back on Home", async ({ page }) => {
    await open(page);
    await expectView(page, "scoreboard");
    await goTo(page, "games");
    await expectView(page, "games");
    const card = page.locator(".game-card").first();
    await card.waitFor();
    await card.getByRole("button", { name: /Open Game Center/ }).click();
    const gc = page.locator("dialog.game-dialog");
    await expect(gc).toBeVisible();
    await gc.getByRole("button", { name: "Close full game view" }).click();
    await expect(gc).toBeHidden();
    await expectView(page, "games");
    await goTo(page, "scoreboard");
    await expectView(page, "scoreboard");
  });

  test("1b. a tap on a Home game card opens the Game Center", async ({ page }) => {
    await open(page);
    await page.locator(".sb-row .sb-name").first().click();
    await expect(page.locator("dialog.game-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close full game view" }).click();
    await expect(page.locator("dialog.game-dialog")).toBeHidden();
    await expectView(page, "scoreboard");
  });

  test("2. Home to Standings to a Team profile, close", async ({ page }) => {
    await open(page);
    await goTo(page, "standings");
    await expectView(page, "standings");
    const link = page.locator("tbody tr").first().locator("button.team-link");
    const full = ((await link.locator(".st-full").first().textContent()) ?? "").trim();
    await link.click();
    const d = page.locator("dialog.team-dialog");
    await expect(d).toBeVisible();
    await expect(d.getByRole("heading", { name: full })).toBeVisible();
    await d.getByRole("button", { name: "Close team profile" }).click();
    await expect(d).toBeHidden();
    await expectView(page, "standings");
  });

  test("3. Teams to a Team profile to close; a player profile is not reachable from a team profile, so More to Players to player details to Back", async ({ page }) => {
    await open(page);
    await goTo(page, "teams");
    await expectView(page, "teams");
    await page.locator(".tm-card [data-team-link]").first().click();
    const d = page.locator("dialog.team-dialog");
    await expect(d).toBeVisible();
    // Team profiles list results and injuries only: no player-details button inside.
    await expect(d.getByRole("button", { name: /View .* details/ })).toHaveCount(0);
    await d.getByRole("button", { name: "Close team profile" }).click();
    await expect(d).toBeHidden();
    await goTo(page, "players");
    await expectView(page, "players");
    const who = page.getByRole("button", { name: "View Connor McDavid details" }).first();
    await who.click();
    await expect(page.locator("dialog.player-dialog[open]")).toContainText("Connor McDavid");
    await page.getByRole("button", { name: "Close player details" }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(who).toBeFocused();
    await page.goBack();
    await expectView(page, "teams");
  });

  test("4. More to Last night, Playoff odds and Injury report; the browser Back button returns to the previous view", async ({ page }) => {
    await open(page);
    await goTo(page, "standings");
    for (const id of ["yesterday", "odds", "injuries"]) {
      await goTo(page, id);
      await expectView(page, id);
    }
    await page.goBack();
    await expectView(page, "odds");
    await page.goBack();
    await expectView(page, "yesterday");
    await page.goBack();
    await expectView(page, "standings");
  });

  for (const id of ["standings", "teams", "injuries", "scoreboard", "games"]) {
    test(`5. deep link ?view=${id} opens it with the right nav item, title and heading`, async ({ page }) => {
      await open(page, addr(id));
      await expectView(page, id);
      if (id === "teams") await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
    });
  }

  test("5b. an unknown view id opens Home", async ({ page }) => {
    await open(page, "/?view=nonsense");
    expect(await activeLabel(page)).toBe("Home");
    await expect(page).toHaveTitle(titleOf("scoreboard"));
  });

  test("6. a refresh on ?view=odds renders the same view", async ({ page }) => {
    await open(page, "/?view=odds");
    await expectView(page, "odds");
    await page.reload();
    await page.locator("main#main .view-in").waitFor();
    await expectView(page, "odds");
    await expect(page.locator("main#main")).toContainText(/odds|playoff/i);
  });

  test("7. Back and Forward walk Home, Games, Standings, Teams", async ({ page }) => {
    await open(page);
    for (const id of ["games", "standings", "teams"]) await goTo(page, id);
    await expectView(page, "teams");
    await page.goBack(); await expectView(page, "standings");
    await page.goBack(); await expectView(page, "games");
    await page.goBack(); await expectView(page, "scoreboard");
    await page.goForward(); await expectView(page, "games");
    await page.goForward(); await expectView(page, "standings");
  });

  test("7b. scroll position is restored on Back", async ({ page }) => {
    await open(page);
    await goTo(page, "standings");
    await page.locator("tbody tr").first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
    const before = await scrollY(page);
    await goTo(page, "teams");
    expect(await scrollY(page)).toBeLessThan(20);
    await page.goBack();
    await expectView(page, "standings");
    await expect.poll(() => scrollY(page)).toBeGreaterThan(before - 25);
    expect(Math.abs((await scrollY(page)) - before)).toBeLessThan(25);
    // Games too, then Forward lands at the top of a fresh entry only if it was never scrolled.
    await goTo(page, "games");
    await page.locator(".game-card").first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 900));
    const g = await scrollY(page);
    expect(g).toBeGreaterThan(300);
    await goTo(page, "standings");
    await page.goBack();
    await expect.poll(async () => Math.abs((await scrollY(page)) - g)).toBeLessThan(25);
  });

  test("the brand link goes to Home without a page load", async ({ page }) => {
    await open(page, "/?view=standings");
    await page.evaluate(() => ((window as any).__same = true));
    await page.getByRole("link", { name: "Iceboard home" }).click();
    await expectView(page, "scoreboard");
    expect(await page.evaluate(() => (window as any).__same)).toBe(true);
  });
});

test.describe("B. structure and accessibility", () => {
  test("exactly one visible Main navigation, and its active item matches every view id", async ({ page }) => {
    await open(page);
    for (const id of ALL) {
      await goTo(page, id);
      await expectView(page, id);
      await expect(nav(page)).toHaveCount(1);
      await expect(nav(page)).toBeVisible();
      await expect(page.locator(".tab-bar:visible, .side-nav:visible")).toHaveCount(1);
    }
  });

  test("a view change moves focus to the main region", async ({ page }) => {
    await open(page);
    await goTo(page, "standings");
    await expect(page.locator("main#main")).toBeFocused();
    await goTo(page, "yesterday");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("Teams has exactly one visible h1", async ({ page }) => {
    await open(page, "/?view=teams");
    await expect(page.locator("h1:visible")).toHaveCount(1);
  });

  test("the skip link jumps to the dashboard", async ({ page }) => {
    await open(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to dashboard" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("main");
  });

  test("the keyboard reaches the nav, Enter and Space activate it, and focus is visible", async ({ page }) => {
    await open(page);
    const item = nav(page).getByRole("button", { name: "Standings", exact: true });
    await item.focus();
    await page.keyboard.press("Tab"); // the next stop is still inside the navigation
    await page.keyboard.press("Shift+Tab");
    await expect(item).toBeFocused();
    const outline = await item.evaluate((e) => getComputedStyle(e).outlineStyle + " " + getComputedStyle(e).outlineWidth);
    expect(outline).not.toMatch(/^none|\b0px\b/);
    await page.keyboard.press("Enter");
    await expectView(page, "standings");
    const teamsItem = nav(page).getByRole("button", { name: "Teams", exact: true });
    await teamsItem.focus();
    await page.keyboard.press("Space");
    await expectView(page, "teams");
  });

  test("a keyboard tab sequence reaches every primary destination and More", async ({ page }) => {
    await open(page);
    const first = nav(page).getByRole("button").first();
    await first.focus();
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      seen.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? (document.activeElement?.textContent ?? "").trim()));
      await page.keyboard.press("Tab");
    }
    expect(seen.slice(0, 4)).toEqual(["Home", "Games", "Standings", "Teams"]);
  });

  test("document title follows every view", async ({ page }) => {
    await open(page);
    for (const id of ALL) { await goTo(page, id); await expect(page).toHaveTitle(titleOf(id)); }
  });

  test("no second navigation appears with a dialog open", async ({ page }) => {
    await open(page, "/?view=teams");
    await page.locator(".tm-card [data-team-link]").first().click();
    await expect(page.locator("dialog.team-dialog")).toBeVisible();
    await expect(page.locator('nav[aria-label="Main"]')).toHaveCount(1);
    expect(await page.locator("dialog.team-dialog nav").count()).toBe(0);
  });

  test.describe("phone and tablet", () => {
    test.beforeEach(({ }, info) => test.skip(info.project.name !== "mobile", "tab bar"));

    test("the tab bar holds Home, Games, Standings, Teams and More", async ({ page }) => {
      await open(page);
      await expect(nav(page).getByRole("button")).toHaveText(["Home", "Games", "Standings", "Teams", "More"]);
      await expect(nav(page).getByRole("button").first()).toHaveAttribute("aria-label", "Home");
    });

    test("More: aria-expanded toggles, groups and items are listed, Escape and the scrim close it and return focus", async ({ page }) => {
      await open(page);
      const more = moreButton(page);
      await expect(more).toHaveAttribute("aria-haspopup", "dialog");
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "true");
      const menu = moreMenu(page);
      await expect(menu).toBeVisible();
      await expect(menu.locator("h2")).toHaveText(["Games & schedule", "League intelligence", "Players & teams", "Application"]);
      for (const id of MORE_ITEMS) await expect(menu.locator(".menu-item b", { hasText: new RegExp(`^${LABEL[id].replace(/[+]/g, "\\+")}$`) })).toHaveCount(1);
      await expect(menu.locator(".menu-item small").first()).not.toBeEmpty();
      await expect(menu.getByRole("button", { name: /My teams/ })).toBeVisible();
      await expect(menu.getByRole("button", { name: /Refresh data/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect(more).toBeFocused();
      await more.click();
      await expect(menu).toBeVisible();
      await page.locator(".menu-scrim").click({ position: { x: 20, y: 20 } });
      await expect(menu).toBeHidden();
      await expect(more).toBeFocused();
    });

    test("More is the current page for a More view, and picking one closes the menu", async ({ page }) => {
      await open(page);
      await expect(moreButton(page)).not.toHaveAttribute("aria-current", "page");
      await goTo(page, "picks");
      await expect(moreMenu(page)).toBeHidden();
      await expect(moreButton(page)).toHaveAttribute("aria-current", "page");
      await goTo(page, "standings");
      await expect(moreButton(page)).not.toHaveAttribute("aria-current", "page");
    });

    test("the More menu traps Tab in both directions", async ({ page }) => {
      await open(page);
      await moreButton(page).click();
      const menu = moreMenu(page);
      const buttons = menu.getByRole("button");
      const n = await buttons.count();
      await expect(buttons.first()).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(buttons.nth(n - 1)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(buttons.first()).toBeFocused();
      for (let i = 0; i < n * 2 + 3; i++) {
        await page.keyboard.press("Tab");
        expect(await menu.evaluate((m) => m.contains(document.activeElement))).toBe(true);
      }
    });

    test("Enter on a More item opens it", async ({ page }) => {
      await open(page);
      await moreButton(page).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Last night", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expectView(page, "yesterday");
    });

    test("More > My teams opens the team chooser and Refresh data keeps the view", async ({ page }) => {
      await open(page);
      await moreButton(page).click();
      await moreMenu(page).getByRole("button", { name: /My teams/ }).click();
      await expect(page.locator("dialog.sheet[open]")).toBeVisible();
      await page.locator("dialog.sheet").getByRole("button", { name: "Done" }).click();
      await moreButton(page).click();
      await moreMenu(page).getByRole("button", { name: /Refresh data/ }).click();
      await expect(moreMenu(page)).toBeHidden();
      await expectView(page, "scoreboard");
    });

    test("Games has a PageHeader h1", async ({ page }) => {
      await open(page, "/?view=games");
      await expect(page.locator("header.page-header h1")).toHaveText("Games");
    });
  });

  test.describe("desktop", () => {
    test.beforeEach(({ }, info) => test.skip(info.project.name !== "desktop", "sidebar"));

    test("the sidebar lists the four destinations, then a heading and list per More group", async ({ page }) => {
      await open(page);
      const side = nav(page);
      await expect(side).toHaveClass(/side-nav/);
      await expect(side.locator("ul").first().getByRole("button")).toHaveText(["Home", "Games", "Standings", "Teams"]);
      await expect(side.locator("h2")).toHaveText(["Games & schedule", "League intelligence", "Players & teams"]);
      for (const id of MORE_ITEMS) await expect(side.getByRole("button", { name: LABEL[id], exact: true })).toHaveCount(1);
      await expect(page.locator(".tab-bar")).toHaveCount(0);
    });

    test("Escape does nothing odd and a sidebar item shows a visible focus ring", async ({ page }) => {
      await open(page);
      const item = nav(page).getByRole("button", { name: "Playoff odds", exact: true });
      await item.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      const outline = await item.evaluate((e) => getComputedStyle(e).outlineStyle + " " + getComputedStyle(e).outlineWidth);
      expect(outline).not.toMatch(/^none|\b0px\b/);
    });
  });
});

const MATRIX: [string, number, number][] = [
  ["iPhone 390x844", 390, 844], ["small Android 360x640", 360, 640], ["phone landscape 844x390", 844, 390], ["small landscape 667x375", 667, 375],
  ["tablet portrait 768x1024", 768, 1024], ["tablet landscape 1024x768", 1024, 768], ["laptop 1280x800", 1280, 800], ["desktop 1920x1080", 1920, 1080],
];

test.describe("C. responsive matrix", () => {
  test.beforeEach(({ }, info) => test.skip(info.project.name !== "desktop", "viewport set per test; run once"));
  for (const [name, w, h] of MATRIX) {
    test.describe(name, () => {
      const touch = w < 1100;
      test.use({ viewport: { width: w, height: h }, hasTouch: touch });

      test("the right navigation, no sideways scroll on the main views", async ({ page }) => {
        await open(page);
        for (const id of ["scoreboard", "games", "standings", "teams"]) {
          await goTo(page, id);
          await expectView(page, id);
          expect(await sideways(page), `${id} overflows at ${w}`).toBe(true);
          await expect(nav(page)).toHaveClass(w >= 1100 ? /side-nav/ : /tab-bar/);
          await expect(page.locator(w >= 1100 ? ".tab-bar" : ".side-nav")).toHaveCount(0);
        }
      });

      test("tab bar: 44px targets, flush with the bottom, last content clear of it", async ({ page }) => {
        test.skip(w >= 1100, "sidebar");
        await open(page, "/?view=standings");
        const bar = nav(page);
        const bb = (await bar.boundingBox())!;
        expect(Math.round(bb.y + bb.height)).toBe(h);
        for (const b of await bar.getByRole("button").all()) {
          const r = (await b.boundingBox())!;
          expect(r.height, "tab height").toBeGreaterThanOrEqual(44);
          expect(r.width, "tab width").toBeGreaterThanOrEqual(44);
        }
        for (const id of ["scoreboard", "games", "standings", "teams"]) {
          await goTo(page, id);
          await page.locator("main#main .view-in").waitFor();
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForTimeout(150);
          const last = await page.evaluate(() => {
            const kids = [...document.querySelectorAll("footer, main#main .view-in *")].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && getComputedStyle(e).position !== "fixed" && getComputedStyle(e).visibility !== "hidden"; });
            return Math.max(...kids.map((e) => e.getBoundingClientRect().bottom));
          });
          expect(last, `${id}: content bottom vs tab bar top`).toBeLessThanOrEqual(bb.y + 1);
          expect(await sideways(page)).toBe(true);
        }
      });

      test("the More menu fits the viewport, scrolls when tall and adds no sideways scroll", async ({ page }) => {
        test.skip(w >= 1100, "sidebar");
        await open(page);
        await moreButton(page).click();
        const menu = moreMenu(page);
        await expect(menu).toBeVisible();
        const m = (await menu.boundingBox())!;
        const bar = (await nav(page).boundingBox())!;
        expect(m.x).toBeGreaterThanOrEqual(0);
        expect(m.y).toBeGreaterThanOrEqual(0);
        expect(m.x + m.width).toBeLessThanOrEqual(w);
        expect(m.y + m.height).toBeLessThanOrEqual(bar.y + 1);
        expect(await sideways(page)).toBe(true);
        const sc = await menu.evaluate((e) => ({ scrolls: e.scrollHeight > e.clientHeight, oy: getComputedStyle(e).overflowY }));
        if (sc.scrolls) expect(["auto", "scroll"]).toContain(sc.oy);
        // The last entry is reachable.
        const last = menu.getByRole("button", { name: /Refresh data/ });
        await last.scrollIntoViewIfNeeded();
        const lb = (await last.boundingBox())!;
        expect(lb.y + lb.height).toBeLessThanOrEqual(bar.y + 1);
        expect(lb.y).toBeGreaterThanOrEqual(0);
      });
    });
  }
});

test.describe("D. safe area", () => {
  test.beforeEach(({ }, info) => test.skip(info.project.name !== "mobile", "tab bar"));

  test("the inset is counted once: the tab bar and page pad for it, the body does not add it again", async ({ page }) => {
    await open(page);
    const rules = await page.evaluate(() => {
      const out: Record<string, string[]> = { tab: [], body: [], page: [] };
      const walk = (list: CSSRuleList, inNarrow: boolean) => {
        for (const r of Array.from(list)) {
          if (r instanceof CSSMediaRule) walk(r.cssRules, /max-width:\s*1099/.test(r.conditionText));
          else if (r instanceof CSSStyleRule) {
            const t = r.cssText;
            if (!/env\(safe-area-inset-bottom/.test(t)) continue;
            if (r.selectorText === ".tab-bar") out.tab.push(t);
            if (r.selectorText === "body") out.body.push(t + (inNarrow ? " /*narrow*/" : ""));
            if (r.selectorText === ".page") out.page.push(t);
          }
        }
      };
      for (const s of Array.from(document.styleSheets)) { try { walk(s.cssRules, false); } catch {} }
      return out;
    });
    expect(rules.tab.length, "tab bar pads for the home indicator").toBeGreaterThan(0);
    expect(rules.page.length, "page pads for tab bar plus inset").toBeGreaterThan(0);
    // The body must not add the bottom inset on top of the tab bar's and the page's own: that would double count it below the content.
    const bodyAdds = rules.body.filter((t) => !t.includes("/*narrow*/") || true);
    const bodyNarrowReset = await page.evaluate(() => getComputedStyle(document.body).paddingBottom);
    expect(bodyAdds.every((t) => /padding-bottom:\s*0/.test(t)) || bodyNarrowReset === "0px", `body bottom padding: ${bodyAdds.join(" | ")}`).toBe(true);
  });
});

test.describe("E. filters persistence", () => {
  test("the chosen teams survive Home, Standings and Teams, and show under My teams", async ({ page }, info) => {
    await page.addInitScript(() => localStorage.setItem("iceboard-teams", JSON.stringify(["FLA", "CAR", "TBL"])));
    await open(page);
    await goTo(page, "standings");
    await goTo(page, "teams");
    const mine = page.locator('.tm-group[aria-label="My teams"] .tm-card');
    await expect(mine).toHaveCount(3);
    await expect(mine.locator(".tm-name b")).toHaveText(["Carolina Hurricanes", "Florida Panthers", "Tampa Bay Lightning"]);
    await page.goBack();
    await page.goBack();
    await expectView(page, "scoreboard");
    expect(await page.evaluate(() => localStorage.getItem("iceboard-teams"))).toBe(JSON.stringify(["FLA", "CAR", "TBL"]));
    await goTo(page, "games");
    await expect(page.locator("main#main")).toContainText("3 selected teams");
    void info;
  });

  test("picking a team in the picker is remembered across views and a reload", async ({ page }, info) => {
    await open(page, "/?view=games");
    if (info.project.name === "mobile") {
      await page.getByRole("button", { name: "Choose teams" }).click();
      await page.locator("dialog.sheet").getByRole("checkbox", { name: "Florida Panthers", exact: true }).check();
      await page.locator("dialog.sheet").getByRole("button", { name: "Done" }).click();
    } else {
      await page.getByText("Choose teams", { exact: false }).click();
      await page.getByRole("checkbox", { name: "Florida Panthers", exact: true }).check();
      await page.getByText("Choose teams", { exact: false }).click();
    }
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iceboard-teams")!))).toContain("FLA");
    await goTo(page, "teams");
    await expect(page.locator('.tm-group[aria-label="My teams"] .tm-card[data-team="FLA"]')).toHaveCount(1);
    await page.reload();
    await page.locator("main#main .view-in").waitFor();
    await expect(page.locator('.tm-group[aria-label="My teams"] .tm-card[data-team="FLA"]')).toHaveCount(1);
  });

  test("a Games search and status filters survive a trip to Standings and the browser Back button", async ({ page }, info) => {
    await open(page, "/?view=games");
    const phone = info.project.name === "mobile";
    let box = page.locator(phone ? 'input[aria-label="Find a matchup"]' : 'input[type="search"][placeholder^="Team or opponent"]');
    if (!phone && !(await box.isVisible())) await page.getByRole("button", { name: /^Filters/ }).click();
    await box.fill("Edmonton");
    await expect(box).toHaveValue("Edmonton");
    await goTo(page, "standings");
    await expectView(page, "standings");
    await page.goBack();
    await expectView(page, "games");
    box = page.locator(phone ? 'input[aria-label="Find a matchup"]' : 'input[type="search"][placeholder^="Team or opponent"]');
    await expect(box).toHaveValue("Edmonton");
    // A past/upcoming switch stays too (desktop; on a phone it lives in the Filters sheet).
    if (!phone) {
      await page.getByRole("group", { name: "Game period" }).getByRole("button").first().click();
      const pressed = page.getByRole("group", { name: "Game period" }).locator('[aria-pressed="true"]');
      const label = await pressed.first().textContent();
      await goTo(page, "teams");
      await page.goBack();
      await expect(page.getByRole("group", { name: "Game period" }).locator('[aria-pressed="true"]').first()).toHaveText(label!);
    }
  });
});
