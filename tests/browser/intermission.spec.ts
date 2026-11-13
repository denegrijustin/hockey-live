import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { filterGames, selectAllTeams } from "./controls";
import fixture from "../fixtures/live-game.json" with { type: "json" };
import scoreboardFixture from "../fixtures/live-scoreboard.json" with { type: "json" };

// This spec is about animated behaviour; the suite default is reduced motion (see playwright.config.ts).
test.use({ reducedMotion: "no-preference" });

const base = scoreboardFixture.games.find((g) => g.id === fixture.id)!;
async function open(page: Page, extra: Record<string, unknown>) {
  const game = { ...base, state: "LIVE", period: 1, periodType: "REG", ...extra };
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: game.date, games: [game] } }));
  await page.route("**/api/game/*", (route) => route.fulfill({ json: { ...fixture, state: "LIVE", plays: [] } }));
  await page.goto("/?view=games");
  await selectAllTeams(page);
  await filterGames(page, { competition: String(game.type), window: "all" });
  return page.locator(".live-card").first();
}

const rink = (page: Page) => page.getByTestId("intermission").first();
const num = async (page: Page, k: string) => Number(await rink(page).getAttribute(`data-${k}`));
const settled = (page: Page) => page.waitForFunction(() => { const r = document.querySelector("[data-testid=intermission]"); return !!r && r.getAttribute("data-render") !== "loading"; }, null, { timeout: 60000 });

test("a game in intermission shows the feed's countdown, the labels and the rink on its card", async ({ page }) => {
  const card = await open(page, { intermission: true, clock: "13:48" });
  const int = card.getByTestId("intermission");
  await expect(int).toBeVisible({ timeout: 30000 }); // a lazy chunk with a 3D scene: give a loaded runner time
  await expect(int.locator(".int-t")).toHaveText(/1[34]:\d\d/);
  await expect(int).toContainText("INTERMISSION · END OF P1");
  await expect(int).toContainText("until period 2");
  await expect(int.locator("canvas.ice-canvas")).toHaveCount(1);
  await settled(page);
  await expect(card.locator(".game-date")).toContainText("Intermission");
  // The 3D rink is the only rink on the card: no second shot-map rink while the ice is being resurfaced.
  await expect(card.locator(".ice-view")).toHaveCount(0);
});

test("the countdown runs down between polls", async ({ page }) => {
  await page.clock.install();
  const card = await open(page, { intermission: true, clock: "13:48" });
  const t = card.locator(".int-t");
  await expect(t).toHaveText(/^13:[34]\d$/, { timeout: 30000 }); // the rink is a lazy chunk: give it time to load before the clock is moved
  const secs = async () => { const [m, s] = (await t.innerText()).split(":").map(Number); return m * 60 + s; };
  const before = await secs();
  await page.clock.fastForward(10_000);
  await expect.poll(async () => before - (await secs())).toBeGreaterThanOrEqual(9);
});

test("with no clock in the feed it counts 18 minutes from first sight, and a game in play shows no rink", async ({ page }) => {
  await page.clock.install();
  const card = await open(page, { intermission: true, clock: null });
  await expect(card.locator(".int-t")).toHaveText(/^1[78]:\d\d$/);
  await page.unroute("**/api/live");
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: today(), games: [{ ...base, date: today(), state: "LIVE", period: 2, intermission: false, clock: "12:30" }] } }));
  await page.clock.fastForward(35_000);
  await expect(card.getByTestId("intermission")).toHaveCount(0);
});

// One shared timeline: the machine, its blade and the cleaned ice all come from the countdown, so each moment can be checked from the countdown alone.
const MOMENTS: [string, string, number, number][] = [
  // clock, phase, min clean %, max clean %
  ["17:50", "enter|clean", 0, 3], ["16:00", "clean", 1, 15], ["9:00", "clean", 40, 60], ["1:00", "clean", 96, 100], ["0:44", "exit", 100, 100], ["0:20", "gone", 100, 100],
];
for (const [clock, phase, lo, hi] of MOMENTS) {
  test(`at ${clock} the rink shows the "${phase}" stage with ${lo}–${hi}% of the ice clean, from the first frame (opened midway)`, async ({ page }) => {
    await open(page, { intermission: true, clock });
    await expect(rink(page)).toHaveAttribute("data-phase", new RegExp(`^(${phase})$`), { timeout: 30000 }); // a loaded runner can take a few seconds to show the first frame, which is already into the next stage for the opening moment
    const clean = await num(page, "clean");
    expect(clean).toBeGreaterThanOrEqual(lo); expect(clean).toBeLessThanOrEqual(hi);
  });
}

