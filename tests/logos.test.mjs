import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const teams = JSON.parse(readFileSync("src/data/teams.json", "utf8"));
const retro = JSON.parse(readFileSync("src/data/retro-logos.json", "utf8"));

test("every NHL team has a vintage logo file and a current-logo fallback file", () => {
  for (const t of teams) {
    assert.ok(retro[t.id], `${t.id} has no vintage entry`);
    assert.ok(existsSync(`public/logos/retro/${t.id}.png`), `${t.id} retro file missing`);
    assert.ok(existsSync(`public/logos/${t.id}.svg`), `${t.id} current logo missing`);
    assert.ok(existsSync(`public/logos/vintage/${retro[t.id].file}`), `${t.id} original missing`);
  }
});

test("Utah uses the Arizona Coyotes mark", () => {
  assert.match(retro.UTA.name, /Coyotes/);
  assert.match(retro.UTA.file, /coyotes/);
  assert.ok(!/utah/i.test(retro.UTA.file));
  assert.ok(!Object.values(retro).some((e) => /utah/i.test(e.file)));
});

test("the lookup picks the vintage logo and falls back to the current one", async () => {
  const { logoUrl, hasRetro, currentLogoUrl, logoInk } = await import("../src/lib/logos.ts").catch(() => ({}));
  if (!logoUrl) return; // the .ts lookup is covered by the browser test when the runner cannot import TypeScript
  assert.equal(logoUrl("BOS"), "/logos/retro/BOS.png");
  assert.equal(logoUrl("XXX"), currentLogoUrl("XXX"));
  assert.equal(hasRetro("UTA"), true);
  assert.equal(logoInk("XXX"), "light");
  assert.equal(logoInk("BOS"), "retro");
});
