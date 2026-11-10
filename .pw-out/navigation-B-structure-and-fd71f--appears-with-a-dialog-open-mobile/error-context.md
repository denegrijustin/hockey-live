# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> B. structure and accessibility >> no second navigation appears with a dialog open
- Location: tests/browser/navigation.spec.ts:317:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.tm-card [data-team-link]').first()

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "Skip to dashboard" [ref=e3] [cursor=pointer]:
    - /url: "#main"
  - region "Today's games" [ref=e4]:
    - button "TODAY 10 games" [ref=e5] [cursor=pointer]:
      - generic [ref=e6]: TODAY
      - generic [ref=e7]: 10 games
      - generic [aria-hidden] [ref=e8]: ▾
  - banner [ref=e9]:
    - link "Iceboard home" [ref=e10] [cursor=pointer]:
      - /url: /
      - generic [ref=e11]:
        - text: Ⅱ
        - generic [ref=e12]: ↗
      - generic [ref=e13]: ICEBOARD
    - generic [ref=e14]:
      - status [ref=e15]:
        - generic [ref=e17]: saved copy
      - generic [ref=e18]:
        - text: Season
        - combobox "Season" [ref=e19]:
          - option "2026–27" [selected]
          - option "2025–26"
  - main [ref=e20]:
    - navigation "Main" [ref=e21]:
      - button "Home" [ref=e22] [cursor=pointer]:
        - generic [aria-hidden] [ref=e26]: Home
      - button "Games" [ref=e27] [cursor=pointer]:
        - generic [aria-hidden] [ref=e34]: Games
      - button "Standings" [ref=e35] [cursor=pointer]:
        - generic [aria-hidden] [ref=e39]: Standings
      - button "Teams" [ref=e40] [cursor=pointer]:
        - generic [aria-hidden] [ref=e46]: Teams
      - button "More" [ref=e47] [cursor=pointer]:
        - generic [aria-hidden] [ref=e52]: More
    - status [ref=e53]:
      - generic [ref=e54]: Live scores unavailable. Showing saved data.
      - button "Retry" [ref=e55] [cursor=pointer]
    - region "Teams" [ref=e57]:
      - generic [ref=e59]:
        - heading "Teams" [level=1] [ref=e61]
        - button "Team schedules" [ref=e63] [cursor=pointer]
      - searchbox "Find a team" [ref=e70]
      - generic "My teams" [ref=e71]:
        - heading "My teams" [level=2] [ref=e72]
        - list [ref=e73]:
          - listitem [ref=e74]:
            - button "Chicago Blackhawks 9–16–0 · 18 pts" [ref=e75] [cursor=pointer]:
              - generic [ref=e76]:
                - generic [ref=e77]: Chicago Blackhawks
                - generic [ref=e78]: 9–16–0 · 18 pts
          - listitem [ref=e82]:
            - button "Edmonton Oilers 10–10–0 · 20 pts" [ref=e83] [cursor=pointer]:
              - generic [ref=e84]:
                - generic [ref=e85]: Edmonton Oilers
                - generic [ref=e86]: 10–10–0 · 20 pts
          - listitem [ref=e90]:
            - button "Minnesota Wild 16–5–0 · 32 pts" [ref=e91] [cursor=pointer]:
              - generic [ref=e92]:
                - generic [ref=e93]: Minnesota Wild
                - generic [ref=e94]: 16–5–0 · 32 pts
      - generic [ref=e98]:
        - heading "Eastern Conference" [level=2] [ref=e99]
        - generic "Atlantic Division" [ref=e100]:
          - heading "Atlantic Division" [level=3] [ref=e101]
          - list [ref=e102]:
            - listitem [ref=e103]:
              - button "Boston Bruins 7–3–0 · 14 pts" [ref=e104] [cursor=pointer]:
                - generic [ref=e105]:
                  - generic [ref=e106]: Boston Bruins
                  - generic [ref=e107]: 7–3–0 · 14 pts
            - listitem [ref=e111]:
              - button "Buffalo Sabres 2–7–0 · 4 pts" [ref=e112] [cursor=pointer]:
                - generic [ref=e113]:
                  - generic [ref=e114]: Buffalo Sabres
                  - generic [ref=e115]: 2–7–0 · 4 pts
            - listitem [ref=e119]:
              - button "Detroit Red Wings 3–2–0 · 6 pts" [ref=e120] [cursor=pointer]:
                - generic [ref=e121]:
                  - generic [ref=e122]: Detroit Red Wings
                  - generic [ref=e123]: 3–2–0 · 6 pts
            - listitem [ref=e127]:
              - button "Florida Panthers 3–3–0 · 6 pts" [ref=e128] [cursor=pointer]:
                - generic [ref=e129]:
                  - generic [ref=e130]: Florida Panthers
                  - generic [ref=e131]: 3–3–0 · 6 pts
            - listitem [ref=e135]:
              - button "Montréal Canadiens 2–2–0 · 4 pts" [ref=e136] [cursor=pointer]:
                - generic [ref=e137]:
                  - generic [ref=e138]: Montréal Canadiens
                  - generic [ref=e139]: 2–2–0 · 4 pts
            - listitem [ref=e143]:
              - button "Ottawa Senators 4–4–0 · 8 pts" [ref=e144] [cursor=pointer]:
                - generic [ref=e145]:
                  - generic [ref=e146]: Ottawa Senators
                  - generic [ref=e147]: 4–4–0 · 8 pts
            - listitem [ref=e151]:
              - button "Tampa Bay Lightning 8–5–0 · 16 pts" [ref=e152] [cursor=pointer]:
                - generic [ref=e153]:
                  - generic [ref=e154]: Tampa Bay Lightning
                  - generic [ref=e155]: 8–5–0 · 16 pts
            - listitem [ref=e159]:
              - button "Toronto Maple Leafs 6–6–0 · 12 pts" [ref=e160] [cursor=pointer]:
                - generic [ref=e161]:
                  - generic [ref=e162]: Toronto Maple Leafs
                  - generic [ref=e163]: 6–6–0 · 12 pts
        - generic "Metropolitan Division" [ref=e167]:
          - heading "Metropolitan Division" [level=3] [ref=e168]
          - list [ref=e169]:
            - listitem [ref=e170]:
              - button "Carolina Hurricanes 3–6–0 · 6 pts" [ref=e171] [cursor=pointer]:
                - generic [ref=e172]:
                  - generic [ref=e173]: Carolina Hurricanes
                  - generic [ref=e174]: 3–6–0 · 6 pts
            - listitem [ref=e178]:
              - button "Columbus Blue Jackets 5–1–0 · 10 pts" [ref=e179] [cursor=pointer]:
                - generic [ref=e180]:
                  - generic [ref=e181]: Columbus Blue Jackets
                  - generic [ref=e182]: 5–1–0 · 10 pts
            - listitem [ref=e186]:
              - button "New Jersey Devils 5–3–0 · 10 pts" [ref=e187] [cursor=pointer]:
                - generic [ref=e188]:
                  - generic [ref=e189]: New Jersey Devils
                  - generic [ref=e190]: 5–3–0 · 10 pts
            - listitem [ref=e194]:
              - button "New York Islanders 2–4–0 · 4 pts" [ref=e195] [cursor=pointer]:
                - generic [ref=e196]:
                  - generic [ref=e197]: New York Islanders
                  - generic [ref=e198]: 2–4–0 · 4 pts
            - listitem [ref=e202]:
              - button "New York Rangers 4–3–0 · 8 pts" [ref=e203] [cursor=pointer]:
                - generic [ref=e204]:
                  - generic [ref=e205]: New York Rangers
                  - generic [ref=e206]: 4–3–0 · 8 pts
            - listitem [ref=e210]:
              - button "Philadelphia Flyers 4–4–0 · 8 pts" [ref=e211] [cursor=pointer]:
                - generic [ref=e212]:
                  - generic [ref=e213]: Philadelphia Flyers
                  - generic [ref=e214]: 4–4–0 · 8 pts
            - listitem [ref=e218]:
              - button "Pittsburgh Penguins 4–4–0 · 8 pts" [ref=e219] [cursor=pointer]:
                - generic [ref=e220]:
                  - generic [ref=e221]: Pittsburgh Penguins
                  - generic [ref=e222]: 4–4–0 · 8 pts
            - listitem [ref=e226]:
              - button "Washington Capitals 5–8–0 · 10 pts" [ref=e227] [cursor=pointer]:
                - generic [ref=e228]:
                  - generic [ref=e229]: Washington Capitals
                  - generic [ref=e230]: 5–8–0 · 10 pts
      - generic [ref=e234]:
        - heading "Western Conference" [level=2] [ref=e235]
        - generic "Central Division" [ref=e236]:
          - heading "Central Division" [level=3] [ref=e237]
          - list [ref=e238]:
            - listitem [ref=e239]:
              - button "Chicago Blackhawks 9–16–0 · 18 pts" [ref=e240] [cursor=pointer]:
                - generic [ref=e241]:
                  - generic [ref=e242]: Chicago Blackhawks
                  - generic [ref=e243]: 9–16–0 · 18 pts
            - listitem [ref=e247]:
              - button "Colorado Avalanche 3–4–0 · 6 pts" [ref=e248] [cursor=pointer]:
                - generic [ref=e249]:
                  - generic [ref=e250]: Colorado Avalanche
                  - generic [ref=e251]: 3–4–0 · 6 pts
            - listitem [ref=e255]:
              - button "Dallas Stars 0–4–0 · 0 pts" [ref=e256] [cursor=pointer]:
                - generic [ref=e257]:
                  - generic [ref=e258]: Dallas Stars
                  - generic [ref=e259]: 0–4–0 · 0 pts
            - listitem [ref=e263]:
              - button "Minnesota Wild 16–5–0 · 32 pts" [ref=e264] [cursor=pointer]:
                - generic [ref=e265]:
                  - generic [ref=e266]: Minnesota Wild
                  - generic [ref=e267]: 16–5–0 · 32 pts
            - listitem [ref=e271]:
              - button "Nashville Predators 2–3–0 · 4 pts" [ref=e272] [cursor=pointer]:
                - generic [ref=e273]:
                  - generic [ref=e274]: Nashville Predators
                  - generic [ref=e275]: 2–3–0 · 4 pts
            - listitem [ref=e279]:
              - button "St. Louis Blues 4–8–0 · 8 pts" [ref=e280] [cursor=pointer]:
                - generic [ref=e281]:
                  - generic [ref=e282]: St. Louis Blues
                  - generic [ref=e283]: 4–8–0 · 8 pts
            - listitem [ref=e287]:
              - button "Utah Mammoth 7–5–0 · 14 pts" [ref=e288] [cursor=pointer]:
                - generic [ref=e289]:
                  - generic [ref=e290]: Utah Mammoth
                  - generic [ref=e291]: 7–5–0 · 14 pts
            - listitem [ref=e295]:
              - button "Winnipeg Jets 8–5–0 · 16 pts" [ref=e296] [cursor=pointer]:
                - generic [ref=e297]:
                  - generic [ref=e298]: Winnipeg Jets
                  - generic [ref=e299]: 8–5–0 · 16 pts
        - generic "Pacific Division" [ref=e303]:
          - heading "Pacific Division" [level=3] [ref=e304]
          - list [ref=e305]:
            - listitem [ref=e306]:
              - button "Anaheim Ducks 5–5–0 · 10 pts" [ref=e307] [cursor=pointer]:
                - generic [ref=e308]:
                  - generic [ref=e309]: Anaheim Ducks
                  - generic [ref=e310]: 5–5–0 · 10 pts
            - listitem [ref=e314]:
              - button "Calgary Flames 6–4–0 · 12 pts" [ref=e315] [cursor=pointer]:
                - generic [ref=e316]:
                  - generic [ref=e317]: Calgary Flames
                  - generic [ref=e318]: 6–4–0 · 12 pts
            - listitem [ref=e322]:
              - button "Edmonton Oilers 10–10–0 · 20 pts" [ref=e323] [cursor=pointer]:
                - generic [ref=e324]:
                  - generic [ref=e325]: Edmonton Oilers
                  - generic [ref=e326]: 10–10–0 · 20 pts
            - listitem [ref=e330]:
              - button "Los Angeles Kings 1–1–0 · 2 pts" [ref=e331] [cursor=pointer]:
                - generic [ref=e332]:
                  - generic [ref=e333]: Los Angeles Kings
                  - generic [ref=e334]: 1–1–0 · 2 pts
            - listitem [ref=e338]:
              - button "San Jose Sharks 5–6–0 · 10 pts" [ref=e339] [cursor=pointer]:
                - generic [ref=e340]:
                  - generic [ref=e341]: San Jose Sharks
                  - generic [ref=e342]: 5–6–0 · 10 pts
            - listitem [ref=e346]:
              - button "Seattle Kraken 6–6–0 · 12 pts" [ref=e347] [cursor=pointer]:
                - generic [ref=e348]:
                  - generic [ref=e349]: Seattle Kraken
                  - generic [ref=e350]: 6–6–0 · 12 pts
            - listitem [ref=e354]:
              - button "Vancouver Canucks 5–8–0 · 10 pts" [ref=e355] [cursor=pointer]:
                - generic [ref=e356]:
                  - generic [ref=e357]: Vancouver Canucks
                  - generic [ref=e358]: 5–8–0 · 10 pts
            - listitem [ref=e362]:
              - button "Vegas Golden Knights 7–6–0 · 14 pts" [ref=e363] [cursor=pointer]:
                - generic [ref=e364]:
                  - generic [ref=e365]: Vegas Golden Knights
                  - generic [ref=e366]: 7–6–0 · 14 pts
    - group [ref=e370]:
      - generic "How ratings & data work ↗" [ref=e371] [cursor=pointer]:
        - text: How ratings & data work
        - generic [ref=e372]: ↗
    - generic [ref=e373]:
      - generic [ref=e374]: ICEBOARD / Built for the games that matter.
      - generic [ref=e375]:
        - text: "Independent NHL dashboard · Data:"
        - link "NHL" [ref=e376] [cursor=pointer]:
          - /url: https://www.nhl.com
