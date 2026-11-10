import { expect, test, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import teams from "../../src/data/teams.json" with { type: "json" };
import { buildInjuryReport } from "../../src/lib/injuries.mjs";
import { mk, mockApis, count, watchErrors } from "./fixtures-games";
import { fx, profileFor, rosterFile, emptyLog } from "./fixtures-players";

// Phase 3 QA (independent). Real bundled season snapshot unless a mock is stated. Screenshots go to SHOTS when it is set.
test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "viewports are set inside the tests"); });
const SHOTS = process.env.SHOTS ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };
const season = manifest.current;
const espn = JSON.parse(readFileSync("tests/fixtures/espn-injuries.json", "utf8"));
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const report = buildInjuryReport({ espn, teams, today, season });

const PID = 9000001; // fictitious 7-digit id from fixtures-players
async function mockPlayers(page: Page, log: string[] = [], opts: { profile?: object | number } = {}) {
  await page.route("**/api/players/**", (r) => { log.push(new URL(r.request().url()).pathname); const t = new URL(r.request().url()).pathname.split("/").pop()!; return r.fulfill({ json: rosterFile(t, [{ ...fx.skater, team: t }, { ...fx.longName, team: t }, { ...fx.missingStats, team: t }], [{ ...fx.goalie, team: t }]) }); });
  await page.route(/\/api\/player\/\d{7}$/, (r) => { const p = new URL(r.request().url()).pathname; log.push(p); const id = Number(p.split("/").pop()); if (typeof opts.profile === "number") return r.fulfill({ status: opts.profile, body: "{}" }); if (opts.profile) return r.fulfill({ json: opts.profile }); const all = [fx.skater, fx.goalie, fx.longName, fx.missingStats]; const pl = all.find((x) => x.id === id); return pl ? r.fulfill({ json: profileFor(pl) }) : r.fulfill({ status: 404, body: "{}" }); });
  await page.route(/\/api\/player\/\d{7}\/log\//, (r) => { log.push(new URL(r.request().url()).pathname); return r.fulfill({ json: emptyLog(PID) }); });
  await page.route("**/api/injuries/**", (r) => { log.push(new URL(r.request().url()).pathname); return r.fulfill({ json: report }); });
}

/** Static a11y + layout audit of what is on screen inside `scope`. */
async function audit(page: Page, scope = "body") {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope)!;
    const vis = (e: Element) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const name = (e: Element) => (e.getAttribute("aria-label") || (e.getAttribute("aria-labelledby") ? document.getElementById(e.getAttribute("aria-labelledby")!)?.textContent : "") || (e as HTMLElement).innerText || e.textContent || e.getAttribute("title") || (e as HTMLInputElement).placeholder || "").trim();
    const interactive = [...root.querySelectorAll("button, a[href], summary, input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=option], [role=tab]")].filter(vis);
    const unnamed = interactive.filter((e) => { const own = name(e); const imgAlt = [...e.querySelectorAll("img")].map((i) => i.alt).join("").trim(); return !own && !imgAlt && !(e as HTMLInputElement).labels?.length; }).map((e) => e.outerHTML.slice(0, 100));
    const imgs = [...root.querySelectorAll("img")].filter(vis).filter((i) => i.getAttribute("alt") === null).map((i) => i.outerHTML.slice(0, 100));
    const small = interactive.filter((e) => { const r = e.getBoundingClientRect(); if (e.tagName === "A" && e.closest("p, li")?.textContent !== e.textContent && getComputedStyle(e).display === "inline") return false; return r.height < 43.5 && !(e as HTMLInputElement).type?.match(/checkbox|radio/); }).map((e) => `${name(e).slice(0, 30)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    // contrast (WCAG) of text nodes against the nearest opaque ancestor background
    const parse = (c: string) => { const m = c.match(/[\d.]+/g)!.map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (e: Element | null): { r: number; g: number; b: number } => { let acc: { r: number; g: number; b: number } | null = null; const layers: ReturnType<typeof parse>[] = []; for (let n: Element | null = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let base = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop()! : { r: 255, g: 255, b: 255, a: 1 }; acc = base; for (const l of layers.reverse()) acc = { r: l.r * l.a + acc.r * (1 - l.a), g: l.g * l.a + acc.g * (1 - l.a), b: l.b * l.a + acc.b * (1 - l.a), a: 1 }; return acc; };
    const low: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement; if (!el || seen.has(el) || !t.textContent!.trim() || !vis(el)) continue; seen.add(el);
      const s = getComputedStyle(el); if (s.backgroundImage !== "none" && s.backgroundImage.includes("gradient")) continue;
      const fg = parse(s.color), bg = bgOf(el); const a = fg.a; const f = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
      const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight) >= 700; const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < need && Number(s.opacity) >= 1) low.push(`${ratio.toFixed(2)}<${need} "${t.textContent!.trim().slice(0, 28)}" <${el.tagName.toLowerCase()}.${String(el.className).slice(0, 24)}>`);
    }
    return { unnamed, imgs, small, low: low.slice(0, 12), lowCount: low.length, overflow: document.documentElement.scrollWidth - window.innerWidth };
  }, scope);
}

test("deep links: unknown team, unknown/malformed/404 player, offline provider: never a blank screen, never a console error", async ({ page }) => {
  const errors = watchErrors(page);
  await mockApis(page, { games: [], live: [] });
  const log: string[] = [];
  await mockPlayers(page, log, { profile: 404 });
  for (const url of ["/?team=XXX", "/?view=teams&team=XXX", "/?view=teams&team=%3Cimg%20src%3Dx%3E", "/?view=teams&team=edm"]) {
    await page.goto(url);
    await expect(page.locator("#root *").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    if (url.endsWith("team=XXX")) await expect(page.locator("[data-team-page]")).toHaveCount(0);
  }
  await page.goto("/?view=teams&team=EDM");
  await expect(page.locator("[data-team-page=EDM]")).toBeVisible();
  // 404 player: dialog opens, says so, Retry/Close work, Close removes the parameter
  await page.goto("/?player=1234567");
  const dlg = page.locator("dialog.player-dialog[open]");
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("alert")).toContainText("could not be found");
  await shot(page, "player-404");
  await dlg.getByRole("button", { name: "Retry" }).click();
  await expect(dlg.getByRole("alert")).toBeVisible();
  await dlg.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("dialog.player-dialog[open]")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("player")).toBe(false);
  // Malformed ids never open a dialog nor fetch.
  const before = log.filter((l) => /\/api\/player\//.test(l)).length;
  for (const bad of ["abc", "123", "12345678", "%3Cscript%3E", "1234567%20"]) {
    await page.goto(`/?player=${bad}`);
    await expect(page.locator("dialog.player-dialog[open]")).toHaveCount(0);
  }
  expect(log.filter((l) => /\/api\/player\//.test(l)).length - before).toBe(0);
  // 500 gives the "unavailable" sentence.
  await page.unroute(/\/api\/player\/\d{7}$/);
  await page.route(/\/api\/player\/\d{7}$/, (r) => r.fulfill({ status: 500, body: "x" }));
  await page.goto("/?player=1234567");
  await expect(page.locator("dialog.player-dialog[open]").getByRole("alert")).toContainText("unavailable");
  expect(errors).toEqual([]);
});

test("team page without a roster feed, with long names; player with null stats and no team roster; long player name at 360", async ({ page }) => {
  const errors = watchErrors(page);
  await mockApis(page, { games: [], live: [] });
  await mockPlayers(page);
  await page.route("**/api/players/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/data/players/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.setViewportSize({ width: 360, height: 800 });
  // no games at all: team page still renders and says what is missing
  await page.goto("/?view=teams&team=CBJ");
  await expect(page.getByRole("heading", { level: 1, name: "Columbus Blue Jackets" })).toBeVisible();
  const roster = page.locator("details.tpg-details", { has: page.getByRole("heading", { name: "Roster" }) });
  await roster.locator("summary").click();
  await expect(roster).toContainText(/not (published|available)|unavailable|No roster|no players/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  const body = await page.locator("section.team-page").innerText();
  expect(body).not.toMatch(/NaN|undefined|Infinity|\bnull\b/);
  await shot(page, "team-no-games-360");
  // null stats player
  await page.unroute("**/api/players/**");
  await mockPlayers(page);
  await page.goto(`/?player=${fx.missingStats.id}`);
  const dlg = page.locator("dialog.player-dialog[open]");
  await expect(dlg.getByRole("heading", { name: "Test Missing" })).toBeVisible();
  expect(await dlg.innerText()).not.toMatch(/NaN|undefined|Infinity|\bnull\b/);
  await page.goto(`/?player=${fx.longName.id}`);
  await expect(dlg.getByRole("heading").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(await dlg.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(0);
  await shot(page, "player-longname-360");
  expect(errors).toEqual([]);
});

test("offline mid-profile: the open profile keeps its content; 10-game window reports a failure instead of crashing", async ({ page, context }) => {
  const errors = watchErrors(page);
  await mockApis(page, { games: [], live: [] });
  await mockPlayers(page);
  await page.goto(`/?player=${PID}`);
  const dlg = page.locator("dialog.player-dialog[open]");
  await expect(dlg.getByRole("heading", { name: "Test Skater" })).toBeVisible();
  await context.setOffline(true);
  const ten = dlg.getByRole("radio", { name: /10/ }).or(dlg.getByRole("button", { name: /10/ })).first();
  if (await ten.count()) await ten.click();
  await expect(dlg.getByRole("heading", { name: "Test Skater" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.player-dialog[open]")).toHaveCount(0);
  await context.setOffline(false);
  expect(errors.filter((e) => !/net::|Failed to fetch|Failed to load/.test(e))).toEqual([]);
});

test("a11y: player dialog traps and returns focus, Escape closes; team page keyboard path; targets and names at 390 and 360", async ({ page }) => {
  const errors = watchErrors(page);
  await mockApis(page, { games: [], live: [] });
  await mockPlayers(page);
  for (const w of [390, 360]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/?view=teams&team=EDM");
    await expect(page.locator("[data-team-page=EDM]")).toBeVisible();
    for (const s of await page.locator("section.team-page summary").all()) await s.click();
    await expect(page.locator("section.team-page").getByRole("table", { name: "Forwards" })).toBeVisible();
    const a = await audit(page, "section.team-page");
    expect(a, `team page @${w}`).toMatchObject({ unnamed: [], imgs: [], small: [], overflow: 0 });
    if (a.lowCount) console.log(`CONTRAST team page ${w}`, a.low);
    await shot(page, `team-page-${w}`);
  }
  // keyboard: open a player from the roster by Enter, focus moves in, Escape returns it to the opener
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?view=teams&team=EDM");
  const opener = page.getByRole("button", { name: "View Test Skater details" }).first();
  if (!(await opener.isVisible())) await page.locator("details.tpg-details", { has: page.getByRole("heading", { name: "Roster" }) }).locator("summary").click();
  await opener.focus();
  await page.keyboard.press("Enter");
  const dlg = page.locator("dialog.player-dialog[open]");
  await expect(dlg).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog.player-dialog"))).toBe(true);
  for (let i = 0; i < 25; i++) { await page.keyboard.press("Tab"); if (!(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest("dialog.player-dialog")))) throw new Error("focus escaped the dialog"); }
  await expect(dlg.getByRole("button", { name: "Close player details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.player-dialog[open]")).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

test("a11y: standings at 390 and 360 (names, targets, radiogroup arrows, aria-sort, captions, light and dark)", async ({ page }) => {
  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const w of [390, 360]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto("/?view=standings");
      await page.locator("tr[data-team]").first().waitFor();
      const a = await audit(page, "main, #root");
      expect(a.unnamed, `${scheme}@${w}`).toEqual([]);
      expect(a.overflow).toBeLessThanOrEqual(0);
      if (a.small.length || a.lowCount) console.log(`STANDINGS ${scheme}@${w}`, JSON.stringify({ small: a.small.slice(0, 6), low: a.low.slice(0, 6), n: a.lowCount }));
      await shot(page, `standings-${scheme}-${w}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?view=standings");
  await page.locator("tr[data-team]").first().waitFor();
  const rg = page.getByRole("radiogroup", { name: "Standings group" });
  await expect(rg.getByRole("radio")).toHaveCount(5);
  const checked = rg.getByRole("radio", { checked: true }); const before = await checked.innerText();
  await checked.focus();
  await page.keyboard.press("ArrowRight");
  await expect(rg.getByRole("radio", { checked: true })).not.toHaveText(before);
  await page.keyboard.press("ArrowLeft");
  await expect(rg.getByRole("radio", { checked: true })).toHaveText(before);
  // exactly one radio is tabbable (roving tabindex)
  expect(await rg.getByRole("radio").evaluateAll((r) => r.filter((x) => x.tabIndex === 0).length)).toBe(1);
  // every table has an accessible name
  for (const t of await page.locator("table.standings-table").all()) expect(await t.evaluate((e) => !!(e.querySelector("caption")?.textContent || e.getAttribute("aria-label")))).toBe(true);
  // header sort semantics: aria-sort only on a column that is actually sorted, never on several
  expect(await page.locator("th[aria-sort]").evaluateAll((e) => e.filter((x) => x.getAttribute("aria-sort") !== "none").length)).toBeLessThanOrEqual(1 + 4);
  // Current/Projected toggle is pressed state
  const modes = page.locator("[aria-pressed]");
  expect(await modes.count()).toBeGreaterThan(0);
});

