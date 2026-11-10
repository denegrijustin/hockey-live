import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// TypeScript first, so `./prefs` means prefs.ts (the store), not prefs.mjs (its pure schema), as TypeScript resolves it.
export default defineConfig({ plugins: [react()], resolve: { extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"] } });
