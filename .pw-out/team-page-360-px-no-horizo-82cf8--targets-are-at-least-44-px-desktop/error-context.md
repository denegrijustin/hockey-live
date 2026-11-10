# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: team-page.spec.ts >> 360 px: no horizontal overflow with every section open; targets are at least 44 px
- Location: tests/browser/team-page.spec.ts:139:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('details.tpg-details > summary').nth(2)
    - locator resolved to <summary>…</summary>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
      - waiting 100ms
    52 × waiting for element to be visible, enabled and stable
       - element is not visible
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "Skip to dashboard" [ref=e3] [cursor=pointer]:
    - /url: "#main"
  - region "Today's games" [ref=e4]:
    - button "TODAY 32 games" [ref=e5] [cursor=pointer]:
      - generic [ref=e6]: TODAY
      - generic [ref=e7]: 32 games
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
    - region "Edmonton Oilers team page" [ref=e57]:
      - generic [ref=e58]:
        - button "Back to Teams" [ref=e59] [cursor=pointer]: Teams
        - heading "Edmonton Oilers" [level=1] [ref=e65]
      - generic [ref=e66]:
        - region [ref=e67]:
          - heading "Overview" [level=2] [ref=e68]
          - paragraph [ref=e70]:
            - generic [ref=e71]: Pacific Division
            - generic [ref=e72]: Western Conference
          - generic [ref=e73]:
            - generic [ref=e74]:
              - term [ref=e75]: Record
              - definition [ref=e76]:
                - text: 3–2–1
                - generic [ref=e77]: W–L–OTL
            - generic [ref=e78]:
              - term [ref=e79]: Points
              - definition [ref=e80]:
                - text: "7"
                - generic [ref=e81]: 6 GP
            - generic [ref=e82]:
              - term [ref=e83]: Points %
              - definition [ref=e84]:
                - text: ".583"
                - generic [ref=e85]: Derived
            - generic [ref=e86]:
              - term [ref=e87]: Streak
              - definition [ref=e88]:
                - text: L1
                - generic [ref=e89]: Loss
          - paragraph [ref=e90]: 1st in the Pacific Division · 1st in the West · 1st of 32 overall (by points %)
          - generic [ref=e91]:
            - generic [ref=e92]: Last 5 games, newest first
            - list "Last 5 games, newest first" [ref=e93]:
              - listitem "Loss" [ref=e94]:
                - generic [aria-hidden] [ref=e95]: L
              - listitem "Win" [ref=e97]:
                - generic [aria-hidden] [ref=e98]: W
              - listitem "Win" [ref=e100]:
                - generic [aria-hidden] [ref=e101]: W
              - listitem "Overtime or shootout loss" [ref=e103]:
                - generic [aria-hidden] [ref=e104]: OTL
              - listitem "Win" [ref=e106]:
                - generic [aria-hidden] [ref=e107]: W
          - generic [ref=e109]:
            - generic [ref=e110]: Next game
            - button "vs DET Tue, Nov 10, 11:00 PM 1 day rest" [ref=e111] [cursor=pointer]:
              - generic [ref=e112]: vs
              - generic [ref=e113]: DET
              - emphasis [ref=e114]: Tue, Nov 10, 11:00 PM
              - generic [ref=e115]: 1 day rest
        - region [ref=e116]:
          - heading "Performance" [level=2] [ref=e117]
          - table [ref=e118]:
            - caption [ref=e119]: Results by window (regular season)
            - rowgroup [ref=e120]:
              - row [ref=e121]:
                - columnheader "Window" [ref=e122]
                - columnheader "W–L–OTL" [ref=e123]
                - columnheader "Pts" [ref=e124]
                - columnheader "GF–GA" [ref=e125]
                - columnheader "Diff" [ref=e126]
            - rowgroup [ref=e127]:
              - row [ref=e128]:
                - rowheader "Last 5" [ref=e129]
                - cell "3–1–1" [ref=e130]
                - cell "7" [ref=e131]
                - cell "14–12" [ref=e132]
                - cell "+2" [ref=e133]
              - row [ref=e134]:
                - rowheader "Last 10 (only 6)" [ref=e135]:
                  - text: Last 10
                  - generic [ref=e136]: (only 6)
                - cell "3–2–1" [ref=e137]
                - cell "7" [ref=e138]
                - cell "15–15" [ref=e139]
                - cell "0" [ref=e140]
              - row [ref=e141]:
                - rowheader "Home" [ref=e142]
                - cell "1–1–1" [ref=e143]
                - cell "3" [ref=e144]
                - cell "7–8" [ref=e145]
                - cell "−1" [ref=e146]
              - row [ref=e147]:
                - rowheader "Away" [ref=e148]
                - cell "2–1–0" [ref=e149]
                - cell "4" [ref=e150]
                - cell "8–7" [ref=e151]
                - cell "+1" [ref=e152]
          - generic [ref=e153]:
            - generic [ref=e154]:
              - term [ref=e155]: Goals for
              - definition [ref=e156]:
                - text: "15"
                - generic [ref=e157]: 2.50 per game
            - generic [ref=e158]:
              - term [ref=e159]: Goals against
              - definition [ref=e160]:
                - text: "15"
                - generic [ref=e161]: 2.50 per game
            - generic [ref=e162]:
              - term [ref=e163]: Goal difference
              - definition [ref=e164]:
                - text: "0"
                - generic [ref=e165]: Season to date
            - generic [ref=e166]:
              - term [ref=e167]: Points %
              - definition [ref=e168]:
                - text: ".583"
                - generic [ref=e169]: Derived
            - generic [ref=e170]:
              - term [ref=e171]: Power play
              - definition [ref=e172]: 25.0%
            - generic [ref=e173]:
              - term [ref=e174]: Penalty kill
              - definition [ref=e175]: 64.3%
            - generic [ref=e176]:
              - term [ref=e177]: Shots for / game
              - definition [ref=e178]: "28.3"
            - generic [ref=e179]:
              - term [ref=e180]: Shots against / game
              - definition [ref=e181]: "24.0"
          - paragraph [ref=e182]: "Power play, penalty kill and shots: season to date, as of Oct 8 (4 GP)."
      - group [ref=e183]:
        - generic "Roster Players by position −" [ref=e184] [cursor=pointer]:
          - heading "Roster" [level=2] [ref=e185]
          - generic [ref=e186]: Players by position
          - text: −
        - generic [ref=e187]:
          - table [ref=e188]:
            - caption [ref=e189]: Forwards
            - rowgroup [ref=e190]:
              - row [ref=e191]:
                - columnheader "Player" [ref=e192]
                - columnheader "GP" [ref=e193]
                - columnheader "G" [ref=e194]
                - columnheader "A" [ref=e195]
                - columnheader "PTS" [ref=e196]
                - columnheader "TOI" [ref=e197]
            - rowgroup [ref=e198]:
              - row [ref=e199]:
                - rowheader [ref=e200]:
                  - button "View Connor McDavid details" [ref=e201] [cursor=pointer]:
                    - text: Connor McDavid
                    - generic [ref=e202]: C
                - cell "10" [ref=e203]
                - cell "6" [ref=e204]
                - cell "12" [ref=e205]
                - cell "18" [ref=e206]
                - cell "21:30" [ref=e207]
              - row [ref=e208]:
                - rowheader [ref=e209]:
                  - button "View Leon Draisaitl details" [ref=e210] [cursor=pointer]:
                    - text: Leon Draisaitl
                    - generic [ref=e211]: L
                - cell "10" [ref=e212]
                - cell "8" [ref=e213]
                - cell "7" [ref=e214]
                - cell "15" [ref=e215]
                - cell "20:12" [ref=e216]
          - table [ref=e217]:
            - caption [ref=e218]: Defense
            - rowgroup [ref=e219]:
              - row [ref=e220]:
                - columnheader "Player" [ref=e221]
                - columnheader "GP" [ref=e222]
                - columnheader "G" [ref=e223]
                - columnheader "A" [ref=e224]
                - columnheader "PTS" [ref=e225]
                - columnheader "TOI" [ref=e226]
            - rowgroup [ref=e227]:
              - row [ref=e228]:
                - rowheader [ref=e229]:
                  - button "View Evan Bouchard details" [ref=e230] [cursor=pointer]:
                    - text: Evan Bouchard
                    - generic [ref=e231]: D
                - cell "10" [ref=e232]
                - cell "2" [ref=e233]
                - cell "9" [ref=e234]
                - cell "11" [ref=e235]
                - cell "23:54" [ref=e236]
          - table [ref=e237]:
            - caption [ref=e238]: Goalies
            - rowgroup [ref=e239]:
              - row [ref=e240]:
                - columnheader "Player" [ref=e241]
                - columnheader "GP" [ref=e242]
                - columnheader "Sv%" [ref=e243]
            - rowgroup [ref=e244]:
              - row [ref=e245]:
                - rowheader [ref=e246]:
                  - button "View Stuart Skinner details" [ref=e247] [cursor=pointer]:
                    - text: Stuart Skinner
                    - generic [ref=e248]: G
                - cell "8" [ref=e249]
                - cell ".915" [ref=e250]
          - paragraph [ref=e251]: Season to date. A player with no tag has no injury reported; that is not a guarantee he is available.
      - group [ref=e252]:
        - generic "Schedule & results Next games and last results −" [active] [ref=e253] [cursor=pointer]:
          - heading "Schedule & results" [level=2] [ref=e254]
          - generic [ref=e255]: Next games and last results
          - text: −
        - generic [ref=e256]:
          - region [ref=e257]:
            - heading "Coming up" [level=3] [ref=e258]
            - list [ref=e259]:
              - listitem [ref=e260]:
                - 'button "vs DET, Tue, Nov 10: open game" [ref=e261] [cursor=pointer]':
                  - generic [ref=e262]: vs
                  - generic [ref=e263]: DET
                  - emphasis [ref=e264]: Tue, Nov 10, 11:00 PM
              - listitem [ref=e265]:
                - 'button "at FLA, Tue, Nov 10: open game" [ref=e266] [cursor=pointer]':
                  - generic [ref=e267]: at
                  - generic [ref=e268]: FLA
                  - emphasis [ref=e269]: Tue, Nov 10, 11:00 PM
              - listitem [ref=e270]:
                - 'button "at DET, Wed, Nov 11: open game" [ref=e271] [cursor=pointer]':
                  - generic [ref=e272]: at
                  - generic [ref=e273]: DET
                  - emphasis [ref=e274]: Wed, Nov 11, 11:00 PM
              - listitem [ref=e275]:
                - 'button "vs FLA, Wed, Nov 11: open game" [ref=e276] [cursor=pointer]':
                  - generic [ref=e277]: vs
                  - generic [ref=e278]: FLA
                  - emphasis [ref=e279]: Wed, Nov 11, 11:00 PM
          - region [ref=e280]:
            - heading "Recent results" [level=3] [ref=e281]
            - list [ref=e282]:
              - listitem [ref=e283]:
                - 'button "vs FLA, L 2 to 4: open game" [ref=e284] [cursor=pointer]':
                  - generic [ref=e285]: L
                  - generic [ref=e286]: vs
                  - generic [ref=e287]: FLA
                  - emphasis [ref=e288]: 2–4
              - listitem [ref=e289]:
                - 'button "at DET, W 4 to 2: open game" [ref=e290] [cursor=pointer]':
                  - generic [ref=e291]: W
                  - generic [ref=e292]: at
                  - generic [ref=e293]: DET
                  - emphasis [ref=e294]: 4–2
              - listitem [ref=e295]:
                - 'button "at FLA, W 3 to 2 OT: open game" [ref=e296] [cursor=pointer]':
                  - generic [ref=e297]: W
                  - generic [ref=e298]: at
                  - generic [ref=e299]: FLA
                  - emphasis [ref=e300]: 3–2 OT
              - listitem [ref=e301]:
                - 'button "vs DET, OTL 2 to 3 OT: open game" [ref=e302] [cursor=pointer]':
                  - generic [ref=e303]: OTL
                  - generic [ref=e304]: vs
                  - generic [ref=e305]: DET
                  - emphasis [ref=e306]: 2–3 OT
              - listitem [ref=e307]:
                - 'button "vs FLA, W 3 to 1: open game" [ref=e308] [cursor=pointer]':
                  - generic [ref=e309]: W
                  - generic [ref=e310]: vs
                  - generic [ref=e311]: FLA
                  - emphasis [ref=e312]: 3–1
          - paragraph [ref=e313]:
            - button "Open the full schedule" [ref=e314] [cursor=pointer]
      - text: +
      - navigation "More about Edmonton Oilers" [ref=e315]:
        - heading "Explore" [level=2] [ref=e316]
        - list [ref=e317]:
          - listitem [ref=e318]:
            - button "Standings" [ref=e319] [cursor=pointer]
          - listitem [ref=e320]:
            - button "Playoff odds" [ref=e321] [cursor=pointer]
          - listitem [ref=e322]:
            - button "Injury report" [ref=e323] [cursor=pointer]
          - listitem [ref=e324]:
            - button "Team schedule" [ref=e325] [cursor=pointer]
    - group [ref=e326]:
      - generic "How ratings & data work ↗" [ref=e327] [cursor=pointer]:
        - text: How ratings & data work
        - generic [ref=e328]: ↗
    - generic [ref=e329]:
      - generic [ref=e330]: ICEBOARD / Built for the games that matter.
      - generic [ref=e331]:
        - text: "Independent NHL dashboard · Data:"
        - link "NHL" [ref=e332] [cursor=pointer]:
          - /url: https://www.nhl.com
