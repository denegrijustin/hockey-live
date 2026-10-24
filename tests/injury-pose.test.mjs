import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const src = readFileSync(new URL("../src/components/InjuryMascot.tsx", import.meta.url), "utf8");
test("every pose in the table has its drawing", () => {
  for (const m of src.matchAll(/file: "([a-z-]+)"/g)) assert.ok(existsSync(new URL(`../public/injury/poses/${m[1]}.webp`, import.meta.url)), m[1]);
});