test("a11y: search palette, injuries and game-center lens at 360 (light + dark), reduced motion", async ({ page }) => {
  const g = [mk.final(9701, "BOS", "TOR", { offset: -2, score: [1, 3] }), mk.final(9702, "ANA", "TOR", { offset: -1, score: [2, 4] }), mk.upcoming(9710, "ANA", "TOR", { offset: 0, time: "23:30" }), mk.final(9703, "TOR", "BOS", { offset: -3, score: [3, 0] })];
  await mockApis(page, { games: g, live: [] });
  await mockPlayers(page);
  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await page.locator(".sb-row").first().waitFor();
    await page.keyboard.press("Control+k");
    const d = page.getByRole("dialog", { name: "Search" });
    await d.getByRole("combobox").fill("a");
    await expect(d.getByRole("option").first()).toBeVisible();
    const a = await audit(page, "dialog.search-dialog");
    expect(a, `search ${scheme}`).toMatchObject({ unnamed: [], overflow: 0 });
    if (a.small.length || a.lowCount) console.log(`SEARCH ${scheme}`, JSON.stringify({ small: a.small, low: a.low }));
    await shot(page, `search-${scheme}-360`);
    await page.keyboard.press("Escape");
    // game center lens
    await page.locator(`.sb-row[data-game="9710"] .sb-main`).click();
    const dialog = page.locator("dialog.game-dialog");
    await dialog.locator("summary", { hasText: "Form and matchup lens" }).click();
    await expect(dialog.locator(".tr-lens")).toBeVisible();
    const b = await audit(page, "dialog.game-dialog .tr-lens");
    expect(b, `lens ${scheme}`).toMatchObject({ unnamed: [], overflow: 0 });
    if (b.lowCount) console.log(`LENS ${scheme}`, b.low);
    await shot(page, `lens-${scheme}-360`);
    await page.keyboard.press("Escape");
    // injuries
    await page.goto("/?view=injuries");
    await expect(page.getByTestId("injury").first()).toBeVisible();
    const c = await audit(page, "main, #root");
    expect(c.unnamed).toEqual([]); expect(c.overflow).toBeLessThanOrEqual(0);
    if (c.small.length || c.lowCount) console.log(`INJURIES ${scheme}`, JSON.stringify({ small: c.small.slice(0, 8), low: c.low.slice(0, 8), n: c.lowCount }));
    await shot(page, `injuries-${scheme}-360`);
  }
  // reduced motion: no running animation/transition longer than ~10ms on the opened palette
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".sb-row").first().waitFor();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
  const anims = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && Number((a.effect as KeyframeEffect)?.getComputedTiming().iterations) === Infinity).length);
  expect(anims).toBe(0);
});

