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
    - generic [ref=e5]: TODAY
    - list [ref=e7]:
      - listitem [ref=e8]:
        - button "Winnipeg Jets at Anaheim Ducks , 8:00 pm. Open the Game Center." [ref=e9] [cursor=pointer]:
          - generic [ref=e10]: WPG
          - generic [ref=e11]: "@"
          - generic [ref=e12]: ANA
          - generic [ref=e13]: 8:00 PM
      - listitem [ref=e14]:
        - button "Boston Bruins at Calgary Flames , 8:00 pm. Open the Game Center." [ref=e15] [cursor=pointer]:
          - generic [ref=e16]: BOS
          - generic [ref=e17]: "@"
          - generic [ref=e18]: CGY
          - generic [ref=e19]: 8:00 PM
      - listitem [ref=e20]:
        - button "Calgary Flames at Colorado Avalanche , 8:00 pm. Open the Game Center." [ref=e21] [cursor=pointer]:
          - generic [ref=e22]: CGY
          - generic [ref=e23]: "@"
          - generic [ref=e24]: COL
          - generic [ref=e25]: 8:00 PM
      - listitem [ref=e26]:
        - button "Chicago Blackhawks at Colorado Avalanche , 8:00 pm. Open the Game Center." [ref=e27] [cursor=pointer]:
          - generic [ref=e28]: CHI
          - generic [ref=e29]: "@"
          - generic [ref=e30]: COL
          - generic [ref=e31]: 8:00 PM
      - listitem [ref=e32]:
        - button "Columbus Blue Jackets at Detroit Red Wings , 8:00 pm. Open the Game Center." [ref=e33] [cursor=pointer]:
          - generic [ref=e34]: CBJ
          - generic [ref=e35]: "@"
          - generic [ref=e36]: DET
          - generic [ref=e37]: 8:00 PM
      - listitem [ref=e38]:
        - button "Detroit Red Wings at Los Angeles Kings , 8:00 pm. Open the Game Center." [ref=e39] [cursor=pointer]:
          - generic [ref=e40]: DET
          - generic [ref=e41]: "@"
          - generic [ref=e42]: LAK
          - generic [ref=e43]: 8:00 PM
      - listitem [ref=e44]:
        - button "Florida Panthers at Los Angeles Kings , 8:00 pm. Open the Game Center." [ref=e45] [cursor=pointer]:
          - generic [ref=e46]: FLA
          - generic [ref=e47]: "@"
          - generic [ref=e48]: LAK
          - generic [ref=e49]: 8:00 PM
      - listitem [ref=e50]:
        - button "Minnesota Wild at Nashville Predators , 8:00 pm. Open the Game Center." [ref=e51] [cursor=pointer]:
          - generic [ref=e52]: MIN
          - generic [ref=e53]: "@"
          - generic [ref=e54]: NSH
          - generic [ref=e55]: 8:00 PM
      - listitem [ref=e56]:
        - button "Edmonton Oilers at Detroit Red Wings , 8:00 pm. Open the Game Center." [ref=e57] [cursor=pointer]:
          - generic [ref=e58]: EDM
          - generic [ref=e59]: "@"
          - generic [ref=e60]: DET
          - generic [ref=e61]: 8:00 PM
      - listitem [ref=e62]:
        - button "Chicago Blackhawks at Minnesota Wild , 8:00 pm. Open the Game Center." [ref=e63] [cursor=pointer]:
          - generic [ref=e64]: CHI
          - generic [ref=e65]: "@"
          - generic [ref=e66]: MIN
          - generic [ref=e67]: 8:00 PM
  - banner [ref=e68]:
    - link "Iceboard home" [ref=e69] [cursor=pointer]:
      - /url: /
      - generic [ref=e70]:
        - text: Ⅱ
        - generic [ref=e71]: ↗
      - generic [ref=e72]:
        - text: ICEBOARD
        - generic [ref=e73]: NHL GAME INTELLIGENCE
    - generic [ref=e74]:
      - status [ref=e75]:
        - generic [ref=e77]: saved copy
        - generic [ref=e78]: · 15s ago
      - generic [ref=e79]:
        - text: Season
        - combobox "Season" [ref=e80]:
          - option "2026–27" [selected]
          - option "2025–26"
  - main [ref=e81]:
    - navigation "Main" [ref=e82]:
      - list "Main destinations" [ref=e83]:
        - listitem [ref=e84]:
          - button "Home" [ref=e85] [cursor=pointer]
        - listitem [ref=e89]:
          - button "Games" [ref=e90] [cursor=pointer]
        - listitem [ref=e97]:
          - button "Standings" [ref=e98] [cursor=pointer]
        - listitem [ref=e102]:
          - button "Teams" [ref=e103] [cursor=pointer]
      - generic [ref=e109]:
        - heading "Games & schedule" [level=2] [ref=e110]
        - list [ref=e111]:
          - listitem [ref=e112]:
            - button "Last night" [ref=e113] [cursor=pointer]
          - listitem [ref=e116]:
            - button "Schedule" [ref=e117] [cursor=pointer]
      - generic [ref=e120]:
        - heading "League intelligence" [level=2] [ref=e121]
        - list [ref=e122]:
          - listitem [ref=e123]:
            - button "Team trends" [ref=e124] [cursor=pointer]
          - listitem [ref=e128]:
            - button "Playoff odds" [ref=e129] [cursor=pointer]
          - listitem [ref=e134]:
            - button "Picks" [ref=e135] [cursor=pointer]
          - listitem [ref=e140]:
            - button "NHL+" [ref=e141] [cursor=pointer]
          - listitem [ref=e144]:
            - button "NHL EDGE" [ref=e145] [cursor=pointer]
          - listitem [ref=e148]:
            - button "Imperialism map" [ref=e149] [cursor=pointer]
      - generic [ref=e153]:
        - heading "Players & teams" [level=2] [ref=e154]
        - list [ref=e155]:
          - listitem [ref=e156]:
            - button "Players" [ref=e157] [cursor=pointer]
          - listitem [ref=e161]:
            - button "Injury report" [ref=e162] [cursor=pointer]
    - generic [ref=e166]:
      - generic [ref=e167]:
        - generic [ref=e168]: 32 teams · 360 regular-season games ·
        - text: Snapshot Nov 10, 3:28 AM UTC · Update unavailable — showing the last received data.
      - button "↻ Refresh" [ref=e169] [cursor=pointer]
    - region "Teams" [ref=e171]:
      - generic [ref=e173]:
        - generic [ref=e174]:
          - paragraph [ref=e175]: ALL 32 CLUBS
          - heading "Teams" [level=1] [ref=e176]
        - button "Team schedules" [ref=e178] [cursor=pointer]
      - searchbox "Find a team" [ref=e185]
      - generic "My teams" [ref=e186]:
        - heading "My teams" [level=2] [ref=e187]
        - list [ref=e188]:
          - listitem [ref=e189]:
            - button "Chicago Blackhawks 9–16–0 · 18 pts" [ref=e190] [cursor=pointer]:
              - generic [ref=e191]:
                - generic [ref=e192]: Chicago Blackhawks
                - generic [ref=e193]: 9–16–0 · 18 pts
          - listitem [ref=e197]:
            - button "Edmonton Oilers 10–10–0 · 20 pts" [ref=e198] [cursor=pointer]:
              - generic [ref=e199]:
                - generic [ref=e200]: Edmonton Oilers
                - generic [ref=e201]: 10–10–0 · 20 pts
          - listitem [ref=e205]:
            - button "Minnesota Wild 16–5–0 · 32 pts" [ref=e206] [cursor=pointer]:
              - generic [ref=e207]:
                - generic [ref=e208]: Minnesota Wild
                - generic [ref=e209]: 16–5–0 · 32 pts
      - generic [ref=e213]:
        - heading "Eastern Conference" [level=2] [ref=e214]
        - generic "Atlantic Division" [ref=e215]:
          - heading "Atlantic Division" [level=3] [ref=e216]
          - list [ref=e217]:
            - listitem [ref=e218]:
              - button "Boston Bruins 7–3–0 · 14 pts" [ref=e219] [cursor=pointer]:
                - generic [ref=e220]:
                  - generic [ref=e221]: Boston Bruins
                  - generic [ref=e222]: 7–3–0 · 14 pts
            - listitem [ref=e226]:
              - button "Buffalo Sabres 2–7–0 · 4 pts" [ref=e227] [cursor=pointer]:
                - generic [ref=e228]:
                  - generic [ref=e229]: Buffalo Sabres
                  - generic [ref=e230]: 2–7–0 · 4 pts
            - listitem [ref=e234]:
              - button "Detroit Red Wings 3–2–0 · 6 pts" [ref=e235] [cursor=pointer]:
                - generic [ref=e236]:
                  - generic [ref=e237]: Detroit Red Wings
                  - generic [ref=e238]: 3–2–0 · 6 pts
            - listitem [ref=e242]:
              - button "Florida Panthers 3–3–0 · 6 pts" [ref=e243] [cursor=pointer]:
                - generic [ref=e244]:
                  - generic [ref=e245]: Florida Panthers
                  - generic [ref=e246]: 3–3–0 · 6 pts
            - listitem [ref=e250]:
              - button "Montréal Canadiens 2–2–0 · 4 pts" [ref=e251] [cursor=pointer]:
                - generic [ref=e252]:
                  - generic [ref=e253]: Montréal Canadiens
                  - generic [ref=e254]: 2–2–0 · 4 pts
            - listitem [ref=e258]:
              - button "Ottawa Senators 4–4–0 · 8 pts" [ref=e259] [cursor=pointer]:
                - generic [ref=e260]:
                  - generic [ref=e261]: Ottawa Senators
                  - generic [ref=e262]: 4–4–0 · 8 pts
            - listitem [ref=e266]:
              - button "Tampa Bay Lightning 8–5–0 · 16 pts" [ref=e267] [cursor=pointer]:
                - generic [ref=e268]:
                  - generic [ref=e269]: Tampa Bay Lightning
                  - generic [ref=e270]: 8–5–0 · 16 pts
            - listitem [ref=e274]:
              - button "Toronto Maple Leafs 6–6–0 · 12 pts" [ref=e275] [cursor=pointer]:
                - generic [ref=e276]:
                  - generic [ref=e277]: Toronto Maple Leafs
                  - generic [ref=e278]: 6–6–0 · 12 pts
        - generic "Metropolitan Division" [ref=e282]:
          - heading "Metropolitan Division" [level=3] [ref=e283]
          - list [ref=e284]:
            - listitem [ref=e285]:
              - button "Carolina Hurricanes 3–6–0 · 6 pts" [ref=e286] [cursor=pointer]:
                - generic [ref=e287]:
                  - generic [ref=e288]: Carolina Hurricanes
                  - generic [ref=e289]: 3–6–0 · 6 pts
            - listitem [ref=e293]:
              - button "Columbus Blue Jackets 5–1–0 · 10 pts" [ref=e294] [cursor=pointer]:
                - generic [ref=e295]:
                  - generic [ref=e296]: Columbus Blue Jackets
                  - generic [ref=e297]: 5–1–0 · 10 pts
            - listitem [ref=e301]:
              - button "New Jersey Devils 5–3–0 · 10 pts" [ref=e302] [cursor=pointer]:
                - generic [ref=e303]:
                  - generic [ref=e304]: New Jersey Devils
                  - generic [ref=e305]: 5–3–0 · 10 pts
            - listitem [ref=e309]:
              - button "New York Islanders 2–4–0 · 4 pts" [ref=e310] [cursor=pointer]:
                - generic [ref=e311]:
                  - generic [ref=e312]: New York Islanders
                  - generic [ref=e313]: 2–4–0 · 4 pts
            - listitem [ref=e317]:
              - button "New York Rangers 4–3–0 · 8 pts" [ref=e318] [cursor=pointer]:
                - generic [ref=e319]:
                  - generic [ref=e320]: New York Rangers
                  - generic [ref=e321]: 4–3–0 · 8 pts
            - listitem [ref=e325]:
              - button "Philadelphia Flyers 4–4–0 · 8 pts" [ref=e326] [cursor=pointer]:
                - generic [ref=e327]:
                  - generic [ref=e328]: Philadelphia Flyers
                  - generic [ref=e329]: 4–4–0 · 8 pts
            - listitem [ref=e333]:
              - button "Pittsburgh Penguins 4–4–0 · 8 pts" [ref=e334] [cursor=pointer]:
                - generic [ref=e335]:
                  - generic [ref=e336]: Pittsburgh Penguins
                  - generic [ref=e337]: 4–4–0 · 8 pts
            - listitem [ref=e341]:
              - button "Washington Capitals 5–8–0 · 10 pts" [ref=e342] [cursor=pointer]:
                - generic [ref=e343]:
                  - generic [ref=e344]: Washington Capitals
                  - generic [ref=e345]: 5–8–0 · 10 pts
      - generic [ref=e349]:
        - heading "Western Conference" [level=2] [ref=e350]
        - generic "Central Division" [ref=e351]:
          - heading "Central Division" [level=3] [ref=e352]
          - list [ref=e353]:
            - listitem [ref=e354]:
              - button "Chicago Blackhawks 9–16–0 · 18 pts" [ref=e355] [cursor=pointer]:
                - generic [ref=e356]:
                  - generic [ref=e357]: Chicago Blackhawks
                  - generic [ref=e358]: 9–16–0 · 18 pts
            - listitem [ref=e362]:
              - button "Colorado Avalanche 3–4–0 · 6 pts" [ref=e363] [cursor=pointer]:
                - generic [ref=e364]:
                  - generic [ref=e365]: Colorado Avalanche
                  - generic [ref=e366]: 3–4–0 · 6 pts
            - listitem [ref=e370]:
              - button "Dallas Stars 0–4–0 · 0 pts" [ref=e371] [cursor=pointer]:
                - generic [ref=e372]:
                  - generic [ref=e373]: Dallas Stars
                  - generic [ref=e374]: 0–4–0 · 0 pts
            - listitem [ref=e378]:
              - button "Minnesota Wild 16–5–0 · 32 pts" [ref=e379] [cursor=pointer]:
                - generic [ref=e380]:
                  - generic [ref=e381]: Minnesota Wild
                  - generic [ref=e382]: 16–5–0 · 32 pts
            - listitem [ref=e386]:
              - button "Nashville Predators 2–3–0 · 4 pts" [ref=e387] [cursor=pointer]:
                - generic [ref=e388]:
                  - generic [ref=e389]: Nashville Predators
                  - generic [ref=e390]: 2–3–0 · 4 pts
            - listitem [ref=e394]:
              - button "St. Louis Blues 4–8–0 · 8 pts" [ref=e395] [cursor=pointer]:
                - generic [ref=e396]:
                  - generic [ref=e397]: St. Louis Blues
                  - generic [ref=e398]: 4–8–0 · 8 pts
            - listitem [ref=e402]:
              - button "Utah Mammoth 7–5–0 · 14 pts" [ref=e403] [cursor=pointer]:
                - generic [ref=e404]:
                  - generic [ref=e405]: Utah Mammoth
                  - generic [ref=e406]: 7–5–0 · 14 pts
            - listitem [ref=e410]:
              - button "Winnipeg Jets 8–5–0 · 16 pts" [ref=e411] [cursor=pointer]:
                - generic [ref=e412]:
                  - generic [ref=e413]: Winnipeg Jets
                  - generic [ref=e414]: 8–5–0 · 16 pts
        - generic "Pacific Division" [ref=e418]:
          - heading "Pacific Division" [level=3] [ref=e419]
          - list [ref=e420]:
            - listitem [ref=e421]:
              - button "Anaheim Ducks 5–5–0 · 10 pts" [ref=e422] [cursor=pointer]:
                - generic [ref=e423]:
                  - generic [ref=e424]: Anaheim Ducks
                  - generic [ref=e425]: 5–5–0 · 10 pts
            - listitem [ref=e429]:
              - button "Calgary Flames 6–4–0 · 12 pts" [ref=e430] [cursor=pointer]:
                - generic [ref=e431]:
                  - generic [ref=e432]: Calgary Flames
                  - generic [ref=e433]: 6–4–0 · 12 pts
            - listitem [ref=e437]:
              - button "Edmonton Oilers 10–10–0 · 20 pts" [ref=e438] [cursor=pointer]:
                - generic [ref=e439]:
                  - generic [ref=e440]: Edmonton Oilers
                  - generic [ref=e441]: 10–10–0 · 20 pts
            - listitem [ref=e445]:
              - button "Los Angeles Kings 1–1–0 · 2 pts" [ref=e446] [cursor=pointer]:
                - generic [ref=e447]:
                  - generic [ref=e448]: Los Angeles Kings
                  - generic [ref=e449]: 1–1–0 · 2 pts
            - listitem [ref=e453]:
              - button "San Jose Sharks 5–6–0 · 10 pts" [ref=e454] [cursor=pointer]:
                - generic [ref=e455]:
                  - generic [ref=e456]: San Jose Sharks
                  - generic [ref=e457]: 5–6–0 · 10 pts
            - listitem [ref=e461]:
              - button "Seattle Kraken 6–6–0 · 12 pts" [ref=e462] [cursor=pointer]:
                - generic [ref=e463]:
                  - generic [ref=e464]: Seattle Kraken
                  - generic [ref=e465]: 6–6–0 · 12 pts
            - listitem [ref=e469]:
              - button "Vancouver Canucks 5–8–0 · 10 pts" [ref=e470] [cursor=pointer]:
                - generic [ref=e471]:
                  - generic [ref=e472]: Vancouver Canucks
                  - generic [ref=e473]: 5–8–0 · 10 pts
            - listitem [ref=e477]:
              - button "Vegas Golden Knights 7–6–0 · 14 pts" [ref=e478] [cursor=pointer]:
                - generic [ref=e479]:
                  - generic [ref=e480]: Vegas Golden Knights
                  - generic [ref=e481]: 7–6–0 · 14 pts
    - group [ref=e485]:
      - generic "How ratings & data work ↗" [ref=e486] [cursor=pointer]:
        - text: How ratings & data work
        - generic [ref=e487]: ↗
    - generic [ref=e488]:
      - generic [ref=e489]: ICEBOARD / Built for the games that matter.
      - generic [ref=e490]:
        - text: "Independent NHL dashboard · Data:"
        - link "NHL" [ref=e491] [cursor=pointer]:
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