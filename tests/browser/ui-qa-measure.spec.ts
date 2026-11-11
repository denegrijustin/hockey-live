// Measurement run (not an assertion suite): prints dial sizes, Team Stats / hero heights and close-button position after scroll.
// Run with QA_OUT=/abs/file.json to also write the numbers; used for docs/ui-qa-before.md and the "after" comparison.
import { test } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { openGameCenter, openTab, gaugeWaste, metrics, pinned, closeButtons, GAME_DIALOG, WIDTHS } from "./ui-qa-helpers";

for (const state of ["final", "live", "pregame"] as const) {
  for (const width of [...WIDTHS, 390]) {
    test(`measure ${state} @${width}`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "viewport is set per test");
      await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
      await openGameCenter(page, state);
      const out: Record<string, unknown> = { state, width };
      await page.waitForTimeout(400);
      out.overview = { ...(await metrics(page)), waste: (await gaugeWaste(page)).map((g) => `${g.label}:${g.w}x${g.h}/${g.parentW}(${g.ratio}) mates=${g.rowMates}`) };
      await openTab(page, "Team Stats");
      await page.waitForTimeout(400);
      out.teamStats = { ...(await metrics(page)), waste: (await gaugeWaste(page, `${GAME_DIALOG} [data-testid=gc-team-stats]`)).map((g) => `${g.label}:${g.w}x${g.h}/${g.parentW}(${g.ratio}) mates=${g.rowMates}`) };
      await openTab(page, "Overview");
      out.close = { buttons: await closeButtons(page), pinned: await pinned(page, [0, 600, 100000]) };
      const line = JSON.stringify(out);
      console.log("QA " + line);
      if (process.env.QA_OUT) appendFileSync(process.env.QA_OUT, line + "\n");
    });
  }
}