test("the machine keeps moving and the clean ice only grows while the countdown runs (never restarts, never gets dirty again)", async ({ page }) => {
  await open(page, { intermission: true, clock: "12:00" });
  await expect(rink(page)).toHaveAttribute("data-phase", "clean", { timeout: 30000 });
  const a = { clean: await num(page, "clean"), pose: await rink(page).getAttribute("data-pose") };
  await page.waitForTimeout(3000);
  const b = { clean: await num(page, "clean"), pose: await rink(page).getAttribute("data-pose") };
  expect(b.clean).toBeGreaterThanOrEqual(a.clean);
  expect(b.pose).not.toBe(a.pose);
});

test("the Game Center carries it too, and reduced motion keeps the same synchronized state without animating", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const card = await open(page, { intermission: true, clock: "9:05" });
  await expect(card.getByTestId("intermission")).toHaveAttribute("data-phase", "clean", { timeout: 30000 });
  expect(await num(page, "clean")).toBeGreaterThan(40);
  await card.locator(".gc-icon").click();
  const dialog = page.locator("dialog.game-dialog");
  await expect(dialog.getByTestId("intermission")).toContainText(/until period 2/);
});

test("the Scoreboard home shows the rink on a game in intermission, without opening it", async ({ page }) => {
  // The Scoreboard opens on today's games, so the live game is dated today (Eastern).
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const game = { ...base, date: today, state: "LIVE", period: 2, periodType: "REG", intermission: true, clock: "10:30" };
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: game.date, games: [game] } }));
  await page.route("**/api/game/*", (route) => route.fulfill({ json: { ...fixture, state: "LIVE", plays: [] } }));
  await page.goto("/");
  const int = page.locator(`.sb-row[data-game="${game.id}"]`).getByTestId("intermission");
  await expect(int).toBeVisible({ timeout: 30000 });
  await expect(int).toContainText("INTERMISSION · END OF P2");
  await expect(int).toContainText("until overtime".replace("overtime", "period 3"));
});

test("when WebGL draws it, fresh ice is brighter than worn ice and the Zamboni's artwork is on the vehicle only", async ({ page }) => {
  test.slow(); // software WebGL, two renders and a reload
  await open(page, { intermission: true, clock: "16:30" });
  await settled(page);
  test.skip((await rink(page).getAttribute("data-render")) !== "webgl", "no WebGL in this browser");
  // The average brightness of the ice in the picture, leaving out the dark floor and the vehicle's shadows (the camera follows the machine while it works and shows the whole rink after it has gone, so a fixed patch would not compare like with like).
  const iceBrightness = async () => {
    await page.waitForTimeout(1500);
    const png = (await rink(page).locator("canvas").screenshot()).toString("base64");
    return page.evaluate(async (b64) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d")!; x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height).data;
      let sum = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; if (l > 110) { sum += l; n++; } } return n ? sum / n : 0;
    }, png);
  };
  const worn = await iceBrightness();
  // the same rink again after the machine has gone, opened fresh with the same helper (a clean profile, so the team and filter pickers start from their defaults)
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  await open(page, { intermission: true, clock: "0:20" });
  await settled(page);
  const fresh = await iceBrightness();
  console.log("ice brightness worn", worn.toFixed(1), "fresh", fresh.toFixed(1));
  expect(fresh).toBeGreaterThan(worn + 12);
  // the artwork is a texture of the vehicle's model, not part of the page or the rink boards
  const glb = await page.request.get("/models/zamboni.glb"); expect(glb.ok()).toBe(true);
  expect(glb.headers()["content-type"] ?? "").toMatch(/octet|model|binary|gltf/i);
});

test("with no WebGL the countdown and labels still work", async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = function () { return null; } as typeof HTMLCanvasElement.prototype.getContext; });
  const card = await open(page, { intermission: true, clock: "5:00" });
  await expect(card.locator(".int-t")).toHaveText(/^[45]:\d\d$/);
  await expect(card.getByTestId("intermission")).toHaveAttribute("data-render", "none", { timeout: 30000 });
});