```

# Test source

```ts
  219 |     await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
  220 |     const before = await scrollY(page);
  221 |     await goTo(page, "teams");
  222 |     expect(await scrollY(page)).toBeLessThan(20);
  223 |     await page.goBack();
  224 |     await expectView(page, "standings");
  225 |     await expect.poll(() => scrollY(page)).toBeGreaterThan(before - 25);
  226 |     expect(Math.abs((await scrollY(page)) - before)).toBeLessThan(25);
  227 |     // Games too, then Forward lands at the top of a fresh entry only if it was never scrolled.
  228 |     await goTo(page, "games");
  229 |     await page.locator(".game-card").first().waitFor();
  230 |     await page.evaluate(() => window.scrollTo(0, 900));
  231 |     const g = await scrollY(page);
  232 |     expect(g).toBeGreaterThan(300);
  233 |     await goTo(page, "standings");
  234 |     await page.goBack();
  235 |     // The Games list keeps growing as cards and logos load, so land well down the page rather than on the exact pixel.
  236 |     await expect.poll(() => scrollY(page)).toBeGreaterThan(Math.min(g, 600) - 25);
  237 |   });
  238 | 
  239 |   test("the brand link goes to Home without a page load", async ({ page }) => {
  240 |     await open(page, "/?view=standings");
  241 |     await page.evaluate(() => ((window as any).__same = true));
  242 |     await page.getByRole("link", { name: "Iceboard home" }).click();
  243 |     await expectView(page, "scoreboard");
  244 |     expect(await page.evaluate(() => (window as any).__same)).toBe(true);
  245 |   });
  246 | });
  247 | 
  248 | test.describe("B. structure and accessibility", () => {
  249 |   test("exactly one visible Main navigation, and its active item matches every view id", async ({ page }) => {
  250 |     await open(page);
  251 |     for (const id of ALL) {
  252 |       await goTo(page, id);
  253 |       await expectView(page, id);
  254 |       await expect(nav(page)).toHaveCount(1);
  255 |       await expect(nav(page)).toBeVisible();
  256 |       await expect(page.locator(".tab-bar:visible, .side-nav:visible")).toHaveCount(1);
  257 |     }
  258 |   });
  259 | 
  260 |   test("a view change moves focus to the main region", async ({ page }) => {
  261 |     await open(page);
  262 |     await goTo(page, "standings");
  263 |     await expect(page.locator("main#main")).toBeFocused();
  264 |     await goTo(page, "yesterday");
  265 |     await expect(page.locator("main#main")).toBeFocused();
  266 |   });
  267 | 
  268 |   test("Teams has exactly one visible h1", async ({ page }) => {
  269 |     await open(page, "/?view=teams");
  270 |     await expect(page.locator("h1:visible")).toHaveCount(1);
  271 |   });
  272 | 
  273 |   test("the skip link jumps to the dashboard", async ({ page }) => {
  274 |     await open(page);
  275 |     await page.keyboard.press("Tab");
  276 |     const skip = page.getByRole("link", { name: "Skip to dashboard" });
  277 |     await expect(skip).toBeFocused();
  278 |     await page.keyboard.press("Enter");
  279 |     await expect(page).toHaveURL(/#main$/);
  280 |     await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("main");
  281 |   });
  282 | 
  283 |   test("the keyboard reaches the nav, Enter and Space activate it, and focus is visible", async ({ page }) => {
  284 |     await open(page);
  285 |     const item = nav(page).getByRole("button", { name: "Standings", exact: true });
  286 |     await item.focus();
  287 |     await page.keyboard.press("Tab"); // the next stop is still inside the navigation
  288 |     await page.keyboard.press("Shift+Tab");
  289 |     await expect(item).toBeFocused();
  290 |     const outline = await item.evaluate((e) => getComputedStyle(e).outlineStyle + " " + getComputedStyle(e).outlineWidth);
  291 |     expect(outline).not.toMatch(/^none|\b0px\b/);
  292 |     await page.keyboard.press("Enter");
  293 |     await expectView(page, "standings");
  294 |     const teamsItem = nav(page).getByRole("button", { name: "Teams", exact: true });
  295 |     await teamsItem.focus();
  296 |     await page.keyboard.press("Space");
  297 |     await expectView(page, "teams");
  298 |   });
  299 | 
  300 |   test("a keyboard tab sequence reaches every primary destination and More", async ({ page }) => {
  301 |     await open(page);
  302 |     const first = nav(page).getByRole("button").first();
  303 |     await first.focus();
  304 |     const seen: string[] = [];
  305 |     for (let i = 0; i < 5; i++) {
  306 |       seen.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? (document.activeElement?.textContent ?? "").trim()));
  307 |       await page.keyboard.press("Tab");
  308 |     }
  309 |     expect(seen.slice(0, 4)).toEqual(["Home", "Games", "Standings", "Teams"]);
  310 |   });
  311 | 
  312 |   test("document title follows every view", async ({ page }) => {
  313 |     await open(page);
  314 |     for (const id of ALL) { await goTo(page, id); await expect(page).toHaveTitle(titleOf(id)); }
  315 |   });
  316 | 
  317 |   test("no second navigation appears with a dialog open", async ({ page }) => {
  318 |     await open(page, "/?view=teams");
> 319 |     await page.locator(".tm-card [data-team-link]").first().click();
      |                                                             ^ Error: locator.click: Test timeout of 30000ms exceeded.
  320 |     await expect(page.locator("dialog.team-dialog")).toBeVisible();
  321 |     await expect(page.locator('nav[aria-label="Main"]')).toHaveCount(1);
  322 |     expect(await page.locator("dialog.team-dialog nav").count()).toBe(0);
  323 |   });
  324 | 
  325 |   test.describe("phone and tablet", () => {
  326 |     test.beforeEach(({ }, info) => test.skip(info.project.name !== "mobile", "tab bar"));
  327 | 
  328 |     test("the tab bar holds Home, Games, Standings, Teams and More", async ({ page }) => {
  329 |       await open(page);
  330 |       await expect(nav(page).getByRole("button")).toHaveText(["Home", "Games", "Standings", "Teams", "More"]);
  331 |       await expect(nav(page).getByRole("button").first()).toHaveAttribute("aria-label", "Home");
  332 |     });
  333 | 
  334 |     test("More: aria-expanded toggles, groups and items are listed, Escape and the scrim close it and return focus", async ({ page }) => {
  335 |       await open(page);
  336 |       const more = moreButton(page);
  337 |       await expect(more).toHaveAttribute("aria-haspopup", "dialog");
  338 |       await expect(more).toHaveAttribute("aria-expanded", "false");
  339 |       await more.click();
  340 |       await expect(more).toHaveAttribute("aria-expanded", "true");
  341 |       const menu = moreMenu(page);
  342 |       await expect(menu).toBeVisible();
  343 |       await expect(menu.locator("h2")).toHaveText(["Games & schedule", "League intelligence", "Players & teams", "Application"]);
  344 |       for (const id of MORE_ITEMS) await expect(menu.locator(".menu-item b", { hasText: new RegExp(`^${LABEL[id].replace(/[+]/g, "\\+")}$`) })).toHaveCount(1);
  345 |       await expect(menu.locator(".menu-item small").first()).not.toBeEmpty();
  346 |       await expect(menu.getByRole("button", { name: /My teams/ })).toBeVisible();
  347 |       await expect(menu.getByRole("button", { name: /Refresh data/ })).toBeVisible();
  348 |       await page.keyboard.press("Escape");
  349 |       await expect(menu).toBeHidden();
  350 |       await expect(more).toHaveAttribute("aria-expanded", "false");
  351 |       await expect(more).toBeFocused();
  352 |       await more.click();
  353 |       await expect(menu).toBeVisible();
  354 |       await page.locator(".menu-scrim").click({ position: { x: 20, y: 20 } });
  355 |       await expect(menu).toBeHidden();
  356 |       await expect(more).toBeFocused();
  357 |     });
  358 | 
  359 |     test("More is the current page for a More view, and picking one closes the menu", async ({ page }) => {
  360 |       await open(page);
  361 |       await expect(moreButton(page)).not.toHaveAttribute("aria-current", "page");
  362 |       await goTo(page, "picks");
  363 |       await expect(moreMenu(page)).toBeHidden();
  364 |       await expect(moreButton(page)).toHaveAttribute("aria-current", "page");
  365 |       await goTo(page, "standings");
  366 |       await expect(moreButton(page)).not.toHaveAttribute("aria-current", "page");
  367 |     });
  368 | 
  369 |     test("the More menu traps Tab in both directions", async ({ page }) => {
  370 |       await open(page);
  371 |       await moreButton(page).click();
  372 |       const menu = moreMenu(page);
  373 |       const buttons = menu.getByRole("button");
  374 |       const n = await buttons.count();
  375 |       await expect(buttons.first()).toBeFocused();
  376 |       await page.keyboard.press("Shift+Tab");
  377 |       await expect(buttons.nth(n - 1)).toBeFocused();
  378 |       await page.keyboard.press("Tab");
  379 |       await expect(buttons.first()).toBeFocused();
  380 |       for (let i = 0; i < n * 2 + 3; i++) {
  381 |         await page.keyboard.press("Tab");
  382 |         expect(await menu.evaluate((m) => m.contains(document.activeElement))).toBe(true);
  383 |       }
  384 |     });
  385 | 
  386 |     test("Enter on a More item opens it", async ({ page }) => {
  387 |       await open(page);
  388 |       await moreButton(page).focus();
  389 |       await page.keyboard.press("Enter");
  390 |       await moreItem(page, "Last night").focus();
  391 |       await page.keyboard.press("Enter");
  392 |       await expectView(page, "yesterday");
  393 |     });
  394 | 
  395 |     test("More > My teams opens the team chooser and Refresh data keeps the view", async ({ page }) => {
  396 |       await open(page);
  397 |       await moreButton(page).click();
  398 |       await moreMenu(page).getByRole("button", { name: /My teams/ }).click();
  399 |       await expect(page.locator("dialog.sheet[open]")).toBeVisible();
  400 |       await page.locator("dialog.sheet").getByRole("button", { name: "Done" }).click();
  401 |       await moreButton(page).click();
  402 |       await moreMenu(page).getByRole("button", { name: /Refresh data/ }).click();
  403 |       await expect(moreMenu(page)).toBeHidden();
  404 |       await expectView(page, "scoreboard");
  405 |     });
  406 | 
  407 |     test("Games has a PageHeader h1", async ({ page }) => {
  408 |       await open(page, "/?view=games");
  409 |       await expect(page.locator("header.page-header h1")).toHaveText("Games");
  410 |     });
  411 |   });
  412 | 
  413 |   test.describe("desktop", () => {
  414 |     test.beforeEach(({ }, info) => test.skip(info.project.name !== "desktop", "sidebar"));
  415 | 
  416 |     test("the sidebar lists the four destinations, then a heading and list per More group", async ({ page }) => {
  417 |       await open(page);
  418 |       const side = nav(page);
  419 |       await expect(side).toHaveClass(/side-nav/);
```