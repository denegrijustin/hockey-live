import base from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({ ...base, projects: base.projects!.map(p => ({ ...p, use: { ...p.use, launchOptions: { executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell" } } })) });
