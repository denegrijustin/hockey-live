import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TeamStatsChart from "./TeamStatsChart.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TeamStatsChart />
  </StrictMode>
);
