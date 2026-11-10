import { isLive } from "./game-data.mjs";

const finished = (g) => g.state === "OFF" || g.state === "FINAL";
/** A live game this long after its puck drop with no word from the feed is stale (no NHL game lasts this long). */
export const STALE_LIVE_MS = 8 * 3600_000;

/** Local start time, e.g. "7:00 PM"; `withZone` adds the zone name ("7:00 PM PST"). Uses the viewer's own time zone. */
export function localTime(start, { withZone = false } = {}) {
  return new Date(start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(withZone ? { timeZoneName: "short" } : {}) });
}

/**
 * One description of where a game stands, for every card, tile and ticker item, so they all say the same thing.
 * kind: upcoming | live | intermission | final | postponed | cancelled | suspended.
 * label is the short status text ("7:00 PM", "P2 · 12:31", "Final/OT"); aria is a full sentence for screen readers.
 */
export function gameStatus(g, { now = Date.now(), withZone = false } = {}) {
  const away = g.away, home = g.home;
  const has = g.awayScore != null && g.homeScore != null;
  const score = has ? `${away} ${g.awayScore}, ${home} ${g.homeScore}` : `${away} at ${home}`;
  const sched = String(g.scheduleState ?? "OK").toUpperCase();
  if (!finished(g) && !isLive(g) && (sched === "PPD" || sched === "CNCL" || sched === "SUSP")) {
    const kind = sched === "PPD" ? "postponed" : sched === "CNCL" ? "cancelled" : "suspended";
    const label = kind === "postponed" ? "Postponed" : kind === "cancelled" ? "Canceled" : "Suspended";
    return { kind, label, short: label, aria: `${away} at ${home}, ${label.toLowerCase()}`, live: false, final: false, upcoming: false, stale: false };
  }
  if (finished(g)) {
    const tag = g.end === "OT" ? "Final/OT" : g.end === "SO" ? "Final/SO" : "Final";
    return { kind: "final", label: tag, short: g.end && g.end !== "REG" ? `F/${g.end}` : "F", aria: `${score}, ${tag.toLowerCase().replace("/", " in ")}`, live: false, final: true, upcoming: false, stale: false };
  }
  if (isLive(g)) {
    const stale = now - Date.parse(g.start) > STALE_LIVE_MS;
    const so = g.periodType === "SO";
    const ot = g.periodType === "OT";
    const period = so ? "SO" : ot ? "OT" : `P${g.period ?? "–"}`;
    if (g.intermission) {
      return { kind: "intermission", label: `${period} · Intermission`, short: "INT", aria: `${score}, intermission after period ${g.period ?? ""}`, live: true, final: false, upcoming: false, stale };
    }
    const clock = so ? "" : g.clock ? ` · ${g.clock}` : "";
    const label = stale ? "Updating" : `${period}${clock}`;
    return { kind: "live", label, short: so ? "SO" : `${period} ${g.clock ?? ""}`.trim(), aria: `${score}, live, ${so ? "shootout" : `${ot ? "overtime" : `period ${g.period ?? ""}`}${g.clock ? `, ${g.clock} left` : ""}`}`, live: true, final: false, upcoming: false, stale };
  }
  const time = g.start ? localTime(g.start, { withZone }) : "TBD";
  return { kind: "upcoming", label: time, short: time, aria: `${score}, starts at ${time}`, live: false, final: false, upcoming: true, stale: false };
}
