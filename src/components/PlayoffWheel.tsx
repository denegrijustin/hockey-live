import { useMemo, useState } from "react";
import type { Team } from "../types";
import { TeamLogo } from "./TeamLogo";
import "./playoff-wheel.css";

/** What the wheel reads from one team's simulation. */
export type WheelOdds = { pPlayoffs: number; pRound2: number | null; pRound3: number | null; pFinal: number | null; pCup: number | null };

/** Rings from the outside in. */
const RINGS: { key: keyof WheelOdds; label: string; short: string }[] = [
  { key: "pPlayoffs", label: "Make the playoffs", short: "Playoffs" },
  { key: "pRound2", label: "Win round 1 (reach round 2)", short: "Round 2" },
  { key: "pRound3", label: "Win round 2 (reach round 3)", short: "Round 3" },
  { key: "pFinal", label: "Win the conference (reach the Final)", short: "Final" },
  { key: "pCup", label: "Win the Stanley Cup", short: "Cup" },
];

const CX = 240, CY = 240, R_OUT = 188, R_IN = 56, R_LOGO = 214, LOGO = 26;
const RING_W = (R_OUT - R_IN) / RINGS.length;
const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (r: number, deg: number) => `${(CX + r * Math.cos(rad(deg))).toFixed(2)} ${(CY + r * Math.sin(rad(deg))).toFixed(2)}`;
/** An annular sector from angle a0 to a1 (degrees, clockwise from 3 o'clock) between radii r0 (inner) and r1 (outer). */
const sector = (r0: number, r1: number, a0: number, a1: number) => `M${pt(r1, a0)}A${r1} ${r1} 0 0 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`;
const show = (p: number) => (p >= 99.5 ? "100" : p < 0.5 ? "<1" : String(Math.round(p)));
const long = (p: number) => (p >= 99.95 ? "100%" : p < 0.05 ? "0%" : p < 1 ? "<1%" : `${p < 10 ? p.toFixed(1) : Math.round(p)}%`);

/**
 * The path to the Cup as one wheel: a wedge for every team (the East on the right, the West on the left, grouped by division), and five rings out to in: the
 * chance to make the playoffs, to win round 1, round 2, the conference, and the Cup. A cell is tinted by how likely it is. Tap or focus a wedge for the exact numbers.
 */
export function PlayoffWheel({ teams, odds, initial }: { teams: Team[]; odds: Record<string, WheelOdds>; initial?: string | null }) {
  const wedges = useMemo(() => {
    // East down the right, West down the left; within a conference the divisions in turn, each by its chance to make it
    const order: Team[] = [];
    for (const c of ["E", "W"]) {
      const ct = teams.filter((t) => t.conference === c && odds[t.id]);
      for (const d of [...new Set(ct.map((t) => t.division))].sort()) order.push(...ct.filter((t) => t.division === d).sort((a, b) => odds[b.id].pPlayoffs - odds[a.id].pPlayoffs || a.name.localeCompare(b.name)));
    }
    const n = order.length || 1, step = 360 / n;
    // the East begins at the top and runs clockwise; the West continues round the left side
    return order.map((t, i) => ({ t, a0: -90 + i * step, a1: -90 + (i + 1) * step, mid: -90 + (i + 0.5) * step }));
  }, [teams, odds]);
  const best = useMemo(() => wedges.slice().sort((a, b) => (odds[b.t.id].pCup ?? 0) - (odds[a.t.id].pCup ?? 0))[0]?.t.id ?? null, [wedges, odds]);
  const [sel, setSel] = useState<string | null>(initial && odds[initial] ? initial : best);
  const cur = teams.find((t) => t.id === sel) ?? null, o = cur ? odds[cur.id] : null;

  return (
    <div className="pw" data-testid="playoff-wheel">
      <svg className="pw-svg" viewBox="0 0 480 480" role="group" aria-label="Playoff wheel: every team's chance to make the playoffs and to win each round. Each wedge is a team.">
        {wedges.map(({ t, a0, a1, mid }) => {
          const x = odds[t.id], c = t.cardColor ?? t.color ?? "#2a4a6a", on = sel === t.id;
          const gap = 0.35;
          const label = `${t.name}: ` + RINGS.map((r) => `${r.short} ${x[r.key] == null ? "n/a" : long(x[r.key] as number)}`).join(", ");
          const flip = Math.cos(rad(mid)) < 0;
          const lx = CX + (R_LOGO + 0) * Math.cos(rad(mid)), ly = CY + R_LOGO * Math.sin(rad(mid));
          return (
            <g key={t.id} className={`pw-wedge${on ? " on" : ""}`} data-team={t.id} tabIndex={0} role="button" aria-pressed={on} aria-label={label}
              onClick={() => setSel(t.id)} onFocus={() => setSel(t.id)} onMouseEnter={() => setSel(t.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(t.id); } }}>
              {RINGS.map((r, k) => {
                const v = x[r.key] as number | null;
                if (v == null) return null;
                const r1 = R_OUT - k * RING_W, r0 = r1 - RING_W;
                // the likelier the outcome, the more of the team's colour in the cell
                const tint = Math.round(34 + 66 * Math.sqrt(Math.min(100, Math.max(0, v)) / 100));
                const rm = (r0 + r1) / 2;
                return (
                  <g key={r.key}>
                    <path d={sector(r0 + 0.4, r1 - 0.4, a0 + gap, a1 - gap)} className="pw-cell" style={{ fill: `color-mix(in srgb, ${c} ${tint}%, var(--surface-3))` }} />
                    <text className="pw-num" transform={`translate(${CX} ${CY}) rotate(${mid}) translate(${rm.toFixed(1)} 0)${flip ? " rotate(180)" : ""}`} textAnchor="middle" dominantBaseline="central">{show(v)}</text>
                  </g>
                );
              })}
              <path d={sector(R_IN, R_OUT, a0 + gap, a1 - gap)} className="pw-hit" />
              <image href={`/logos/${t.id}.svg`} x={lx - LOGO / 2} y={ly - LOGO / 2} width={LOGO} height={LOGO} className="pw-logo" aria-hidden="true" preserveAspectRatio="xMidYMid meet" />
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={R_IN - 2} className="pw-hub" />
        <g className="pw-cup" aria-hidden="true" transform={`translate(${CX} ${CY})`}>
          <path d="M-15 -26h30v10c0 12-6 20-15 22-9-2-15-10-15-22z" />
          <path d="M-15 -23c-9 0-12 4-10 10 2 5 7 8 12 8M15 -23c9 0 12 4 10 10-2 5-7 8-12 8" className="pw-cup-h" />
          <path d="M-4 6h8v10h-8zM-12 16h24v6h-24z" />
        </g>
      </svg>

      <div className="pw-side">
        {cur && o ? (
          <section className="pw-detail" aria-live="polite" aria-label={`${cur.name} path to the Cup`}>
            <h3><TeamLogo id={cur.id} size={28} /> {cur.name}</h3>
            <ol className="pw-rows">
              {RINGS.map((r) => {
                const v = o[r.key] as number | null;
                return (
                  <li key={r.key}>
                    <span>{r.label}</span>
                    <b>{v == null ? "n/a" : long(v)}</b>
                    <span className="pw-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, v ?? 0))}%` }} /></span>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : <p className="pw-hint">Tap a team for its numbers.</p>}
        <p className="pw-key">Rings, from the outside in: <b>make the playoffs</b> · <b>round 2</b> · <b>round 3</b> · <b>the Final</b> · <b>win the Cup</b>. The East is on the right and the West on the left; the deeper the colour, the likelier it is.</p>
      </div>
    </div>
  );
}
