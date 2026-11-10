/* Applies the stored theme and text size before the first paint (an external file: the CSP allows no inline scripts). Mirrors src/lib/display.ts; storage errors are ignored. */
(function () {
  try {
    var d = (JSON.parse(localStorage.getItem("iceboard-prefs-v1")) || {}).display || {}, r = document.documentElement;
    var theme = d.theme === "dark" || d.theme === "light" ? d.theme : "system";
    r.setAttribute("data-theme", theme);
    if (d.contrast === "more") r.setAttribute("data-contrast", "more");
    r.setAttribute("data-text", ["s", "m", "l", "xl"].indexOf(d.textSize) > -1 ? d.textSize : "m");
    if (theme !== "system") {
      var c = theme === "dark" ? "#0a141c" : "#f3f7f9", m = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < m.length; i++) { m[i].setAttribute("data-orig", m[i].getAttribute("content")); m[i].setAttribute("content", c); }
    }
  } catch (e) {}
})();
