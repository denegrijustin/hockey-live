import { expect, test } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

const season = manifest.current;
const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
let n = 0;
const play = (type: string, team: string, x: number, y: number, period: number, time: string) => ({ id: ++n, order: n, type, team, x, y, period, periodType: "REG", time, player: "Skater" });
const game = { season, type: 2, date: day, scheduleState: "OK", venue: "Test Arena", round: null, end: "", id: 9601, start: new Date(Date.now() - 3600_000).toISOString(), state: "LIVE", away: "EDM", home: "FLA", awayScore: 2, homeScore: 0, period: 2, periodType: "REG", clock: "10:00", broadcasts: ["SN", "TVAS", "CITY"] };
const plays = [
  ...Array.from({ length: 5 }, (_, i) => play("shot-on-goal", "FLA", 70 - i, 4 - i, 1, `${3 + i}:00`)),
  ...Array.from({ length: 5 }, (_, i) => play("shot-on-goal", "EDM", -70 + i, i - 2, 1, `${4 + i}:00`)),
  play("goal", "EDM", -80, 0, 1, "12:00"), play("goal", "EDM", -82, 2, 2, "03:00"),
];

for (const width of [1100, 390]) {
  test(`Game Center at ${width}px: the TV logos sit inside their pill, and watchability is a bar above the projected score (not a line in the header)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games: [game] };
    await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
    await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
    await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
    await page.route("**/data/moneypuck/**/shots/**", (route) => route.fulfill({ status: 404, body: "{}" }));
    await page.route("**/api/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
    await page.route("**/api/game/*", (route) => route.fulfill({ json: { ...game, plays, shots: plays, goals: plays.filter((p) => p.type === "goal"), stats: [] } }));
    await page.goto("/");
    await page.locator(`.sb-row[data-game="${game.id}"] .gc-icon`).click();
    const dialog = page.locator("dialog.game-dialog[open]");
    await expect(dialog.locator(".gx-net")).toBeVisible();
    const pill = (await dialog.locator(".gx-net").boundingBox())!;
    const logos = await dialog.locator(".gx-net .network-logo").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
    expect(logos.length).toBeGreaterThanOrEqual(2);
    for (const l of logos) { expect(l.l).toBeGreaterThanOrEqual(pill.x - 0.5); expect(l.r).toBeLessThanOrEqual(pill.x + pill.width + 0.5); expect(l.t).toBeGreaterThanOrEqual(pill.y - 0.5); expect(l.b).toBeLessThanOrEqual(pill.y + pill.height + 0.5); }
    // watchability: no header line; a bar in the overview, above the projected final score
    await expect(dialog.locator(".gx-watch")).toHaveCount(0);
    const watch = dialog.getByTestId("gc-watch");
    await expect(watch).toBeVisible();
    await expect(watch).toContainText("Watchability");
    await expect(watch).toHaveAttribute("aria-label", /Watchability: \d+ out of 100/);
    expect(await watch.locator(".vs-track").count()).toBe(1); // the same bar as the other tiles
    const model = dialog.locator(".gr-model, .gr-hero").first();
    await expect(model).toBeVisible({ timeout: 30000 });
    const [w, m] = [await watch.boundingBox(), await model.boundingBox()];
    expect(w!.y + w!.height, "above the projected score").toBeLessThanOrEqual(m!.y + 1);
  });
}
