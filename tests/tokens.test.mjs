import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const tokens = readFileSync("src/tokens.css", "utf8");
// Four value sets: dark, light, and each with "increase contrast". Split on the media rules.
const [darkCss, ...rest] = tokens.split(/@media[^{]*\{/);
const sets = { dark: darkCss, light: rest[0], darkMore: rest[1], lightMore: rest[2] };
const parse = (css) => Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) => [m[1], m[2]]));
const values = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, parse(v)]));

const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("every colour mode defines the same tokens", () => {
  const names = Object.keys(values.dark).filter((n) => n !== "overlay").sort(); // the contrast sets inherit --overlay
  assert.ok(names.length > 30, "the dark set is the full palette");
  for (const mode of ["light", "darkMore", "lightMore"]) assert.deepEqual(Object.keys(values[mode]).filter((n) => n !== "overlay").sort(), names, mode);
});

function cssFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith(".css") ? [p] : [];
  });
}

test("every token a stylesheet uses is defined", () => {
  const defined = new Set(Object.keys(values.dark).concat(["overlay"]));
  const used = new Map();
  for (const file of cssFiles("src").filter((f) => !f.endsWith("tokens.css"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/var\(--((?:surface|line|text|mint|red|amber|series)-[a-z0-9]+)/g)) used.set(m[1], file);
  }
  for (const [name, file] of used) assert.ok(defined.has(name), `--${name} (used in ${file}) is not defined in tokens.css`);
});

for (const [mode, v] of Object.entries(values)) {
  test(`${mode}: text tokens are readable on the page and card surfaces`, () => {
    for (const text of ["text-1", "text-2", "text-3", "text-4", "text-5", "text-6"]) {
      for (const surface of ["surface-3", "surface-5"]) {
        assert.ok(contrast(v[text], v[surface]) >= 4.5, `${mode}: ${text} on ${surface} is ${contrast(v[text], v[surface]).toFixed(2)}:1`);
      }
    }
  });
  test(`${mode}: chart series colours are visible on the page`, () => {
    for (const s of ["series-away", "series-home", "series-blue"]) assert.ok(contrast(v[s], v["surface-3"]) >= 3, `${mode}: ${s}`);
  });
}

test("increased contrast is at least as strong as the standard values", () => {
  for (const [std, more] of [["dark", "darkMore"], ["light", "lightMore"]]) {
    for (const t of ["text-1", "text-2"]) assert.ok(contrast(values[more][t], values[more]["surface-3"]) >= contrast(values[std][t], values[std]["surface-3"]) - 0.01, `${more} ${t}`);
  }
});
