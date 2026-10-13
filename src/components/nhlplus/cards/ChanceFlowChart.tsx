import { useMemo } from "react";
import type { Shot } from "../../../lib/moneypuck-types";
import type { GameFeed, Team } from "../../../types";
import { chanceFlow, clockLabel } from "../../../lib/nhlplus.mjs";
import { clampThrough, lineColors, niceMax, penaltyMarkers, shotLocation, shotTypeLabel, timelineLayout } from "./logic.mjs";
import { useMarkerTips } from "./tip";
import { MetricTip } from "../shared/MetricTip";
import { fmt } from "../shared/format";

const W = 360;
type Item =
  | { kind: "shot" | "goal"; t: number; team: string; y: number; shot: Shot }
  | { kind: "penalty"; t: number; team: string; player: string | null; text: string; minutes: number | null };

/** The home/away colours used by every chart in the cards, so legends and lines always agree. */
export const flowColors = (away: Team, home: Team) => lineColors(away.cardColor ?? away.color, home.cardColor ?? home.color);

/**
 * Chance flow: cumulative expected goals for each team across the whole game clock. Period boundaries, 10-minute ticks,
 * OT periods at their real length. `through` is the game-clock second the line has been filled to (complete games pass
 * the full end); time after it stays unfilled. Markers are focusable (arrow keys move along the game).
 */
export function ChanceFlowChart({ shots, away, home, playoff, periods = 3, through, sit = "all", plays, playsState = "idle", compact = false }: {
  shots: Shot[]; away: Team; home: Team; playoff: boolean; periods?: number; through?: number; sit?: "all" | "5on5" | "5on4" | "4on5";
  plays?: GameFeed["plays"]; playsState?: "idle" | "loading" | "ready" | "unavailable"; compact?: boolean;
}) {
  const layout = useMemo(() => timelineLayout(shots, { playoff, periods }), [shots, playoff, periods]);
  const end = layout.end;
  const upTo = clampThrough(through, end);
  const colors = flowColors(away, home);
  const full = useMemo(() => chanceFlow(shots, home.id, away.id, { sit }), [shots, home.id, away.id, sit]);
  const filled = useMemo(() => chanceFlow(shots, home.id, away.id, { sit, through: upTo }), [shots, home.id, away.id, sit, upTo]);
  const maxFull = Math.max(...full.map((p) => Math.max(p.home, p.away)), 0);
  const top = niceMax(maxFull);
  const H = compact ? 150 : 190;
  const x0 = 30, x1 = W - 8, yTop = 18, yBottom = H - (compact ? 30 : 46), lane = yBottom + 12;
  const X = (t: number) => x0 + (t / end) * (x1 - x0);
  const Y = (v: number) => yBottom - (v / top) * (yBottom - yTop);
  const path = (key: "home" | "away") => {
    let d = `M ${X(0).toFixed(1)} ${Y(0).toFixed(1)}`;
    for (const p of filled.slice(1)) { d += ` H ${X(p.t).toFixed(1)} V ${Y(p[key]).toFixed(1)}` }
    return d + ` H ${X(upTo).toFixed(1)}`;
  };
  const last = filled[filled.length - 1];
  const penalties = useMemo(() => penaltyMarkers(plays, playoff).filter((p) => p.t <= upTo), [plays, playoff, upTo]);
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const p of filled.slice(1)) {
      const s = p.shot as Shot;
      out.push({ kind: s.g ? "goal" : "shot", t: s.t, team: s.team, y: s.team === home.id ? p.home : p.away, shot: s });
    }
    for (const p of penalties) out.push({ kind: "penalty", t: p.t, team: p.team!, player: p.player, text: p.text, minutes: p.minutes });
    return out.sort((a, b) => a.t - b.t);
  }, [filled, penalties, home.id]);
  const tips = useMarkerTips(items.length);
  const name = (id: string) => (id === home.id ? home : away);
  const colorOf = (id: string) => (id === home.id ? colors.home : colors.away);
  const describe = (it: Item) => {
    if (it.kind === "penalty") return { title: `${it.team} penalty · ${clockLabel(it.t, playoff)}`, lines: [[it.player, it.text, it.minutes ? `${it.minutes} min` : null].filter(Boolean).join(" · ")], source: "NHL feed" };
    const s = it.shot, loc = shotLocation(s);
    return {
      title: `${it.kind === "goal" ? "Goal" : s.sog ? "Shot on goal" : "Unblocked miss"} · ${it.team} · ${clockLabel(it.t, playoff)}`,
      lines: [
        `${s.by?.name ?? "Shooter unavailable"} · ${shotTypeLabel(s.type)}`,
        loc ? `${loc.distance} ft from the net, ${loc.offset} ft off center` : "Location unavailable",
        `Expected goal value ${fmt(s.xg, 3)}`,
      ],
      source: "MoneyPuck",
    };
  };
  const aria = (it: Item) => { const d = describe(it); return `${d.title}. ${d.lines.join(". ")}`; };
  const shownItem = tips.shown != null ? items[tips.shown] : null;
  const shownPos = shownItem ? { left: (X(shownItem.t) / W) * 100, top: ((shownItem.kind === "penalty" ? lane : Y((shownItem as any).y)) / H) * 100 } : null;
  const sitLabel = sit === "all" ? "" : ` (${sit === "5on5" ? "5-on-5" : sit === "5on4" ? "power play" : "penalty kill"} shots only)`;
  const finalAway = last.away, finalHome = last.home;
  return (
    <figure className={`nhlp-flow${compact ? " nhlp-flow-compact" : ""}`} data-testid="chance-flow">
      <figcaption>
        <MetricTip id="chanceFlow"><b>Chance flow</b></MetricTip>
        <span>Cumulative expected goals{sitLabel}</span>
      </figcaption>
      <ul className="nhlp-legend" aria-label="Legend">
        <li><i style={{ background: colors.away }} />{away.id} <b>{fmt(finalAway)}</b> xG</li>
        <li><i className="dash" style={{ background: colors.home }} />{home.id} <b>{fmt(finalHome)}</b> xG</li>
      </ul>
      <div className="nhlp-chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Chance flow, cumulative expected goals: ${away.id} ${fmt(finalAway)}, ${home.id} ${fmt(finalHome)}. Markers are focusable; use the arrow keys.`}
          data-end={end} data-through={upTo} data-final-away={finalAway} data-final-home={finalHome} data-top={top}>
          {upTo < end && <rect className="flow-future" x={X(upTo)} y={yTop} width={X(end) - X(upTo)} height={yBottom - yTop} data-testid="flow-future" />}
          {[0, top / 2, top].map((v) => <g key={v} className="flow-grid"><line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} /><text x={x0 - 4} y={Y(v) + 3} textAnchor="end">{Number.isInteger(v) ? v : v.toFixed(1)}</text></g>)}
          {layout.spans.map((s) => <text key={s.period} className="flow-period" x={(X(s.start) + X(s.end)) / 2} y={11} textAnchor="middle" data-period={s.label}>{s.label}</text>)}
          {layout.boundaries.map((t) => <line key={t} className="flow-boundary" x1={X(t)} x2={X(t)} y1={yTop - 4} y2={yBottom} data-t={t} data-testid="flow-boundary" />)}
          {layout.ticks.map((tk) => <g key={tk.t} className="flow-tick" data-t={tk.t} data-testid="flow-tick"><line x1={X(tk.t)} x2={X(tk.t)} y1={yBottom} y2={yBottom + 3} /><text x={X(tk.t)} y={yBottom + (compact ? 13 : 13)} textAnchor="middle">{tk.label}</text></g>)}
          <text className="flow-axis-label" x={(x0 + x1) / 2} y={yBottom + 25} textAnchor="middle">Game minute</text>
          <path className="flow-line" d={path("away")} stroke={colors.away} data-team={away.id} data-xg={finalAway} data-testid="flow-line-away" />
          <path className="flow-line dashed" d={path("home")} stroke={colors.home} data-team={home.id} data-xg={finalHome} data-testid="flow-line-home" />
          {items.map((it, i) => {
            const cx = X(it.t), cy = it.kind === "penalty" ? lane : Y(it.y), col = colorOf(it.team);
            return (
              <g key={i} role="button" aria-label={aria(it)} className={`flow-marker ${it.kind}${tips.shown === i ? " is-on" : ""}`} data-kind={it.kind} data-team={it.team} data-t={it.t} data-testid={`marker-${it.kind}`} {...tips.props(i)}>
                <circle className="hit" cx={cx} cy={cy} r={8} />
                {it.kind === "penalty"
                  ? <polygon points={`${cx},${cy - 4.5} ${cx + 4.5},${cy + 3.5} ${cx - 4.5},${cy + 3.5}`} fill={col} />
                  : <circle className="dot" cx={cx} cy={cy} r={it.kind === "goal" ? 4.6 : 2.2} fill={col} />}
              </g>
            );
          })}
        </svg>
        {shownItem && shownPos && (() => { const d = describe(shownItem); return (
          <div className="nhlp-pop" role="tooltip" data-testid="marker-tip" style={{ left: `${shownPos.left}%`, top: `${shownPos.top}%`, transform: `translate(${shownPos.left > 55 ? "-100%" : "0"}, ${shownPos.top > 60 ? "-110%" : "10px"})` }}>
            <b>{d.title}</b>{d.lines.map((l, k) => <span key={k}>{l}</span>)}<em>{d.source}</em>
          </div>); })()}
      </div>
      <p className="nhlp-key">
        <span><i className="k-shot" />Shot</span><span><i className="k-goal" />Goal <em>MoneyPuck</em></span>
        <span><i className="k-pen" />Penalty <em>NHL feed{playsState === "unavailable" ? " unavailable" : playsState === "loading" ? " loading" : ""}</em></span>
        {upTo < end && <span>Unfilled: not yet played</span>}
      </p>
    </figure>
  );
}

