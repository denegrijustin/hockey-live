import { expect, test, type Page } from "@playwright/test";
import { liveBody } from "./qa-harness";

const PAYLOADS = [
  `"><img src=x onerror=window.__xss=1>`,
  `<script>window.__xss=1</script>`,
  `javascript:window.__xss=1`,
  `';window.__xss=1;//`,
  `{{constructor.constructor('window.__xss=1')()}}`,
  `%3Cimg%20src%3Dx%20onerror%3Dwindow.__xss%3D1%3E`,
  `../../../etc/passwd`,
  `${"A".repeat(5000)}`,
];
const VIEWS = ["", "games", "standings", "teams", "players", "settings", "following", "nhlplus", "picks", "injuries", "yesterday"];

async function probe(page: Page, url: string) {
  const csp: string[] = [], thrown: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|violat/i.test(m.text())) csp.push(m.text()); });
  page.on("pageerror", (e) => thrown.push(e.message));
  page.on("dialog", (d) => { thrown.push(`dialog: ${d.message()}`); void d.dismiss(); });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).not.toBeEmpty();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss), `xss executed at ${url.slice(0, 80)}`).toBeUndefined();
  // The payload must not become live markup.
  expect(await page.locator("#root img[onerror], #root script, #root [onerror], #root [href^='javascript:']").count(), `markup injected at ${url.slice(0, 80)}`).toBe(0);
  expect(csp, "CSP violations").toEqual([]);
  expect(thrown, "uncaught errors").toEqual([]);
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/live", (route) => route.fulfill({ json: liveBody() }));
});

for (const [i, payload] of PAYLOADS.entries()) {
  test(`hostile ?view= / ?team= / ?player= / ?date= value #${i} neither executes nor reflects`, async ({ page }) => {
    const v = encodeURIComponent(payload);
    await probe(page, `/?view=${v}`);
    await probe(page, `/?view=teams&team=${v}`);
    await probe(page, `/?view=players&player=${v}`);
    await probe(page, `/?date=${v}`);
    await probe(page, `/?view=games&date=${v}&team=${v}&player=${v}`);
  });
}

test("the hostile string is not echoed into the visible page text", async ({ page }) => {
  await page.goto(`/?view=${encodeURIComponent("<b>REFLECTED-MARK</b>")}&team=REFLECTED-MARK&player=REFLECTED-MARK&date=REFLECTED-MARK`);
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(page.locator("body")).not.toContainText("REFLECTED-MARK");
});

for (const v of VIEWS) {
  test(`view "${v || "home"}" loads without CSP violations or uncaught errors`, async ({ page }) => {
    await probe(page, v ? `/?view=${v}` : "/");
  });
}
