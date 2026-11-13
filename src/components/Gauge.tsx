import type { CSSProperties } from "react";
import { gaugeColors } from "../lib/kits";
import { Versus } from "./Versus";
import "./gauge.css";

/** compact, standard and expanded keep their names for callers; "sm" = compact and "lg" = standard are legacy aliases. The look no longer depends on them. */
export type GaugeSize = "compact" | "standard" | "expanded" | "sm" | "lg";

/**
 * One two-sided number, drawn as the head-to-head bar (see Versus): the away side's number on the left, the home side's on the right, and a bar split at who has the
 * advantage. For "deserved to win" and the projected score (`look`), and for every head-to-head stat, so they all read the same way.
 */
export function Gauge({ away, home, awayId, homeId, label, format = (v: number) => String(v), percent = false, size = "compact", span, lowerBetter = false, awayText, homeText, awaySub, homeSub, needle, stretch = false, look }: {
  away: number; home: number; awayId: string; homeId: string; label: string; format?: (v: number) => string; percent?: boolean; size?: GaugeSize;
  /** For numbers that are not shares of a total (a save percentage, goals against): the gap that swings the bar all the way. */
  span?: number; lowerBetter?: boolean; awayText?: string; homeText?: string;
  /** A smaller second line under each side's number (the win chance under a projected score). */
  awaySub?: string; homeSub?: string;
  /** Where the split sits (the away side's share, 0..1) when it is not simply the split of the two numbers shown. */
  needle?: number;
  /** Kept for callers: every gauge is a bar now. */
  stretch?: boolean;
  /** "proj": the projected-final-score headline (big numbers); "bar": the deserved-to-win bar with logos. */
  look?: "proj" | "bar";
}) {
  const total = away + home;
  const share = needle != null ? needle : span ? Math.min(0.95, Math.max(0.05, 0.5 + ((away - home) / span / 2) * (lowerBetter ? -1 : 1))) : total > 0 ? away / total : 0.5;
  const shownA = awayText ?? (percent ? `${away}%` : format(away)), shownH = homeText ?? (percent ? `${home}%` : format(home));
  const text = `${awayId} ${shownA}${awaySub ? ` (${awaySub})` : ""}, ${homeId} ${shownH}${homeSub ? ` (${homeSub})` : ""}`;
  const leader = share > 0.52 ? "away" : share < 0.48 ? "home" : "even";
  const variant = size === "sm" ? "compact" : size === "lg" ? "standard" : size;
  const colors = gaugeColors(awayId, homeId);
  const density = look === "proj" ? "hero" : look === "bar" ? "bar" : "row";
  return (
    <figure className={`gauge versus ${look ?? ""} ${look === "bar" ? "sbar" : ""} ${stretch ? "stretch" : ""} ${variant}`} data-leader={leader} data-lopsided={Math.min(1, Math.abs(share - 0.5) * 2).toFixed(2)} role="img" aria-label={`${label}: ${text}`} style={{ margin: 0, "--g-away": colors.away, "--g-home": colors.home } as CSSProperties}>
      <Versus away={{ id: awayId, big: shownA, sub: awaySub }} home={{ id: homeId, big: shownH, sub: homeSub }} share={share} label={look === "bar" ? undefined : label} density={density} />
      {look === "bar" && <figcaption className="gauge-label vs-cap">{label}</figcaption>}
    </figure>
  );
}