/** A tiny non-interactive version for the compact in-game card. */
export function FlowSparkline({ shots, away, home, playoff, periods = 3 }: { shots: Shot[]; away: Team; home: Team; playoff: boolean; periods?: number }) {
  const layout = timelineLayout(shots, { playoff, periods });
  const colors = flowColors(away, home);
  const pts = chanceFlow(shots, home.id, away.id, {});
  const top = niceMax(Math.max(...pts.map((p) => Math.max(p.home, p.away)), 0));
  const w = 160, h = 34;
  const X = (t: number) => (t / layout.end) * w, Y = (v: number) => h - 2 - (v / top) * (h - 6);
  const path = (k: "home" | "away") => pts.slice(1).reduce((d, p) => d + ` H ${X(p.t).toFixed(1)} V ${Y(p[k]).toFixed(1)}`, `M 0 ${Y(0)}`) + ` H ${w}`;
  return (
    <svg className="nhlp-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Chance flow: ${away.id} ${fmt(pts[pts.length - 1].away)} xG, ${home.id} ${fmt(pts[pts.length - 1].home)} xG`} data-testid="flow-spark">
      {layout.boundaries.map((t) => <line key={t} x1={X(t)} x2={X(t)} y1={0} y2={h} className="spark-b" />)}
      <path d={path("away")} stroke={colors.away} className="spark-line" vectorEffect="non-scaling-stroke" />
      <path d={path("home")} stroke={colors.home} className="spark-line dashed" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
