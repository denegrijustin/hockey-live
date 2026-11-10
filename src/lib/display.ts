import { useSyncExternalStore } from "react";
import { setTimePrefs } from "./dates.mjs";
import { displayAttrs, themeColor } from "./display.mjs";
import { getPrefs, subscribePrefs, type Prefs } from "./prefs";
import { setMotionPref } from "../motion";

/** Writes the user's display choices onto <html> (theme, contrast, text size, motion) and the shared time formatters. Safe to call repeatedly. */
export function applyDisplay(prefs: Prefs) {
  const root = document.documentElement, a = displayAttrs(prefs.display);
  root.dataset.theme = a.theme;
  if (a.contrast) root.dataset.contrast = a.contrast; else delete root.dataset.contrast;
  root.dataset.text = a.text;
  const color = themeColor(a.theme);
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.dataset.orig ??= m.content;
    m.content = color ?? m.dataset.orig;
  });
  setMotionPref(a.motion);
  setTimePrefs(prefs.display);
}

/** Apply now (before first render) and whenever preferences change, including from another tab. */
export function initDisplay() {
  applyDisplay(getPrefs());
  subscribePrefs(() => applyDisplay(getPrefs()));
}

const timeKey = () => { const d = getPrefs().display; return `${d.timeZone}|${d.hour12}`; };
/** Subscribes a component to the time-zone / clock choice so its times redraw when Settings changes them. Ignore the returned key. */
export const useTimeKey = () => useSyncExternalStore(subscribePrefs, timeKey, () => "auto|auto");