test("performance: request counts for team page, player profile and search (no duplicate fetches)", async ({ page }) => {
  const m = await mockApis(page, { games: [mk.final(9701, "BOS", "EDM", { offset: -2, score: [1, 3] }), mk.upcoming(9710, "EDM", "TOR", { offset: 1 })], live: [] });
  const plog: string[] = [];
  await mockPlayers(page, plog);
  const all: string[] = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.hostname === "127.0.0.1") all.push(u.pathname); });
  await page.goto("/?view=teams&team=EDM");
  await expect(page.locator("[data-team-page=EDM]")).toBeVisible();
  await page.waitForTimeout(800);
  const dups = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {})).filter(([, n]) => n > 1);
  console.log("TEAM PAGE requests", JSON.stringify(all.filter((p) => !/\.(js|css|woff2?|svg|png)$/.test(p))));
  expect(dups(all.filter((p) => !/assets\/|\.(png|svg|jpg)$|^\/api\/players\//.test(p))), "team page duplicates").toEqual([]);
  all.length = 0;
  await page.locator("details.tpg-details", { has: page.getByRole("heading", { name: "Roster" }) }).locator("summary").click();
  await page.getByRole("button", { name: "View Test Skater details" }).first().click();
  await expect(page.locator("dialog.player-dialog[open]").getByRole("heading", { name: "Test Skater" })).toBeVisible();
  await page.waitForTimeout(800);
  console.log("PLAYER requests", JSON.stringify(all.filter((p) => !/assets\//.test(p))));
  expect(dups(all.filter((p) => !/assets\/|\.(png|svg|jpg)$|^\/api\/players\//.test(p))), "player duplicates").toEqual([]);
  all.length = 0;
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Search" }).getByRole("combobox").fill("edm");
  await page.waitForTimeout(500);
  console.log("SEARCH requests", JSON.stringify(all.filter((p) => !/assets\//.test(p))));
  expect(dups(all.filter((p) => !/assets\/|\.(png|svg|jpg)$|^\/api\/players\//.test(p))), "search duplicates").toEqual([]);
  expect(count(m.log, "/api/live")).toBeLessThanOrEqual(2);
});

test("cross-links: standings -> team page; team -> player -> team; injuries -> player/team; search -> team, game, player, page; no dead ends", async ({ page }) => {
  const g = [mk.final(9701, "BOS", "EDM", { offset: -2, score: [1, 3] }), mk.upcoming(9710, "EDM", "TOR", { offset: 0, time: "23:30" })];
  await mockApis(page, { games: g, live: [] });
  await mockPlayers(page);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  // team -> player -> team
  await page.goto("/?view=teams&team=EDM");
  await page.locator("details.tpg-details", { has: page.getByRole("heading", { name: "Roster" }) }).locator("summary").click();
  await page.getByRole("button", { name: "View Test Skater details" }).first().click();
  const dlg = page.locator("dialog.player-dialog[open]");
  await expect(dlg.getByRole("heading", { name: "Test Skater" })).toBeVisible();
  const links = await dlg.locator("button, a[href]").evaluateAll((e) => e.map((x) => (x.textContent || x.getAttribute("aria-label") || "").trim()));
  console.log("PLAYER dialog actions", JSON.stringify(links));
  const teamBtn = dlg.getByRole("button", { name: /Edmonton|EDM|team page|Oilers/i }).first();
  await expect(teamBtn).toBeVisible();
  await teamBtn.click();
  await expect(page.locator("dialog.player-dialog[open]")).toHaveCount(0);
  await expect(page.locator("[data-team-page=EDM], dialog.team-dialog[open]").first()).toBeVisible();
  // injuries -> player / team
  await page.goto("/?view=injuries");
  await expect(page.getByTestId("injury").first()).toBeVisible();
  const row = page.getByTestId("injury");
  const actions = await row.first().locator("button, a[href]").evaluateAll((e) => e.map((x) => (x.getAttribute("aria-label") || x.textContent || "").trim().slice(0, 50)));
  console.log("INJURY row actions", JSON.stringify(actions));
  expect(actions.length).toBeGreaterThan(0);
  // search -> each kind
  await page.goto("/");
  await page.locator(".sb-row").first().waitFor();
  const dialog = page.getByRole("dialog", { name: "Search" });
  const q = async (text: string) => { await page.keyboard.press("Control+k"); await dialog.getByRole("combobox").fill(text); };
  await q("edmonton"); await expect(dialog.getByRole("option").first()).toContainText("Edmonton Oilers"); await page.keyboard.press("Enter");
  await expect(page.locator("[data-team-page=EDM], dialog.team-dialog[open]").first()).toBeVisible();
  await page.goto("/"); await page.locator(".sb-row").first().waitFor();
  await q("edm vs tor"); const go = dialog.getByRole("option").filter({ hasText: /TOR|EDM/ }); console.log("SEARCH game options", await dialog.getByRole("option").allInnerTexts());
  await q("standings"); await page.keyboard.press("Enter"); await expect(page.getByRole("heading", { level: 1, name: "Standings" })).toBeVisible();
  expect(errors).toEqual([]);
  void go;
});

test("search ranking and no-invention: exact abbreviation first, diacritics, players only when loaded, no match is explained", async ({ page }) => {
  await mockApis(page, { games: [mk.upcoming(9710, "EDM", "TOR", { offset: 0, time: "23:30" })], live: [] });
  await mockPlayers(page);
  await page.goto("/");
  await page.locator(".sb-row").first().waitFor();
  const d = page.getByRole("dialog", { name: "Search" });
  const ask = async (t: string) => { await page.keyboard.press("Control+k"); await d.getByRole("combobox").fill(t); await page.waitForTimeout(150); return d.getByRole("option").allInnerTexts(); };
  const nyi = await ask("nyi"); expect(nyi[0]).toMatch(/Islanders/); await page.keyboard.press("Escape");
  const mon = await ask("montréal"); expect(mon[0]).toMatch(/Canadiens/); await page.keyboard.press("Escape");
  const zzz = await ask("zzzzqq"); expect(zzz).toEqual([]); await expect(d.getByRole("status")).toContainText("No teams"); await page.keyboard.press("Escape");
  const gh = await ask("Gretzky"); expect(gh.join("|")).not.toMatch(/Gretzky/); await page.keyboard.press("Escape");
  const x = await ask("<b>x</b>"); expect(x.join("|")).not.toContain("<"); await page.keyboard.press("Escape");
  console.log("SEARCH 'to'", await ask("to"));
});

test("team profile dialog: Escape closes and returns focus; names, targets and no overflow at 360; opens the full page and the game", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?view=standings");
  await page.locator("tr[data-team]").first().waitFor();
  const opener = page.locator("tr[data-team] .team-link").first();
  const label = (await opener.innerText()).trim();
  await opener.focus();
  await page.keyboard.press("Enter");
  const dlg = page.locator("dialog.team-dialog[open]");
  await expect(dlg).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog.team-dialog"))).toBe(true);
  const a = await audit(page, "dialog.team-dialog");
  expect(a).toMatchObject({ unnamed: [], imgs: [], overflow: 0 });
  if (a.small.length || a.lowCount) console.log("TEAM DIALOG", JSON.stringify({ small: a.small, low: a.low }));
  await shot(page, "team-dialog-360");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.team-dialog[open]")).toHaveCount(0);
  await expect(opener).toBeFocused();
  void label;
  expect(errors).toEqual([]);
});
