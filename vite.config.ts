import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Stamps dist/sw.js with a hash of the built asset names, so every deploy gets a fresh cache and old ones are deleted. */
function swVersion(): Plugin {
  let outDir = "dist";
  return {
    name: "sw-version",
    apply: "build",
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const assets = readdirSync(join(outDir, "assets")).sort().join("|");
      const id = createHash("sha256").update(assets).digest("hex").slice(0, 10);
      const file = join(outDir, "sw.js");
      writeFileSync(file, readFileSync(file, "utf8").replace("__BUILD_ID__", id));
    },
  };
}
export default defineConfig({ plugins: [react(), swVersion()] });
