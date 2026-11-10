import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const src = readFileSync(new URL("../src/components/InjuryMascot.tsx", import.meta.url), "utf8");
test("every pose in the table has its drawing", () => {
  for (const m of src.matchAll(/file: "([a-z-]+)"/g)) assert.ok(existsSync(new URL(`../public/injury/poses/${m[1]}.webp`, import.meta.url)), m[1]);
});

test("vague lower/upper body draws the shrug (never an ankle or an arm); named parts keep their poses; COL, MTL and SJS use the neutral set", () => {
  const leg = /LEG = (\[[^\]]*\])/.exec(src)[1];
  assert.doesNotMatch(leg, /"lower"/);
  const goalie = /if \(goalie\)[^\n]*/.exec(src)[0];
  assert.doesNotMatch(goalie, /"upper"/);
  assert.doesNotMatch(goalie, /"lower"/);
  const drawn = /const DRAWN = new Set\(\[([^\]]*)\]/.exec(src)[1];
  for (const t of ["COL", "MTL", "SJS"]) assert.doesNotMatch(drawn, new RegExp(`"${t}"`), t);
  for (const t of ["EDM", "UTA"]) assert.match(drawn, new RegExp(`"${t}"`), t);
  assert.match(src, /Injury location for \$\{name\}: \$\{label\}/); // the figure's label names the player
});