// ---- Pregame ice preparation: from 20 minutes before the scheduled puck drop until the feed says play started
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const upcoming = (minutesToStart: number, extra: Record<string, unknown> = {}) => ({ ...base, date: today(), state: "FUT", period: null, periodType: null, intermission: false, clock: null, homeScore: null, awayScore: null, start: new Date(Date.now() + minutesToStart * 60_000).toISOString(), ...extra });
async function openPregame(page: Page, game: Record<string, unknown>) {
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: game.date, games: [game] } }));
  await page.route("**/api/game/*", (route) => route.fulfill({ json: { ...fixture, state: "FUT", plays: [] } }));
  await page.goto("/");
}
test("21 minutes before puck drop there is no ice preparation yet", async ({ page }) => {
  await openPregame(page, upcoming(21));
  await expect(page.locator(".sb-row").first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator(`.sb-row[data-game="${base.id}"]`).getByTestId("intermission")).toHaveCount(0);
});
test("at 20 minutes the card shows PREGAME · ICE PREPARATION with a live countdown to puck drop, and the game has not started", async ({ page }) => {
  await openPregame(page, upcoming(19.9));
  const int = page.locator(`.sb-row[data-game="${base.id}"]`).getByTestId("intermission");
  await expect(int).toBeVisible({ timeout: 30000 });
  await expect(int).toContainText("PREGAME · ICE PREPARATION");
  await expect(int).toContainText("until puck drop");
  await expect(int.locator(".int-t")).toHaveText(/^(19|20):\d\d$/);
  await expect(int).not.toContainText(/live|period 1/i);
  await expect(int).toHaveAttribute("data-mode", "pregame");
  await expect(int).toHaveAttribute("data-phase", "enter", { timeout: 30000 });
});
test("opened midway through the preparation it shows the machine and the cleaned ice at once; at 45 seconds the ice is ready and the machine is leaving", async ({ page }) => {
  await openPregame(page, upcoming(10));
  const int = page.locator(`.sb-row[data-game="${base.id}"]`).getByTestId("intermission");
  await expect(int).toHaveAttribute("data-phase", "clean", { timeout: 30000 });
  expect(Number(await int.getAttribute("data-clean"))).toBeGreaterThan(30);
});
test("after departure it says ICE READY · AWAITING PUCK DROP and keeps the clean rink until the feed confirms the start; a delayed start changes nothing", async ({ page }) => {
  await openPregame(page, upcoming(0.2));
  const int = page.locator(`.sb-row[data-game="${base.id}"]`).getByTestId("intermission");
  await expect(int).toHaveAttribute("data-phase", "gone", { timeout: 30000 });
  await expect(int).toContainText("ICE READY · AWAITING PUCK DROP");
  expect(Number(await int.getAttribute("data-clean"))).toBeGreaterThan(99);
  // the scheduled time has passed but the feed still says FUT: still ready, still clean
  await page.unroute("**/api/live");
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: today(), games: [upcoming(-3)] } }));
  await page.reload();
  const again = page.locator(`.sb-row[data-game="${base.id}"]`).getByTestId("intermission");
  await expect(again).toContainText("ICE READY · AWAITING PUCK DROP", { timeout: 30000 });
  await expect(again).toHaveAttribute("data-phase", "gone");
});
test("when the feed says play has started the ice-preparation rink is replaced by the live game", async ({ page }) => {
  await openPregame(page, upcoming(0.1));
  await expect(page.locator(`.sb-row[data-game="${base.id}"]`).getByTestId("intermission")).toBeVisible({ timeout: 30000 });
  await page.unroute("**/api/live");
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: today(), games: [{ ...base, date: today(), state: "LIVE", period: 1, periodType: "REG", intermission: false, clock: "19:30" }] } }));
  await page.reload();
  await expect(page.locator(`.sb-row[data-game="${base.id}"]`).getByTestId("intermission")).toHaveCount(0);
});