```

# Test source

```ts
  44  |     await expect(page.getByRole("heading", { level: 2, name: "Overview" })).toBeVisible();
  45  |     await expect(page.getByRole("heading", { level: 2, name: "Performance" })).toBeVisible();
  46  |     await expect(page.getByRole("heading", { level: 2, name: "Roster" })).toBeVisible();
  47  |     await expect(page.getByRole("heading", { level: 2, name: "Schedule & results" })).toBeVisible();
  48  |     await expect(page).toHaveTitle(`${t.name} · Iceboard`);
  49  |   }
  50  |   expect(errors).toEqual([]);
  51  | });
  52  | 
  53  | test("Teams to a team page and Back returns to the directory (and Forward returns to the page)", async ({ page }) => {
  54  |   await setup(page);
  55  |   await page.goto("/?view=teams");
  56  |   await page.locator('.tm-card [data-team-open="EDM"]').first().click();
  57  |   await expect(page).toHaveURL(/view=teams&team=EDM/);
  58  |   await expect(page.getByRole("heading", { level: 1, name: "Edmonton Oilers" })).toBeVisible();
  59  |   await page.goBack();
  60  |   await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
  61  |   await expect(page).not.toHaveURL(/team=/);
  62  |   await page.goForward();
  63  |   await expect(page.getByRole("heading", { level: 1, name: "Edmonton Oilers" })).toBeVisible();
  64  |   await page.getByRole("button", { name: "Back to Teams" }).click();
  65  |   await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
  66  | });
  67  | 
  68  | test("a deep link survives a refresh, and an unknown team id opens the directory", async ({ page }) => {
  69  |   await setup(page);
  70  |   await page.goto("/?view=teams&team=TOR");
  71  |   await expect(page.getByRole("heading", { level: 1, name: "Toronto Maple Leafs" })).toBeVisible();
  72  |   await page.reload();
  73  |   await expect(page.getByRole("heading", { level: 1, name: "Toronto Maple Leafs" })).toBeVisible();
  74  |   await expect(page).toHaveURL(/team=TOR/);
  75  |   await page.goto("/?view=teams&team=ZZZ");
  76  |   await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
  77  |   await expect(page).not.toHaveURL(/team=/);
  78  |   await page.goto("/?view=standings&team=TOR");
  79  |   await expect(page).not.toHaveURL(/team=/);
  80  | });
  81  | 
  82  | test("the quick-peek dialog keeps its content and opens the full page", async ({ page }) => {
  83  |   await setup(page);
  84  |   await page.goto("/?view=standings");
  85  |   await page.locator("tbody tr").first().locator("button.team-link").click();
  86  |   const d = page.locator("dialog.team-dialog");
  87  |   await expect(d).toBeVisible();
  88  |   await expect(d.locator(".tp-ranks span")).toHaveCount(3);
  89  |   await expect(d.getByText("Points %")).toBeVisible();
  90  |   await d.getByRole("button", { name: "Open full team page" }).click();
  91  |   await expect(d).toBeHidden();
  92  |   await expect(page).toHaveURL(/view=teams&team=[A-Z]{3}/);
  93  |   await expect(main(page)).toBeVisible();
  94  |   await page.goBack();
  95  |   await expect(page).toHaveURL(/view=standings/);
  96  | });
  97  | 
  98  | test("the roster is requested once, only when its section opens; a player row asks for that player's profile", async ({ page }) => {
  99  |   const m = await setup(page);
  100 |   await page.goto("/?view=teams&team=EDM");
  101 |   await expect(page.getByRole("heading", { level: 1, name: "Edmonton Oilers" })).toBeVisible();
  102 |   expect(count(m.log, /\/api\/players\//)).toBe(0);
  103 |   const roster = page.locator("details.tpg-details", { has: page.getByRole("heading", { name: "Roster" }) });
  104 |   await roster.locator("summary").click();
  105 |   await expect(roster.getByRole("table", { name: "Forwards" })).toBeVisible();
  106 |   await expect(roster.getByRole("table", { name: "Defense" })).toBeVisible();
  107 |   await expect(roster.getByRole("table", { name: "Goalies" })).toBeVisible();
  108 |   await roster.locator("summary").click();
  109 |   await roster.locator("summary").click();
  110 |   await expect(roster.getByRole("table", { name: "Forwards" })).toBeVisible();
  111 |   expect(count(m.log, /\/api\/players\//)).toBe(1);
  112 |   // Forwards are ordered by time on ice.
  113 |   await expect(roster.locator("table").first().locator("tbody tr").first()).toContainText("Connor McDavid");
  114 |   const provider = /dialog/.test(readFileSync("src/components/player/PlayerContext.tsx", "utf8"));
  115 |   if (provider) {
  116 |     await roster.getByRole("button", { name: "View Connor McDavid details" }).click();
  117 |     await expect(page.locator("dialog.player-dialog[open]")).toContainText("Connor McDavid");
  118 |   } else {
  119 |     await expect(roster.getByRole("button", { name: "View Connor McDavid details" })).toBeVisible(); // the profile provider is Agent 2's; the row is wired to usePlayerProfile()
  120 |   }
  121 | });
  122 | 
  123 | test("schedule rows and the next game ask to open that game (iceboard:open-game)", async ({ page }) => {
  124 |   await setup(page);
  125 |   await page.goto("/?view=teams&team=EDM");
  126 |   await page.evaluate(() => { (window as any).__opened = []; window.addEventListener("iceboard:open-game", (e) => (window as any).__opened.push((e as CustomEvent).detail.id)); });
  127 |   await page.locator(".tpg-next .tpg-game").click();
  128 |   const sched = page.locator("details.tpg-details", { has: page.getByRole("heading", { name: "Schedule & results" }) });
  129 |   await sched.locator("summary").click();
  130 |   await expect(sched.getByRole("heading", { name: "Recent results" })).toBeVisible();
  131 |   await sched.locator(".tpg-games button").last().click();
  132 |   const opened = await page.evaluate(() => (window as any).__opened as number[]);
  133 |   expect(opened).toHaveLength(2);
  134 |   expect(opened.every((id) => Number.isInteger(id) && id > 8000)).toBe(true);
  135 |   await sched.getByRole("button", { name: "Open the full schedule" }).click();
  136 |   await expect(page).toHaveURL(/view=teamschedule/);
  137 | });
  138 | 
  139 | test("360 px: no horizontal overflow with every section open; targets are at least 44 px", async ({ page }) => {
  140 |   await setup(page);
  141 |   await page.setViewportSize({ width: 360, height: 800 });
  142 |   await page.goto("/?view=teams&team=EDM");
  143 |   await expect(page.getByRole("heading", { level: 1, name: "Edmonton Oilers" })).toBeVisible();
> 144 |   for (const s of await page.locator("details.tpg-details > summary").all()) await s.click();
      |                                                                                      ^ Error: locator.click: Test timeout of 30000ms exceeded.
  145 |   await expect(page.getByRole("table", { name: "Forwards" })).toBeVisible();
  146 |   const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  147 |   expect(over).toBeLessThanOrEqual(0);
  148 |   const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("section.team-page button, section.team-page summary, section.team-page nav button")].map((b) => ({ n: (b.textContent ?? "").trim().slice(0, 30), h: b.getBoundingClientRect().height })).filter((x) => x.h < 43.5));
  149 |   expect(small).toEqual([]);
  150 | });
  151 | 
  152 | for (const scheme of ["dark", "light"] as const) {
  153 |   test(`${scheme} theme: readable surfaces and no console errors`, async ({ page }) => {
  154 |     await setup(page);
  155 |     const errors = watchErrors(page);
  156 |     await page.emulateMedia({ colorScheme: scheme });
  157 |     await page.goto("/?view=teams&team=EDM");
  158 |     await expect(page.getByRole("heading", { level: 2, name: "Overview" })).toBeVisible();
  159 |     const lum = await page.evaluate(() => {
  160 |       const c = getComputedStyle(document.querySelector(".tpg-card")!).backgroundColor.match(/\d+/g)!.map(Number);
  161 |       return (c[0] + c[1] + c[2]) / 3;
  162 |     });
  163 |     if (scheme === "dark") expect(lum).toBeLessThan(90); else expect(lum).toBeGreaterThan(160);
  164 |     expect(errors).toEqual([]);
  165 |   });
  166 | }
  167 | 
```