import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import teams from "../../src/data/teams.json" with { type: "json" };
import { buildInjuryReport, parseEspnInjuries } from "../../src/lib/injuries.mjs";
import { goTo } from "./nav";

const season = manifest.current;
const espn = JSON.parse(readFileSync("tests/fixtures/espn-injuries.json", "utf8"));
const names = parseEspnInjuries(espn, teams as never).map((i: { name: string }) => i.name);
const sk = (name: string, gp: number, goals: number, assists: number, shots: number) => ({ skaterFullName: name, gamesPlayed: gp, goals, assists, shots, plusMinus: 0, penaltyMinutes: 0, timeOnIcePerGame: 1200, teamAbbrevs: "TOR" });
const letters = (i: number) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
const filler = (n: number, base: number) => Array.from({ length: n }, (_, i) => sk(`Filler ${letters(i)}`, 10, base + (i % 5), i % 4, 20 + i));
// The first injured player is a star this season; the second has one game this season but a big last season; the third has no history at all.
const skaters = [...filler(40, 0), sk(names[0], 7, 8, 8, 45), sk(names[1], 1, 0, 0, 2)];
const prevSkaters = [...filler(40, 6), sk(names[1], 75, 60, 70, 300)];
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const report = buildInjuryReport({ espn, teams, today, season, skaters, prevSkaters });

// A 1x1 transparent PNG stands in for ESPN's player pictures.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function open(page: Page, body: unknown = report) {
  await page.route("**/a.espncdn.com/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/injuries/${season}`, (route) => route.fulfill({ json: body }));
  await page.goto("/");
  await goTo(page, "Injury report");
  await expect(page.getByRole("heading", { name: "Injury report", level: 1 })).toBeVisible();
}

test("each injury shows the type, how serious it is, when the player may be back, and his impact", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("inj-counts")).toContainText(String(report.counts.total));
  const first = page.getByTestId("injury").filter({ hasText: names[0] });
  await expect(first).toContainText(names[0]);
  await expect(first.locator(".inj-sev")).toHaveText(/Estimate: (Day-to-day|Short-term|Moderate|Long-term|Season-ending)/);
  await expect(first.locator(".inj-facts")).toContainText("Injury");
  await expect(first.locator(".inj-facts")).toContainText("Back");
  await expect(first.locator(".inj-impact")).toContainText(/High impact|Medium impact|Low impact/);
  await expect(first.locator(".inj-impact")).toContainText("this season");
  // The most impactful injured player (here: the one with the big last season) comes first, the star of this season next.
  await expect(page.getByTestId("injury").first()).toContainText(names[1]);
  const levels = await page.getByTestId("injury").evaluateAll((els) => els.map((e) => e.getAttribute("data-impact")));
  expect(levels[0]).toBe("high");
});

test("impact falls back to last season when there are no earlier games this season, and says so when there is no history", async ({ page }) => {
  await open(page);
  const card = (name: string) => page.getByTestId("injury").filter({ hasText: name });
  await expect(card(names[1]).locator(".inj-impact")).toContainText("games last season");
  await expect(card(names[1]).locator(".inj-impact")).toContainText(/High impact/);
  await expect(card(names[3]).locator(".inj-impact")).toContainText("No earlier games to judge by");
});

test("the team, seriousness and sort controls narrow and reorder the list", async ({ page }) => {
  await open(page);
  const all = await page.getByTestId("injury").count();
  await page.getByLabel("Team", { exact: true }).selectOption("ANA");
  const ana = await page.getByTestId("injury").count();
  expect(ana).toBeGreaterThan(0);
  expect(ana).toBeLessThan(all);
  expect(await page.getByTestId("injury").evaluateAll((els) => els.every((e) => e.getAttribute("data-team") === "ANA"))).toBe(true);
  await page.getByLabel("Team", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "Long-term / season" }).click();
  expect(await page.getByTestId("injury").evaluateAll((els) => els.every((e) => /Long-term|Season-ending/.test(e.querySelector(".inj-sev")!.textContent ?? "")))).toBe(true);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Sort").selectOption("team");
  const teamsInOrder = await page.getByTestId("injury").evaluateAll((els) => els.map((e) => e.getAttribute("data-team")));
  expect(teamsInOrder).toEqual([...teamsInOrder].sort((a, b) => ((teams as { id: string; name: string }[]).find((t) => t.id === a)!.name).localeCompare((teams as { id: string; name: string }[]).find((t) => t.id === b)!.name)));
});

