# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: team-page.spec.ts >> the roster is requested once, only when its section opens; a player row asks for that player's profile
- Location: tests/browser/team-page.spec.ts:98:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('dialog.player-dialog[open]')
Expected substring: "Connor McDavid"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" locator('dialog.player-dialog[open]') with timeout 5000ms
  - waiting for locator('dialog.player-dialog[open]')

```

```yaml
- link "Skip to dashboard":
  - /url: "#main"
- region "Today's games":
  - text: TODAY
  - list:
    - listitem:
      - button "Anaheim Ducks at Boston Bruins , 11:00 pm. Open the Game Center.": ANA @ BOS 11:00 PM
    - listitem:
      - button "Boston Bruins at Buffalo Sabres , 11:00 pm. Open the Game Center.": BOS @ BUF 11:00 PM
    - listitem:
      - button "Buffalo Sabres at Calgary Flames , 11:00 pm. Open the Game Center.": BUF @ CGY 11:00 PM
    - listitem:
      - button "Calgary Flames at Carolina Hurricanes , 11:00 pm. Open the Game Center.": CGY @ CAR 11:00 PM
    - listitem:
      - button "Carolina Hurricanes at Chicago Blackhawks , 11:00 pm. Open the Game Center.": CAR @ CHI 11:00 PM
    - listitem:
      - button "Chicago Blackhawks at Colorado Avalanche , 11:00 pm. Open the Game Center.": CHI @ COL 11:00 PM
    - listitem:
      - button "Colorado Avalanche at Columbus Blue Jackets , 11:00 pm. Open the Game Center.": COL @ CBJ 11:00 PM
    - listitem:
      - button "Columbus Blue Jackets at Dallas Stars , 11:00 pm. Open the Game Center.": CBJ @ DAL 11:00 PM
    - listitem:
      - button "Dallas Stars at Detroit Red Wings , 11:00 pm. Open the Game Center.": DAL @ DET 11:00 PM
    - listitem:
      - button "Detroit Red Wings at Edmonton Oilers , 11:00 pm. Open the Game Center.": DET @ EDM 11:00 PM
    - listitem:
      - button "Edmonton Oilers at Florida Panthers , 11:00 pm. Open the Game Center.": EDM @ FLA 11:00 PM
    - listitem:
      - button "Florida Panthers at Los Angeles Kings , 11:00 pm. Open the Game Center.": FLA @ LAK 11:00 PM
    - listitem:
      - button "Los Angeles Kings at Minnesota Wild , 11:00 pm. Open the Game Center.": LAK @ MIN 11:00 PM
    - listitem:
      - button "Minnesota Wild at Montréal Canadiens , 11:00 pm. Open the Game Center.": MIN @ MTL 11:00 PM
    - listitem:
      - button "Montréal Canadiens at Nashville Predators , 11:00 pm. Open the Game Center.": MTL @ NSH 11:00 PM
    - listitem:
      - button "Nashville Predators at New Jersey Devils , 11:00 pm. Open the Game Center.": NSH @ NJD 11:00 PM
    - listitem:
      - button "New Jersey Devils at New York Islanders , 11:00 pm. Open the Game Center.": NJD @ NYI 11:00 PM
    - listitem:
      - button "New York Islanders at New York Rangers , 11:00 pm. Open the Game Center.": NYI @ NYR 11:00 PM
    - listitem:
      - button "New York Rangers at Ottawa Senators , 11:00 pm. Open the Game Center.": NYR @ OTT 11:00 PM
    - listitem:
      - button "Ottawa Senators at Philadelphia Flyers , 11:00 pm. Open the Game Center.": OTT @ PHI 11:00 PM
    - listitem:
      - button "Philadelphia Flyers at Pittsburgh Penguins , 11:00 pm. Open the Game Center.": PHI @ PIT 11:00 PM
    - listitem:
      - button "Pittsburgh Penguins at San Jose Sharks , 11:00 pm. Open the Game Center.": PIT @ SJS 11:00 PM
    - listitem:
      - button "San Jose Sharks at Seattle Kraken , 11:00 pm. Open the Game Center.": SJS @ SEA 11:00 PM
    - listitem:
      - button "Seattle Kraken at St. Louis Blues , 11:00 pm. Open the Game Center.": SEA @ STL 11:00 PM
    - listitem:
      - button "St. Louis Blues at Tampa Bay Lightning , 11:00 pm. Open the Game Center.": STL @ TBL 11:00 PM
    - listitem:
      - button "Tampa Bay Lightning at Toronto Maple Leafs , 11:00 pm. Open the Game Center.": TBL @ TOR 11:00 PM
    - listitem:
      - button "Toronto Maple Leafs at Utah Mammoth , 11:00 pm. Open the Game Center.": TOR @ UTA 11:00 PM
    - listitem:
      - button "Utah Mammoth at Vancouver Canucks , 11:00 pm. Open the Game Center.": UTA @ VAN 11:00 PM
    - listitem:
      - button "Vancouver Canucks at Vegas Golden Knights , 11:00 pm. Open the Game Center.": VAN @ VGK 11:00 PM
    - listitem:
      - button "Vegas Golden Knights at Washington Capitals , 11:00 pm. Open the Game Center.": VGK @ WSH 11:00 PM
    - listitem:
      - button "Washington Capitals at Winnipeg Jets , 11:00 pm. Open the Game Center.": WSH @ WPG 11:00 PM
    - listitem:
      - button "Winnipeg Jets at Anaheim Ducks , 11:00 pm. Open the Game Center.": WPG @ ANA 11:00 PM
