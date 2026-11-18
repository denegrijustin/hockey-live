import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./tokens.css";
import "./styles.css";
import "./nav.css";
import "./scoreboard.css";
import "./picks.css";
import "./injuries.css";
import "./team-schedule.css";
import "./motion.css";
import { initMotion } from "./motion";
import { initDisplay } from "./lib/display";
import { isEmbedded } from "./lib/multi-route.mjs";
if (isEmbedded(location.search)) document.documentElement.dataset.embed = "1"; // one pane of the multi view
initMotion();
initDisplay();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Offline support: the worker keeps the app shell and saved data on the device (see public/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