test("a team tile in Teams hit hardest filters to that team", async ({ page }) => {
  await open(page);
  const tile = page.locator(".inj-team").first();
  const code = (await tile.locator("b").innerText()).trim();
  await tile.click();
  expect(await page.getByTestId("injury").evaluateAll((els, c) => els.every((e) => e.getAttribute("data-team") === c), code)).toBe(true);
});

test("the injury report fits a 360px phone with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await open(page);
  await expect(page.getByTestId("injury").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
});

test("an unavailable report says so instead of showing nothing", async ({ page }) => {
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/injuries/${season}`, (route) => route.fulfill({ status: 502, body: "{}" }));
  await page.goto("/");
  await goTo(page, "Injury report");
  await expect(page.getByText(/injury report is unavailable/i)).toBeVisible();
});

test("each injury has the player's picture, and initials stand in when there is none", async ({ page }) => {
  await open(page);
  const card = page.getByTestId("injury").filter({ hasText: names[0] });
  await expect(card.getByTestId("inj-headshot")).toHaveAttribute("src", /espncdn\.com/);
  expect(await card.getByTestId("inj-headshot").evaluate((e) => (e as HTMLImageElement).width)).toBe(48);
  const none = { ...report, items: report.items.map((i: { headshot: string | null }, k: number) => (k === 0 ? { ...i, headshot: null } : i)) };
  await page.unroute(`**/api/injuries/${season}`);
  await page.route(`**/api/injuries/${season}`, (route) => route.fulfill({ json: none }));
  await page.reload();
  await goTo(page, "Injury report");
  await expect(page.getByTestId("inj-headshot-fallback").first()).toHaveText(/^[A-Z]{1,2}$/);
});

test("each card's drawing follows where the player is hurt: the named part, or a shrug when the team is not saying", async ({ page }) => {
  await open(page);
  const art = async (name: string) => page.getByTestId("injury").filter({ hasText: name }).locator(".inj-figure").evaluate((e) => ({ zone: e.getAttribute("data-zone"), pose: e.getAttribute("data-pose"), label: e.getAttribute("aria-label") }));
  const knee = await art("Ryan Poehling"); // "Knee (lower body)"
  expect(knee.zone).toBe("knee");
  expect(knee.pose).toBe("ankle");
  expect(knee.label).toContain("Knee");
  const vague = await art("Pavel Mintyukov"); // "Lower Body" only: the team is not saying where, so no leg is drawn
  expect(vague.pose).toBe("skater-unknown");
  expect(vague.label).toBe("Injury location for Pavel Mintyukov: Lower body (not specified)");
  expect((await art("Jeff Malott")).pose).toBe("skater-unknown"); // illness
});

test("teams with their own drawn set use it; Utah and Seattle have their own; the others get the recoloured neutral drawing", async ({ page }) => {
  const teamsOf = ["EDM", "UTA", "COL"]; // Colorado has no drawn set yet
  const base = report.items[0] as object;
  await open(page, { ...report, items: teamsOf.map((team, k) => ({ ...base, id: "t" + k, name: "Player " + k, team })) });
  await page.getByLabel("Team", { exact: true }).selectOption("all");
  const arts = page.getByTestId("inj-art");
  await expect(arts).toHaveCount(3);
  await expect(arts.nth(0)).toHaveAttribute("src", /\/injury\/teams\/EDM\//);
  await expect(arts.nth(1)).toHaveAttribute("src", /\/injury\/teams\/UTA\//);
  await expect(arts.nth(2)).toHaveAttribute("data-set", "neutral");
  expect(await arts.nth(0).evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBeGreaterThan(80);
});

test("the drawing is painted in the team's colours with its logo, and pops in once", async ({ page }) => {
  await open(page, { ...report, items: report.items.map((i: object) => ({ ...i, team: "COL" })) }); // Colorado has no drawn set yet: the neutral drawing is recoloured to burgundy
  await page.getByLabel("Team", { exact: true }).selectOption("all");
  const fig = page.getByTestId("injury").first().locator(".inj-figure");
  await expect(fig).toHaveClass(/ready/);
  const px = await fig.locator("canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let navy = 0, opaque = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { opaque++; if (d[i + 2] > d[i] + 40 && d[i + 2] > d[i + 1] + 25) navy++; }
    return { navy, opaque };
  });
  expect(px.opaque).toBeGreaterThan(5000);
  expect(px.navy / px.opaque).toBeLessThan(0.02); // the drawing is navy; on a burgundy team almost none of that blue is left
});

const withEdm = { ...report, items: report.items.map((i: { team: string }, k: number) => (k < 2 ? { ...i, team: "EDM" } : i)) };

test("the report opens on All teams (not one hard-coded team), and picking another team changes the list straight away", async ({ page }) => {
  await open(page, withEdm);
  await expect(page.getByLabel("Team", { exact: true })).toHaveValue("all");
  const teamsShown = () => page.getByTestId("injury").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-team")))]);
  expect((await teamsShown()).length).toBeGreaterThan(1);
  await page.getByLabel("Team", { exact: true }).selectOption("EDM");
  expect(await teamsShown()).toEqual(["EDM"]);
  const other = withEdm.items.find((i: { team: string }) => i.team !== "EDM")!.team;
  await page.getByLabel("Team", { exact: true }).selectOption(other);
  expect(await teamsShown()).toEqual([other]);
});

test("Teams hit hardest is a compact row of small chips", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const boxes = await page.locator(".inj-team").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.max(...boxes)).toBeLessThanOrEqual(46);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("poses: a goalie gets goalie gear, a skater does not, and every injury has a pose", async ({ page }) => {
  const rep = { ...withEdm, items: withEdm.items.map((i: { pos: string | null; team: string }, k: number) => (k === 0 ? { ...i, pos: "G", team: "TOR" } : k === 1 ? { ...i, pos: "D", team: "TOR" } : i)) };
  await open(page, rep);
  await page.getByLabel("Team", { exact: true }).selectOption("all");
  const poses = await page.getByTestId("injury").evaluateAll((els) => els.map((e) => ({ goalie: e.querySelector(".inj-figure")!.getAttribute("data-goalie"), pose: e.querySelector(".inj-figure")!.getAttribute("data-pose") })));
  expect(poses.every((p) => !!p.pose)).toBe(true);
  expect(poses.filter((p) => p.goalie === "1").every((p) => p.pose!.startsWith("goalie-"))).toBe(true);
  expect(poses.filter((p) => p.goalie === "0").every((p) => !p.pose!.startsWith("goalie-"))).toBe(true);
});

test.describe("the drawing's motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("it pops in once", async ({ page }) => {
    await open(page);
    const fig = page.getByTestId("injury").first().locator(".inj-figure");
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveClass(/play/);
    expect(await fig.getByTestId("inj-art").evaluate((e) => ({ name: getComputedStyle(e).animationName, count: getComputedStyle(e).animationIterationCount }))).toEqual({ name: "pose-pop", count: "1" });
  });
});

test("with motion off nothing animates", async ({ page }) => {
  await open(page);
  const fig = page.getByTestId("injury").first().locator(".inj-figure");
  await fig.scrollIntoViewIfNeeded();
  expect(await fig.getByTestId("inj-art").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
});


const card = (page: Page, name: string) => page.getByTestId("injury").filter({ hasText: name });

test("the provider's own status words are shown as chips, with its code and what the code means", async ({ page }) => {
  await open(page);
  await expect(card(page, "Jeff Malott").getByTestId("inj-status")).toHaveText("Day-To-Day");
  await expect(card(page, "Jeff Malott").getByTestId("inj-code")).toHaveCount(0); // the code repeats the status: shown once
  await expect(card(page, "Pavel Mintyukov").getByTestId("inj-status")).toHaveText("Injured Reserve");
  await expect(card(page, "Pavel Mintyukov").getByTestId("inj-code")).toHaveAttribute("title", "IR = injured reserve");
  await expect(card(page, "Dakota Joshua").getByTestId("inj-code")).toHaveText("IR-LT");
  await expect(card(page, "Dakota Joshua").getByTestId("inj-code")).toHaveAttribute("title", "IR-LT = long-term injured reserve");
  await expect(card(page, "Judd Caulfield").getByTestId("inj-code")).toHaveText("IR-NR");
  await expect(card(page, "Judd Caulfield").getByTestId("inj-code")).toHaveAttribute("title", /^Provider status code: IR-NR$/); // no definition we can state
  await expect(card(page, "Test Outman").getByTestId("inj-status")).toHaveText("Out");
  await expect(card(page, "Sample Suspendo").getByTestId("inj-status")).toHaveText("Suspension"); // an unknown status passes through as given
  await expect(page.getByTestId("inj-status-counts")).toContainText("11 IR");
  await expect(page.getByTestId("inj-status-counts")).toContainText("1 IR-LT");
  await expect(page.getByTestId("inj-status-counts")).toContainText("3 Day-To-Day");
  await expect(page.getByTestId("inj-status-counts")).toContainText("1 Out");
  await expect(page.getByTestId("inj-status-counts")).toContainText("1 Other");
});

test("the app's own severity is labelled an estimate; no return date says so plainly; every row says when it was reported", async ({ page }) => {
  await open(page);
  const out = card(page, "Test Outman");
  await expect(out.locator(".inj-facts")).toContainText("No return date reported");
  await expect(out.locator(".inj-sev")).toHaveCount(0); // nothing to estimate from
  const m = card(page, "Pavel Mintyukov");
  await expect(m.locator(".inj-sev")).toHaveAttribute("title", /Estimated from the reported return date/);
  await expect(m.locator(".inj-facts")).toContainText(/Reported return date \(estimate\): Oct 29|Return date has passed \(Oct 29\)/);
  const rep = m.getByTestId("inj-reported");
  await expect(rep).toHaveText(/^Reported (just now|\d+ (min|h) ago|\d+ days? ago)$/);
  await expect(rep).toHaveAttribute("title", /Oct 23, 2026/);
  await expect(page.getByTestId("injury")).toHaveCount(await page.getByTestId("inj-reported").count());
  await expect(page.locator(".inj-source")).toContainText("updated");
});

test("a player links to his profile only when he is matched on the team's roster; otherwise plain text", async ({ page }) => {
  await page.route(`**/api/players/${season}/ANA`, (r) => r.fulfill({ json: { season, gameType: 2, updatedAt: new Date().toISOString(), skaters: [{ id: 8482112, name: "Pavel Mintyukov", team: "ANA", position: "D", gp: 3, goals: 0, assists: 1, shots: 2, plusMinus: 0, pim: 0 }], goalies: [] } }));
  await open(page);
  await page.getByLabel("Team", { exact: true }).selectOption("ANA");
  await expect(card(page, "Pavel Mintyukov").getByTestId("inj-player-link")).toHaveText("Pavel Mintyukov");
  await expect(card(page, "Ryan Poehling").getByTestId("inj-player-text")).toHaveText("Ryan Poehling");
  await expect(card(page, "Ryan Poehling").getByTestId("inj-player-link")).toHaveCount(0);
});

test("each figure names the player in its accessible label, beside the written injury", async ({ page }) => {
  await open(page);
  const c = card(page, "Ryan Poehling");
  await expect(c.getByRole("img", { name: /^Injury location for Ryan Poehling: / })).toBeVisible();
  await expect(c.locator(".inj-figure-wrap small")).toContainText("Knee");
});

test("Colorado, Montreal and San Jose have no drawn set and fall back to the neutral drawing by name", async ({ page }) => {
  const base = report.items[0] as object;
  await open(page, { ...report, items: ["COL", "MTL", "SJS"].map((team, k) => ({ ...base, id: "n" + k, name: "Neutral " + k, team })) });
  const arts = page.getByTestId("inj-art");
  await expect(arts).toHaveCount(3);
  for (let k = 0; k < 3; k++) await expect(arts.nth(k)).toHaveAttribute("data-set", "neutral");
});