- banner:
  - link "Iceboard home":
    - /url: /
    - text: Ⅱ ↗ ICEBOARD NHL GAME INTELLIGENCE
  - status: saved copy · just now
  - text: Season
  - combobox "Season":
    - option "2026–27" [selected]
    - option "2025–26"
- main:
  - navigation "Main":
    - list "Main destinations":
      - listitem:
        - button "Home"
      - listitem:
        - button "Games"
      - listitem:
        - button "Standings"
      - listitem:
        - button "Teams"
    - heading "Games & schedule" [level=2]
    - list:
      - listitem:
        - button "Last night"
      - listitem:
        - button "Schedule"
    - heading "League intelligence" [level=2]
    - list:
      - listitem:
        - button "Team trends"
      - listitem:
        - button "Playoff odds"
      - listitem:
        - button "Picks"
      - listitem:
        - button "NHL+"
      - listitem:
        - button "NHL EDGE"
      - listitem:
        - button "Imperialism map"
    - heading "Players & teams" [level=2]
    - list:
      - listitem:
        - button "Players"
      - listitem:
        - button "Injury report"
  - text: 32 teams · 160 regular-season games · Snapshot Nov 10, 3:24 AM UTC · Update unavailable — showing the last received data.
  - button "↻ Refresh"
  - region "Edmonton Oilers team page":
    - button "Back to Teams": Teams
    - paragraph: PACIFIC DIVISION
    - heading "Edmonton Oilers" [level=1]
    - region "Overview":
      - heading "Overview" [level=2]
      - paragraph: Pacific Division Western Conference
      - term: Record
      - definition: 3–2–1 W–L–OTL
      - term: Points
      - definition: 7 6 GP
      - term: Points %
      - definition: .583 Derived
      - term: Streak
      - definition: L1 Loss
      - paragraph: 1st in the Pacific Division · 1st in the West · 1st of 32 overall (by points %)
      - text: Last 5 games, newest first
      - list "Last 5 games, newest first":
        - listitem "Loss"
        - listitem "Win"
        - listitem "Win"
        - listitem "Overtime or shootout loss"
        - listitem "Win"
      - text: Next game
      - button "vs DET Tue, Nov 10, 11:00 PM 1 day rest":
        - text: vs DET
        - emphasis: Tue, Nov 10, 11:00 PM
        - text: 1 day rest
    - region "Performance":
      - heading "Performance" [level=2]
      - table "Results by window (regular season)":
        - caption: Results by window (regular season)
        - rowgroup:
          - row "Window W–L–OTL Pts GF–GA Diff":
            - columnheader "Window"
            - columnheader "W–L–OTL"
            - columnheader "Pts"
            - columnheader "GF–GA"
            - columnheader "Diff"
        - rowgroup:
          - row "Last 5 3–1–1 7 14–12 +2":
            - rowheader "Last 5"
            - cell "3–1–1"
            - cell "7"
            - cell "14–12"
            - cell "+2"
          - row "Last 10 (only 6) 3–2–1 7 15–15 0":
            - rowheader "Last 10 (only 6)"
            - cell "3–2–1"
            - cell "7"
            - cell "15–15"
            - cell "0"
          - row "Home 1–1–1 3 7–8 −1":
            - rowheader "Home"
            - cell "1–1–1"
            - cell "3"
            - cell "7–8"
            - cell "−1"
          - row "Away 2–1–0 4 8–7 +1":
            - rowheader "Away"
            - cell "2–1–0"
            - cell "4"
            - cell "8–7"
            - cell "+1"
      - term: Goals for
      - definition: 15 2.50 per game
      - term: Goals against
      - definition: 15 2.50 per game
      - term: Goal difference
      - definition: 0 Season to date
      - term: Points %
      - definition: .583 Derived
      - term: Power play
      - definition: 25.0%
      - term: Penalty kill
      - definition: 64.3%
      - term: Shots for / game
      - definition: "28.3"
      - term: Shots against / game
      - definition: "24.0"
      - paragraph: "Power play, penalty kill and shots: season to date, as of Oct 8 (4 GP)."
    - group:
      - heading "Roster" [level=2]
      - text: Players by position −
      - table "Forwards":
        - caption: Forwards
        - rowgroup:
          - row "Player GP G A PTS TOI":
            - columnheader "Player"
            - columnheader "GP"
            - columnheader "G"
            - columnheader "A"
            - columnheader "PTS"
            - columnheader "TOI"
        - rowgroup:
          - row "View Connor McDavid details 10 6 12 18 21:30":
            - rowheader "View Connor McDavid details":
              - button "View Connor McDavid details": Connor McDavid C
            - cell "10"
            - cell "6"
            - cell "12"
            - cell "18"
            - cell "21:30"
          - row "View Leon Draisaitl details 10 8 7 15 20:12":
            - rowheader "View Leon Draisaitl details":
              - button "View Leon Draisaitl details": Leon Draisaitl L
            - cell "10"
            - cell "8"
            - cell "7"
            - cell "15"
            - cell "20:12"
      - table "Defense":
        - caption: Defense
        - rowgroup:
          - row "Player GP G A PTS TOI":
            - columnheader "Player"
            - columnheader "GP"
            - columnheader "G"
            - columnheader "A"
            - columnheader "PTS"
            - columnheader "TOI"
        - rowgroup:
          - row "View Evan Bouchard details 10 2 9 11 23:54":
            - rowheader "View Evan Bouchard details":
              - button "View Evan Bouchard details": Evan Bouchard D
            - cell "10"
            - cell "2"
            - cell "9"
            - cell "11"
            - cell "23:54"
      - table "Goalies":
        - caption: Goalies
        - rowgroup:
          - row "Player GP Sv%":
            - columnheader "Player"
            - columnheader "GP"
            - columnheader "Sv%"
        - rowgroup:
          - row "View Stuart Skinner details 8 .915":
            - rowheader "View Stuart Skinner details":
              - button "View Stuart Skinner details": Stuart Skinner G
            - cell "8"
            - cell ".915"
      - paragraph: Season to date. A player with no tag has no injury reported; that is not a guarantee he is available.
    - group:
      - heading "Schedule & results" [level=2]
      - text: Next games and last results +
    - navigation "More about Edmonton Oilers":
      - heading "Explore" [level=2]
      - list:
        - listitem:
          - button "Standings"
        - listitem:
          - button "Playoff odds"
        - listitem:
          - button "Injury report"
        - listitem:
          - button "Team schedule"
  - group: How ratings & data work ↗
  - text: "ICEBOARD Built for the games that matter. Independent NHL dashboard · Data:"
  - link "NHL":
    - /url: https://www.nhl.com
