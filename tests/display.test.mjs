import test from "node:test";
import assert from "node:assert/strict";
import { displayAttrs, themeColor } from "../src/lib/display.mjs";
import { fmtTime, fmtDay, fmtDateTime, setTimePrefs } from "../src/lib/dates.mjs";
import { localTime } from "../src/lib/game-status.mjs";
import { defaultPrefs, parsePrefs } from "../src/lib/prefs.mjs";

const START = "2026-11-11T00:30:00Z"; // 7:30 PM ET, 4:30 PM PT

test("displayAttrs maps a record and falls back for junk", () => {
  assert.deepEqual(displayAttrs(defaultPrefs().display), { theme: "system", contrast: "", text: "m", motion: "system" });
  assert.deepEqual(displayAttrs({ theme: "light", contrast: "more", textSize: "xl", motion: "reduce" }), { theme: "light", contrast: "more", text: "xl", motion: "reduce" });
  assert.deepEqual(displayAttrs({ theme: "neon", textSize: 9 }), { theme: "system", contrast: "", text: "m", motion: "system" });
  assert.equal(themeColor("system"), null);
  assert.match(themeColor("dark"), /^#/);
});

test("stored junk and corrupt JSON recover to defaults", () => {
  assert.deepEqual(parsePrefs("{not json").display, defaultPrefs().display);
  assert.equal(parsePrefs(JSON.stringify({ version: 1, display: { theme: "x", textSize: "huge", timeZone: "Mars/Base" } }), { teamIds: [] }).display.timeZone, "auto");
});

test("formatters honour time zone and clock", () => {
  assert.equal(fmtTime(START, {}, { timeZone: "America/Los_Angeles", hour12: "auto" }), "4:30 PM");
  assert.equal(fmtTime(START, {}, { timeZone: "ET", hour12: "auto" }), "7:30 PM");
  assert.equal(fmtTime(START, {}, { timeZone: "ET", hour12: "24" }), "19:30");
  assert.equal(fmtTime(START, {}, { timeZone: "UTC", hour12: "12" }), "12:30 AM");
  assert.equal(fmtDay(START, {}, { timeZone: "ET" }), "Tue, Nov 10");
  assert.equal(fmtDay(START, { long: true }, { timeZone: "UTC" }), "Wednesday, Nov 11");
  assert.match(fmtDateTime(START, { withZone: true }, { timeZone: "ET" }), /^Nov 10, 7:30 PM E[SD]T$/);
  assert.equal(fmtTime("garbage"), "");
  assert.equal(fmtTime(START, {}, { timeZone: "Nope/Zone" }).length > 0, true);
});

test("default behaviour is unchanged and a shared preference changes localTime", () => {
  const device = new Date(START).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  setTimePrefs({ timeZone: "auto", hour12: "auto" });
  assert.equal(localTime(START), device);
  setTimePrefs({ timeZone: "America/Los_Angeles", hour12: "24" });
  assert.equal(localTime(START), "16:30");
  assert.match(localTime(START, { withZone: true }), /P[SD]T$/);
  setTimePrefs({});
  assert.equal(localTime(START), device);
});
