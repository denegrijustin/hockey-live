import type { CSSProperties, ReactNode } from "react";
import { gaugeColors } from "../lib/kits";
import { TeamLogo } from "./TeamLogo";
import "./versus.css";

export type VsTier = { tone: "good" | "bad"; label: string } | null;
export type VsSide = { id: string; big: ReactNode; sub?: ReactNode; tier?: VsTier; /** Detail kept off the screen (a tooltip), such as the sample size behind a number. */ hint?: string };

/** Black or white, whichever reads on the colour behind it. */
function inkOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#10151c" : "#fff";
}

/**
 * Every head-to-head number in the app, drawn one way: each side's big number (a rank or a value) with a small caption and an optional tier pill (TOP 5, BOTTOM 10),
 * and between them a bar split at the advantage in each team's colour, a mark for Even, and a marker on the split. No text sits on the bar; the numbers and the aria label carry it.
 * `share` is the away side's part of the bar (0..1, .5 = even). Density: "row" for stat rows, "hero" for the big headline numbers, "bar" for the bare bar.
 */
export function Versus({ away, home, share, label, density = "row", className = "" }: {
  away: VsSide; home: VsSide; share: number; label?: ReactNode; density?: "row" | "hero" | "bar" | "track"; className?: string;
}) {
  const s = Math.min(0.96, Math.max(0.04, share));
  const colors = gaugeColors(away.id, home.id);
  const leader = Math.abs(share - 0.5) < 0.02 ? "even" : share > 0.5 ? "away" : "home";
  const side = (x: VsSide, cls: string) => (
    <div className={`vs-side ${cls}`} title={x.hint}>
      {density === "bar" && <TeamLogo id={x.id} size={30} />}
      <b className="vs-big">{x.big}</b>
      {x.sub != null && <small className="vs-sub">{x.sub}</small>}
      {x.tier && <em className={`vs-tier ${x.tier.tone}`}>{x.tier.label}</em>}
    </div>
  );
  return (
    <div className="vs-wrap"><div className={`vs vs-${density === "track" ? "solo" : density} ${className}`} data-leader={leader} style={{ "--g-away": colors.away, "--g-home": colors.home, "--ink-away": inkOn(colors.away), "--ink-home": inkOn(colors.home) } as CSSProperties}>
      {density !== "track" && side(away, "vs-a")}
      <div className="vs-mid">
        {label != null && <span className="vs-label gauge-label">{label}</span>}
        <div className="vs-track" aria-hidden="true">
          <span className="vs-fill" style={{ width: `${s * 100}%` }} />
          <u className="vs-tick" />
          <span className="vs-knob" style={{ left: `${s * 100}%` }} />
        </div>
        {density !== "track" && <span className="vs-even" aria-hidden="true">Even</span>}
      </div>
      {density !== "track" && side(home, "vs-h")}
    </div></div>
  );
}

/** The two teams once, above a list of Versus rows. */
export function VersusHead({ away, home, children }: { away: { id: string; name: string }; home: { id: string; name: string }; children?: ReactNode }) {
  return (
    <div className="vs-head">
      <span><TeamLogo id={away.id} size={28} /><b>{away.name}</b></span>
      {children && <i>{children}</i>}
      <span><b>{home.name}</b><TeamLogo id={home.id} size={28} /></span>
    </div>
  );
}
