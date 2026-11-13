import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Static check of public/_headers (what Cloudflare serves), so it cannot regress silently.
const text = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");
const block = (path: string) => {
  const m = text.match(new RegExp(`^${path.replace(/[/*]/g, "\\$&")}\\s*\\n((?:[ \\t]+.*\\n?)*)`, "m"));
  return m ? m[1] : "";
};
const all = block("/*");
const header = (name: string) => all.split("\n").map((l) => l.trim()).find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`))?.slice(name.length + 1).trim() ?? "";
const directive = (csp: string, name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name) ?? "";

test("the global rule sets the baseline security headers", () => {
  expect(header("X-Content-Type-Options")).toBe("nosniff");
  expect(header("X-Frame-Options")).toMatch(/^(DENY|SAMEORIGIN)$/);
  expect(header("Referrer-Policy")).toBeTruthy();
  expect(header("Permissions-Policy")).toContain("camera=()");
});

test("the CSP has no eval, no wildcard or http script/connect sources, and locks down framing, objects and base", () => {
  const csp = header("Content-Security-Policy");
  expect(csp).toBeTruthy();
  expect(csp).not.toMatch(/'unsafe-eval'/);
  // The 3D rink decodes its meshopt-compressed model with WebAssembly: that, and only that, may compile (no eval).
  expect(directive(csp, "script-src")).toMatch(/'wasm-unsafe-eval'/);
  expect(directive(csp, "default-src")).toBe("default-src 'self'");
  for (const d of ["script-src", "connect-src"]) {
    const v = directive(csp, d);
    expect(v, d).not.toMatch(/\*|'unsafe-inline'|\bdata:|\bhttp:/);
    expect(v, d).toMatch(/'self'/);
  }
  // blob: is for the 3D model's own textures (the loader reads them back through a blob URL); never for scripts.
  expect(directive(csp, "script-src")).not.toMatch(/\bblob:/);
  expect(directive(csp, "connect-src")).toMatch(/\bblob:/);
  expect(directive(csp, "img-src")).toMatch(/\bblob:/);
  expect(directive(csp, "object-src")).toBe("object-src 'none'");
  expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
  expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
  // Images only from first-party and the two named hosts; no bare https: or wildcard.
  expect(directive(csp, "img-src")).not.toMatch(/\*|\bhttps:(?!\/\/)|\bhttp:/);
});

test("the shipped HTML has no inline script (script-src 'self' would block it)", () => {
  const html = readFileSync(resolve(process.cwd(), "dist/index.html"), "utf8");
  const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/\bsrc=/.test(m[1]) && m[2].trim());
  expect(inline.map((m) => m[2].slice(0, 60))).toEqual([]);
});

test("cache rules never make the service worker or data sticky", () => {
  expect(block("/sw.js")).toMatch(/no-cache/);
  expect(block("/data/*")).toMatch(/must-revalidate/);
});

test("the served app actually sends the static headers' CSP-relevant behaviour (no CSP violations on load)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|CSP/i.test(m.text())) errors.push(m.text()); });
  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();
  expect(errors).toEqual([]);
});
