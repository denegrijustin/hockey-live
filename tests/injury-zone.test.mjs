import test from "node:test";
import assert from "node:assert/strict";
import { injuryZone } from "../src/lib/injury-zone.mjs";

const z = (kind, comment = "", side = null) => injuryZone({ kind, comment, side });

test("a named body part wins over the general group the report also gives", () => {
  assert.equal(z("Knee (lower body)").zone, "knee");
  assert.equal(z("Lower Body", "Poehling (knee) is expected to miss 6-8 weeks").zone, "knee");
  assert.equal(z("Upper Body", "Smith (shoulder) is day-to-day").zone, "shoulder");
  assert.equal(z("Hand").zone, "hand");
  assert.equal(z("Wrist").zone, "hand");
  assert.equal(z("Concussion").zone, "head");
  assert.equal(z("Hamstring").zone, "thigh");
  assert.equal(z("Ankle").zone, "ankle");
  assert.equal(z("Groin").zone, "groin");
  assert.equal(z("Abdomen").zone, "core");
});

test("sides: left and right come from the report's side or the team's note, and only where a side means something", () => {
  assert.deepEqual([z("Knee", "", "Left").side, z("Knee", "", "Right").side], ["left", "right"]);
  assert.equal(z("Shoulder", "He injured his right shoulder in the second period").side, "right");
  assert.equal(z("Knee", "", "Left").label, "Left knee");
  assert.equal(z("Head", "", "Left").side, null);
  assert.equal(z("Knee", "", "Not Specified").side, null);
});

test("general reports show a region, not a spot, and illness and personal reasons are their own thing", () => {
  assert.deepEqual([z("Upper Body").zone, z("Upper Body").general], ["upper", true]);
  assert.equal(z("Lower Body").zone, "lower");
  assert.equal(z("Undisclosed", "Moore (lower body) is still a ways from skating").zone, "lower");
  assert.equal(z("Illness").zone, "illness");
  assert.equal(z("Personal").zone, "personal");
  assert.equal(z("Undisclosed").zone, "unknown");
  assert.equal(z("Not specified").label, "Not specified");
});

import { readFileSync } from "node:fs";
test("the page's security policy lets the player pictures load", () => {
  assert.match(readFileSync(new URL("../public/_headers", import.meta.url), "utf8"), /img-src[^;]*https:\/\/a\.espncdn\.com/);
});
