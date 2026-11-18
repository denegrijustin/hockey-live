import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
const all = headers.split(/\n(?=\S)/)[0]; // the block for every path ("/*")

test("the site can be framed by itself (the multi view shows each Game Center in a frame) but by no other site", () => {
  assert.match(all, /^\s*X-Frame-Options:\s*SAMEORIGIN\s*$/m, "X-Frame-Options allows the same origin only");
  assert.doesNotMatch(all, /X-Frame-Options:\s*(DENY|ALLOW-FROM)/i);
  const csp = /Content-Security-Policy:\s*(.+)/.exec(all)?.[1] ?? "";
  assert.match(csp, /frame-ancestors 'self'(;|$)/, "frame-ancestors is the site itself");
  assert.doesNotMatch(csp, /frame-ancestors[^;]*(\*|https?:)/, "no other site may frame it");
  assert.match(csp, /default-src 'self'/, "frames the page opens are limited to its own origin (frame-src falls back to default-src)");
});
