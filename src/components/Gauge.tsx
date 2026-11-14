import type { CSSProperties } from "react";
import { gaugeColors } from "../lib/kits";
import { Versus } from "./Versus";
import { TeamLogo } from "./TeamLogo";
import "./gauge.css";

/** compact, standard and expanded keep their names for callers; "sm" = compact and "lg" = standard are legacy aliases. The look no longer depends on them. */
export type GaugeSize = "compact" | "standard" | "expanded" | "sm" | "lg";

/**
 * One two-sided number, drawn as the head-to-head bar (see Versus): the away side's number on the left, the home side's on the right, and a bar split at who has the
 * advantage. For "deserved to win" and the projected score (`look`), and for every head-to-head stat, so they all read the same way.
 */
export function Gauge({ away, home, awayId, homeId, label, format = (v: number) => String(v), percent = false, size = "compact", span, lowerBetter = false, awayText, homeText, awaySub, homeSub, needle, stretch = false, look, caption }: {
  away: number; home: number; awayId: string; homeId: string; label: string; format?: (v: number) => string; percent?: boolean; size?: GaugeSize;
  /** For numbers that are not shares of a total (a save percentage, goals against): the gap that swings the bar all the way. */
  span?: number; lowerBetter?: boolean; awayText?: string; homeText?: string;
  /** A smaller second line under each side's number (the win chance under a projected score). */
  awaySub?: string; homeSub?: string;
  /** Where the split sits (the away side's share, 0..1) when it is not simply the split of the two numbers shown. */
  needle?: number;
  /** Kept for callers: every gauge is a bar now. */
  stretch?: boolean;
  /** "proj": the projected-final-score headline (big numbers); "bar": the deserved-to-win bar with logos; "tile": a stat tile (label, both values in team colours, a bar). */
  look?: "proj" | "bar" | "tile";
  /** Under the projected score (the "proj" look). */
  caption?: string;
}) {
  const total = away + home;
  const share = needle != null ? needle : span ? Math.min(0.95, Math.max(0.05, 0.5 + ((away - home) / span / 2) * (lowerBetter ? -1 : 1))) : total > 0 ? away / total : 0.5;
  const shownA = awayText ?? (percent ? `${away}%` : format(away)), shownH = homeText ?? (percent ? `${home}%` : format(home));
  const text = `${awayId} ${shownA}${awaySub ? ` (${awaySub})` : ""}, ${homeId} ${shownH}${homeSub ? ` (${homeSub})` : ""}`;
  const leader = share > 0.52 ? "away" : share < 0.48 ? "home" : "even";
  const variant = size === "sm" ? "compact" : size === "lg" ? "standard" : size;
  const colors = gaugeColors(awayId, homeId);
  const density = look === "proj" ? "hero" : look === "bar" ? "bar" : "row";
  if (look === "proj") {
    const a = Math.round(share * 100);
    return (
      <figure className={`gauge versus proj ${variant}`} data-leader={leader} data-lopsided={Math.min(1, Math.abs(share - 0.5) * 2).toFixed(2)} role="img" aria-label={`${label}: ${text}`} style={{ margin: 0, "--g-away": colors.away, "--g-home": colors.home } as CSSProperties}>
        <div className="gp-top">
          <div className="gp-team"><TeamLogo id={awayId} size={72} /><b>{awayId}</b></div>
          <div className="gp-score"><span className="a">{shownA}</span><i aria-hidden="true">–</i><span className="h">{shownH}</span></div>
          <div className="gp-team"><TeamLogo id={homeId} size={72} /><b>{homeId}</b></div>
        </div>
        {caption && <figcaption className="gp-cap gauge-label">{caption}</figcaption>}
        <div className="gp-prob" aria-hidden="true"><span className="a" style={{ width: `${Math.min(96, Math.max(4, a))}%` }}>{awaySub ?? `${a}%`}</span><span className="h">{homeSub ?? `${100 - a}%`}</span></div>
      </figure>
    );
  }
  if (look === "tile") {
    return (
      <figure className={`gauge versus tile ${stretch ? "stretch" : ""} ${variant}`} data-leader={leader} data-lopsided={Math.min(1, Math.abs(share - 0.5) * 2).toFixed(2)} role="img" aria-label={`${label}: ${text}`} style={{ margin: 0, "--g-away": colors.away, "--g-home": colors.home } as CSSProperties}>
        <span className="gt-label gauge-label">{label}</span>
        <div className="gt-vals"><b className="a">{shownA}</b><i aria-hidden="true" /><b className="h">{shownH}</b></div>
        <Versus away={{ id: awayId, big: shownA }} home={{ id: homeId, big: shownH }} share={share} density="track" />
      </figure>
    );
  }
  return (
    <figure className={`gauge versus ${look ?? ""} ${look === "bar" ? "sbar" : ""} ${stretch ? "stretch" : ""} ${variant}`} data-leader={leader} data-lopsided={Math.min(1, Math.abs(share - 0.5) * 2).toFixed(2)} role="img" aria-label={`${label}: ${text}`} style={{ margin: 0, "--g-away": colors.away, "--g-home": colors.home } as CSSProperties}>
      <Versus away={{ id: awayId, big: shownA, sub: awaySub }} home={{ id: homeId, big: shownH, sub: homeSub }} share={share} label={label} density={density} />
    </figure>
  );
}
