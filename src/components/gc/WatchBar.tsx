import type { CSSProperties } from "react";
import type { Team } from "../../types";
import { gaugeColors } from "../../lib/kits";
import { tierOf } from "../../lib/watchability.mjs";
import { Versus } from "../Versus";
import "../recap-panels.css";

/**
 * The game's watchability (0 to 100) and its word ("Worth a look"), drawn as one of the stat bars: the label, the number and the tier above a bar filled to the score.
 * It sits at the top of the Game Center's overview column, right above the projected final score.
 */
export function WatchBar({ score, away, home }: { score: number; away: Team; home: Team }) {
  const tier = tierOf(score);
  const c = gaugeColors(away.id, home.id);
  return (
    <figure className="gauge versus tile gc-watch" data-testid="gc-watch" data-tier={tier.key} role="img" aria-label={`Watchability: ${score} out of 100, ${tier.label}`} style={{ margin: 0, "--g-away": c.away, "--g-home": c.home } as CSSProperties}>
      <span className="gt-label gauge-label">Watchability</span>
      <div className="gt-vals"><b className="a">{score}</b><i aria-hidden="true" /><b className="h">{tier.label}</b></div>
      <Versus away={{ id: away.id, big: score }} home={{ id: home.id, big: tier.label }} share={Math.min(1, Math.max(0, score / 100))} density="track" />
    </figure>
  );
}
