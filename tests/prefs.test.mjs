import test from "node:test";
import assert from "node:assert/strict";
import { defaultPrefs, parsePrefs, sanitize, migrate, toggleFavorite, toggleFollow, toggleSaved, isFavorite, isFollowing, isSaved, serialize, LIMITS } from "../src/lib/prefs.mjs";

const teamIds = ["EDM", "TOR", "BOS", "CHI"];
const opts = { teamIds };

test("no record and no legacy value gives safe defaults with no favorites", () => {
  const p = parsePrefs(null, opts);
  assert.deepEqual(p, defaultPrefs());
  assert.deepEqual(p.favorites, []);
  assert.equal(p.onboarded, false);
});
test("corrupted JSON and wrong shapes fall back to defaults and never throw", () => {
  for (const bad of ["{bad", "[]", "null", "42", '"x"', "{\"version\":1,\"favorites\":\"EDM\"}"]) assert.deepEqual(parsePrefs(bad, opts).favorites, []);
});
test("the legacy iceboard-teams list becomes the favorites and counts as onboarded", () => {
  const p = parsePrefs(null, { teamIds, legacy: '["EDM","TOR","XXX"]' });
  assert.deepEqual(p.favorites, ["EDM", "TOR"]);
  assert.equal(p.onboarded, true);
  assert.deepEqual(parsePrefs(null, { teamIds, legacy: "[]" }).favorites, []);
});
test("an existing v1 record wins over the legacy list", () => {
  const p = parsePrefs(JSON.stringify({ version: 1, favorites: ["BOS"] }), { teamIds, legacy: '["EDM"]' });
  assert.deepEqual(p.favorites, ["BOS"]);
});
test("unknown teams, duplicates and the 32-team cap are enforced", () => {
  assert.deepEqual(sanitize({ favorites: ["EDM", "EDM", "NOPE", "TOR"] }, teamIds).favorites, ["EDM", "TOR"]);
  const ids = Array.from({ length: 40 }, (_, i) => `T${String(i).padStart(2, "0")}`);
  assert.equal(sanitize({ favorites: ids }, ids).favorites.length, LIMITS.favorites);
});
test("player ids must be 7 digits, are unique, and headshots must come from assets.nhle.com", () => {
  const p = sanitize({ players: [{ id: 8478402, name: "Connor McDavid", team: "EDM", headshot: "https://assets.nhle.com/x.png" }, { id: "8478402" }, { id: 12 }, { id: 8477424, headshot: "https://evil.example/x.png" }] }, teamIds);
  assert.deepEqual(p.players.map((x) => x.id), [8478402, 8477424]);
  assert.equal(p.players[1].headshot, "");
});
test("game ids must be NHL-sized numbers and unique; bad dates are dropped", () => {
  const p = sanitize({ games: [{ id: 2026020123, home: "EDM", away: "TOR", date: "2026-11-02" }, { id: 2026020123 }, { id: 5 }, { id: 2026020124, date: "tomorrow" }] }, teamIds);
  assert.deepEqual(p.games.map((g) => g.id), [2026020123, 2026020124]);
  assert.equal(p.games[1].date, "");
});
test("display and alert values are allow-listed", () => {
  const p = sanitize({ display: { theme: "neon", textSize: "xl", timeZone: "Not/AZone", hour12: "24", sections: { pulse: false, myTeams: "yes" } }, alerts: { enabled: "true", final: false } }, teamIds);
  assert.equal(p.display.theme, "system");
  assert.equal(p.display.textSize, "xl");
  assert.equal(p.display.timeZone, "auto");
  assert.equal(p.display.hour12, "24");
  assert.equal(p.display.sections.pulse, false);
  assert.equal(p.display.sections.myTeams, true);
  assert.equal(p.alerts.enabled, false); // anything but a real boolean stays off
  assert.equal(p.alerts.final, false);
  assert.equal(sanitize({ display: { timeZone: "America/Toronto" } }, teamIds).display.timeZone, "America/Toronto");
});
test("reducers toggle favorites, followed players and saved games without mutating", () => {
  const p0 = defaultPrefs();
  const p1 = toggleFavorite(p0, "EDM");
  assert.ok(isFavorite(p1, "EDM") && !isFavorite(p0, "EDM"));
  assert.ok(!isFavorite(toggleFavorite(p1, "EDM"), "EDM"));
  const f = toggleFollow(p0, { id: 8478402, name: "Connor McDavid", team: "EDM" });
  assert.ok(isFollowing(f, 8478402) && isFollowing(f, "8478402"));
  assert.ok(!isFollowing(toggleFollow(f, { id: 8478402 }), 8478402));
  const g = toggleSaved(p0, { id: 2026020123, home: "EDM", away: "TOR" });
  assert.ok(isSaved(g, 2026020123) && !isSaved(toggleSaved(g, { id: 2026020123 }), 2026020123));
});
test("a record round-trips through serialize and parse, and a newer version is kept as understood", () => {
  const p = toggleFavorite(defaultPrefs(), "BOS");
  assert.deepEqual(parsePrefs(serialize(p), opts), p);
  assert.deepEqual(parsePrefs(JSON.stringify({ version: 7, favorites: ["TOR"] }), opts).favorites, ["TOR"]);
  assert.deepEqual(migrate({ version: 1, a: 1 }, null), { version: 1, a: 1 });
});
test("a missing jersey number stays null instead of becoming 0", () => {
  const p = sanitize({ players: [{ id: 8478402, number: null }, { id: 8477424, number: 30 }, { id: 8470000, number: "" }] }, teamIds);
  assert.deepEqual(p.players.map((x) => x.number), [null, 30, null]);
});
