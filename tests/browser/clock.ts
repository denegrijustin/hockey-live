import manifest from "../../public/data/manifest.json" with { type: "json" };

/**
 * "Now" for specs that need a fixed clock: the moment the saved data was captured. The saved copy is refreshed every week, and a clock fixed to an
 * older date finds every game since then already played (no upcoming games to show), so these follow the data instead of a hard-coded day.
 */
export const DATA_NOW = new Date(manifest.updatedAt);
/** That moment's date in Eastern time, as the NHL dates its games. */
export const DATA_DAY = DATA_NOW.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
