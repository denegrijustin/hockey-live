import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: __dirname,
  publicDir: resolve(__dirname, "../../../public"),
  build: { outDir: "/tmp/zam/proto-dist", emptyOutDir: true, target: "es2022", minify: true },
  server: { fs: { allow: [resolve(__dirname, "../../..")] } },
});
