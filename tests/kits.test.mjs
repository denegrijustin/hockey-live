import test from "node:test";
import assert from "node:assert/strict";
import teams from "../src/data/teams.json" with { type: "json" };
import { readFileSync } from "node:fs";

test("every team has a jersey colour for the injury cartoon", () => {
  const src = readFileSync(new URL("../src/lib/kits.ts", import.meta.url), "utf8");
  for (const t of teams) assert.match(src, new RegExp(`\\b${t.id}: \\["#[0-9A-Fa-f]{6}", "#[0-9A-Fa-f]{6}"\\]`), t.id);
});
