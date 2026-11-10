import { test } from "@playwright/test";
import { mockApis, mk } from "./fixtures-games";
const OUT = "/tmp/claude-0/-home-user-hockey-live/4e18fd4c-d9f5-58f4-a367-d2a96a19330f/scratchpad/p3-shots";
test("shots", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  test.setTimeout(90000);
  await mockApis(page, { games: [mk.final(9101, "CGY", "EDM", { offset: -3 }), mk.ot(9102, "EDM", "VAN", { offset: -2 }), mk.final(9103, "SEA", "EDM", { offset: -1, score: [1, 4] }), mk.upcoming(9104, "EDM", "LAK", { offset: 1 })] });
  await page.route("**/api/players/**", (r) => r.fulfill({ json: { season: 0, gameType: 2, updatedAt: new Date().toISOString(), skaters: [{ id: 8478402, name: "Connor McDavid", team: "EDM", position: "C", gp: 10, goals: 6, assists: 12, shots: 1, plusMinus: 1, pim: 0, toi: 21.5, headshot: "" }, { id: 8480800, name: "Evan Bouchard", team: "EDM", position: "D", gp: 10, goals: 2, assists: 9, shots: 1, plusMinus: 1, pim: 0, toi: 23.9, headshot: "" }], goalies: [{ id: 8479973, name: "Stuart Skinner", team: "EDM", position: "G", gp: 8, goals: 0, assists: 0, shots: 0, plusMinus: 0, pim: 0, toi: 0, headshot: "", savePct: 0.915 }] } }));
  for (const [w, h, tag] of [[390, 844, "phone"], [1440, 1000, "desktop"]] as const) for (const scheme of ["dark", "light"] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?view=teams&team=EDM");
    await page.getByRole("heading", { level: 2, name: "Overview" }).waitFor();
    for (const s of await page.locator("details.tpg-details:visible > summary").all()) await s.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/team-${tag}-${scheme}.png`, fullPage: true });
  }
});
