import { useMemo, useState } from "react";
import type { Shot } from "../../../lib/moneypuck-types";
import type { Team } from "../../../types";
import { clockLabel } from "../../../lib/nhlplus.mjs";
import { shotLocation, shotTypeLabel } from "./logic.mjs";
import { flowColors } from "./ChanceFlowChart";
import { useMarkerTips } from "./tip";
import { fmt } from "../shared/format";

/** Half rink, every shot attacking toward the net on the right (arena-adjusted coordinates). Size is xG; goals carry a white ring. */
export function ShotMap({ shots, away, home, playoff }: { shots: Shot[]; away: Team; home: Team; playoff: boolean }) {
  const [only, setOnly] = useState<string>("both");
  const colors = flowColors(away, home);
  const mapped = useMemo(() => shots.filter((s) => s.x != null && s.y != null && s.x >= 0 && (only === "both" || s.team === only)), [shots, only]);
  const hidden = shots.filter((s) => s.x == null || s.y == null || s.x < 0).length;
  const tips = useMarkerTips(mapped.length);
  // big chances first, small ones on top, goals last: every dot stays reachable
  const order = useMemo(() => mapped.map((_, i) => i).sort((a, b) => (mapped[a].g - mapped[b].g) || (mapped[b].xg - mapped[a].xg)), [mapped]);
  const shot = tips.shown != null ? mapped[tips.shown] : null;
  const colorOf = (id: string) => (id === home.id ? colors.home : colors.away);
  const radius = (xg: number) => 1.3 + 6 * Math.sqrt(Math.max(0, xg));
  const label = (s: Shot) => { const loc = shotLocation(s); return `${s.g ? "Goal" : s.sog ? "Shot on goal" : "Unblocked miss"} · ${s.team} · ${clockLabel(s.t, playoff)}. ${s.by?.name ?? "Shooter unavailable"}, ${shotTypeLabel(s.type)}. ${loc ? `${loc.distance} ft from the net, ${loc.offset} ft off center` : "Location unavailable"}. Expected goal value ${fmt(s.xg, 3)}`; };
  return (
    <figure className="nhlp-map" data-testid="shot-map">
      <figcaption><b>Shot locations</b><span>Unblocked attempts · size is expected-goal value · MoneyPuck</span></figcaption>
      <div role="radiogroup" aria-label="Teams shown" className="nhlp-seg">
        {[["both", "Both"], [away.id, away.id], [home.id, home.id]].map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={only === v} className={only === v ? "on" : ""} onClick={() => setOnly(v)}>{l}</button>
        ))}
      </div>
      <div className="nhlp-chart-wrap">
        <svg viewBox="-2 -46 104 92" role="group" aria-label={`Shot map: ${mapped.length} unblocked attempts attacking the net on the right`}>
          <g className="rink">
            <rect x="0" y="-42.5" width="100" height="85" rx="0" className="rink-boards" />
            <line x1="25" x2="25" y1="-42.5" y2="42.5" className="rink-blue" />
            <line x1="89" x2="89" y1="-38" y2="38" className="rink-red" />
            <path d="M89 -6 A6 6 0 0 0 89 6 Z" className="rink-crease" transform="translate(0 0) scale(1 1)" />
            <rect x="89" y="-3" width="4" height="6" className="rink-net" />
            <circle cx="69" cy="-22" r="15" className="rink-circle" /><circle cx="69" cy="22" r="15" className="rink-circle" />
            <text x="3" y="-36" className="rink-note">Center ice</text>
            <text x="97" y="40" textAnchor="end" className="rink-note">Net</text>
          </g>
          {order.map((i) => { const s = mapped[i]; return (
            <g key={i} role="button" aria-label={label(s)} className={`map-shot${s.g ? " goal" : ""}${tips.shown === i ? " is-on" : ""}`} data-goal={s.g} data-team={s.team} data-testid="map-shot" {...tips.props(i)}>
              <circle className="hit" cx={s.x!} cy={-s.y!} r={radius(s.xg) + 0.8} />
              <circle className="dot" cx={s.x!} cy={-s.y!} r={radius(s.xg)} fill={colorOf(s.team)} stroke={s.g ? "#fff" : "none"} strokeWidth={s.g ? 1.2 : 0} fillOpacity={s.g ? 1 : 0.55} />
            </g>
          ); })}
        </svg>
        {shot && <div className="nhlp-pop" role="tooltip" style={{ left: `${((shot.x! + 2) / 104) * 100}%`, top: `${((-shot.y! + 46) / 92) * 100}%`, transform: `translate(${shot.x! > 50 ? "-100%" : "0"}, ${-shot.y! > 0 ? "-110%" : "10px"})` }}>
          <b>{shot.g ? "Goal" : shot.sog ? "Shot on goal" : "Unblocked miss"} · {shot.team} · {clockLabel(shot.t, playoff)}</b>
          <span>{shot.by?.name ?? "Shooter unavailable"} · {shotTypeLabel(shot.type)}</span>
          <span>{(() => { const l = shotLocation(shot); return l ? `${l.distance} ft from the net, ${l.offset} ft off center` : "Location unavailable"; })()}</span>
          <span>Expected goal value {fmt(shot.xg, 3)}</span><em>MoneyPuck</em>
        </div>}
      </div>
      <p className="nhlp-key"><span><i className="k-shot" />Shot</span><span><i className="k-goal" />Goal</span><span>{away.id} <i className="sw" style={{ background: colors.away }} /> · {home.id} <i className="sw" style={{ background: colors.home }} /></span>{hidden > 0 && <span>{hidden} without a usable location are not drawn</span>}</p>
    </figure>
  );
}
