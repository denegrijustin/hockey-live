/** Pure side of the display preferences: which <html> attributes and browser-chrome colour a `display` record means. */
export const THEME_COLORS = { dark: "#0a141c", light: "#f3f7f9" };

/** data-theme: system|dark|light; data-contrast: "more" or none; data-text: s|m|l|xl; motion: system|reduce|full. */
export function displayAttrs(d = {}) {
  return {
    theme: d.theme === "dark" || d.theme === "light" ? d.theme : "system",
    contrast: d.contrast === "more" ? "more" : "",
    text: ["s", "m", "l", "xl"].includes(d.textSize) ? d.textSize : "m",
    motion: d.motion === "reduce" || d.motion === "full" ? d.motion : "system",
  };
}
/** The theme-color for an explicit theme; null while following the device (the media-specific metas in index.html apply). */
export const themeColor = (theme) => THEME_COLORS[theme] ?? null;