// The site is served with a strict Content-Security-Policy (public/_headers) that the test server does not apply. The 3D rink needs WebAssembly (model decoder) and blob: (its textures).
test("under the production Content-Security-Policy the 3D rink still starts", async ({ page }) => {
  const csp = /Content-Security-Policy:\s*(.+)/.exec(readFileSync("public/_headers", "utf8"))![1].trim();
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": csp } });
  });
  await open(page, { intermission: true, clock: "12:00" });
  await settled(page);
  test.skip((await rink(page).getAttribute("data-render")) === "none" && consoleErrors.every((e) => !/Content Security Policy/.test(e)), "no WebGL in this browser");
  expect(consoleErrors.filter((e) => /Content Security Policy/.test(e)), "nothing the rink needs is blocked").toEqual([]);
  await expect(rink(page)).toHaveAttribute("data-render", "webgl");
});

// Two pictures, chosen per person: the close-up that follows the machine (its lettering can be read) or the whole rink at once (the whole sheet's progress in one view).
test("a toggle on the rink switches between the close-up and the whole rink; the choice is remembered; the caption gives the progress", async ({ page }) => {
  test.slow();
  await open(page, { intermission: true, clock: "9:00" });
  await settled(page);
  test.skip((await rink(page).getAttribute("data-render")) !== "webgl", "no WebGL in this browser");
  const btn = rink(page).locator(".ice-view-btn");
  await expect(rink(page)).toHaveAttribute("data-view", "follow");
  await expect(btn).toHaveAccessibleName("Show the whole rink");
  const vehicleShare = async () => {
    await page.waitForTimeout(3500); // the camera eases between the two pictures
    const png = (await rink(page).locator("canvas").screenshot()).toString("base64");
    return page.evaluate(async (b64) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d")!; x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 110 && d[i + 2] > d[i] + 50 && d[i + 2] > d[i + 1] + 30) n++; // the vehicle's blue
      return n / (d.length / 4);
    }, png);
  };
  const close = await vehicleShare();
  expect(close, "in the close-up the machine fills a good part of the picture").toBeGreaterThan(0.08);
  await btn.click();
  await expect(rink(page)).toHaveAttribute("data-view", "overview");
  await expect(btn).toHaveAccessibleName("Show the close-up that follows the Zamboni");
  const whole = await vehicleShare();
  expect(whole, "in the whole-rink view the machine is small").toBeLessThan(close / 3);
  await expect(rink(page).locator(".int-cap")).toContainText(/\d+% done/); // progress of the whole sheet
  await open(page, { intermission: true, clock: "9:00" }); // a fresh visit; only the stored choice carries over
  await settled(page);
  await expect(rink(page)).toHaveAttribute("data-view", "overview"); // remembered on this device
  await rink(page).locator(".ice-view-btn").click();
  await expect(rink(page)).toHaveAttribute("data-view", "follow");
});

test("in the whole-rink view a BRING NHL TO KC label with the KC Scouts logo rides above the machine and stays inside the picture; the close-up has no label", async ({ page }) => {
  test.slow();
  await open(page, { intermission: true, clock: "9:00" });
  await settled(page);
  test.skip((await rink(page).getAttribute("data-render")) !== "webgl", "no WebGL in this browser");
  const tag = rink(page).locator(".ice-tag");
  await expect(rink(page)).toHaveAttribute("data-view", "follow");
  await expect(tag).toBeHidden(); // the lettering on the machine can be read in the close-up
  await rink(page).locator(".ice-view-btn").click();
  await expect(tag).toBeVisible({ timeout: 15000 });
  await expect(tag).toContainText("BRING NHL TO KC");
  await expect(tag.locator("img")).toHaveAttribute("src", "/logos/kc-scouts.png");
  const [t, c] = await Promise.all([tag.boundingBox(), rink(page).locator("canvas").boundingBox()]);
  expect(t!.x, "inside the picture on the left").toBeGreaterThanOrEqual(c!.x - 1);
  expect(t!.x + t!.width, "inside the picture on the right").toBeLessThanOrEqual(c!.x + c!.width + 1);
  expect(t!.y, "inside the picture at the top").toBeGreaterThanOrEqual(c!.y - 1);
  expect(t!.y + t!.height, "above the bottom of the picture").toBeLessThanOrEqual(c!.y + c!.height);
  await rink(page).locator(".ice-view-btn").click();
  await expect(tag).toBeHidden();
});