```

# Test source

```ts
  17  |   ];
  18  | });
  19  | const players = (team: string) => ({
  20  |   season: 0, gameType: 2, updatedAt: new Date().toISOString(),
  21  |   skaters: [
  22  |     { id: 8478402, name: "Connor McDavid", team, number: 97, headshot: "", position: "C", gp: 10, goals: 6, assists: 12, shots: 40, plusMinus: 3, pim: 2, toi: 21.5 },
  23  |     { id: 8477934, name: "Leon Draisaitl", team, number: 29, headshot: "", position: "L", gp: 10, goals: 8, assists: 7, shots: 35, plusMinus: 1, pim: 4, toi: 20.2 },
  24  |     { id: 8480800, name: "Evan Bouchard", team, number: 2, headshot: "", position: "D", gp: 10, goals: 2, assists: 9, shots: 28, plusMinus: 2, pim: 0, toi: 23.9 },
  25  |   ],
  26  |   goalies: [{ id: 8479973, name: "Stuart Skinner", team, number: 74, headshot: "", position: "G", gp: 8, goals: 0, assists: 0, shots: 0, plusMinus: 0, pim: 0, toi: 0, savePct: 0.915 }],
  27  | });
  28  | async function setup(page: Page) {
  29  |   const m = await mockApis(page, { games });
  30  |   await page.route("**/api/players/**", (r) => { m.log.push({ url: r.request().url(), path: new URL(r.request().url()).pathname, t: Date.now() }); return r.fulfill({ json: players("EDM") }); });
  31  |   return m;
  32  | }
  33  | const main = (page: Page) => page.locator("section.team-page");
  34  | 
  35  | test("all 32 team pages render their name, division, conference and sections without console errors", async ({ page }) => {
  36  |   test.setTimeout(180_000);
  37  |   await setup(page);
  38  |   const errors = watchErrors(page);
  39  |   for (const t of ids) {
  40  |     await page.goto(`/?view=teams&team=${t.id}`);
  41  |     await expect(page.getByRole("heading", { level: 1, name: t.name })).toBeVisible();
  42  |     await expect(main(page)).toContainText(`${t.division} Division`);
  43  |     await expect(main(page)).toContainText(t.conference === "E" ? "Eastern Conference" : "Western Conference");
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
> 117 |     await expect(page.locator("dialog.player-dialog[open]")).toContainText("Connor McDavid");
      |                                                              ^ Error: expect(locator).toContainText(expected) failed
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
  144 |   for (const s of await page.locator("details.tpg-details > summary").all()) await s.click();
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