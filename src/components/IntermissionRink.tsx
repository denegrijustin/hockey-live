import { useEffect, useMemo, useRef, useState } from "react";
import type { Game, Team } from "../types";
import { INTERMISSION_MS, clockText, intermissionLeft, parseClock, resurfacePath, resurfaceProgress, exitProgress, EXIT_PATH, zamboniColors, zamboniPose, FINISH_S } from "../lib/intermission.mjs";

const SEEN = (g: Game) => `iceboard-int-${g.id}-${g.period ?? 0}`;
/** When this intermission was first seen, kept so a reload doesn't restart the fallback clock. */
function firstSeen(g: Game) {
  const now = Date.now();
  try {
    const saved = Number(localStorage.getItem(SEEN(g)));
    if (Number.isFinite(saved) && saved > 0 && now - saved < 3 * 3_600_000 && saved <= now) return saved;
    localStorage.setItem(SEEN(g), String(now));
  } catch {
    /* private mode: count from this visit */
  }
  return now;
}

/** Seconds left of the intermission: the feed's clock, run on between polls. */
export function useIntermissionLeft(game: Game) {
  const base = parseClock(game.clock);
  const reading = useRef({ base, at: Date.now() });
  if (reading.current.base !== base) reading.current = { base, at: Date.now() };
  const [seenAt] = useState(() => firstSeen(game));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => !document.hidden && setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => clearInterval(t);
  }, []);
  const deadline = useRef(0);
  deadline.current = reading.current.base != null ? reading.current.at + reading.current.base * 1000 : seenAt + INTERMISSION_MS;
  return { left: intermissionLeft({ base: reading.current.base, at: reading.current.at, seenAt, now }), deadline };
}

/** Drives the Zamboni along its route and lays the fresh ice down behind it, together, from one clock. */
function useResurfacing(still: boolean, deadline: { current: number }) {
  const path = useRef<SVGPathElement>(null);
  const gate = useRef<SVGPathElement>(null);
  const machine = useRef<SVGGElement>(null);
  const root = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const route = path.current, out = gate.current, z = machine.current, svg = root.current;
    if (still || !route || !out || !z || !svg) return;
    const len = route.getTotalLength(), outLen = out.getTotalLength();
    let raf = 0, visible = true;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      // The job is paced to the clock: it starts with the intermission and is done when 10 seconds are left.
      const left = (deadline.current - Date.now()) / 1000;
      const p = resurfaceProgress(left), q = exitProgress(left);
      // With the laps done it drives off through the gate and is out of sight (past the boards) with 10 seconds left.
      const a = q > 0 ? out.getPointAtLength(q * outLen) : route.getPointAtLength(p * len);
      const b = q > 0 ? out.getPointAtLength(Math.min(outLen, q * outLen + 0.8)) : route.getPointAtLength(Math.min(len, p * len + 0.8));
      const pose = zamboniPose(a, b, p);
      z.setAttribute("transform", `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) rotate(${pose.deg.toFixed(1)})`);
      route.style.strokeDashoffset = String(pose.fresh);
    };
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io?.observe(svg);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [still]);
  return { path, gate, machine, root };
}

// Scuffs in the ice, drawn in a fixed pattern (the fresh strip paints over them as the Zamboni passes).
const SCUFFS = Array.from({ length: 46 }, (_, i) => {
  const x = 8 + ((i * 73) % 184);
  const y = 6 + ((i * 41) % 74);
  const w = 6 + ((i * 17) % 10);
  return `M${x} ${y}q${w / 2} ${-3 - (i % 3)} ${w} ${(i % 2 ? 1 : -1) * 2}`;
});

/**
 * Between periods: the countdown to the next period and a Zamboni resurfacing the ice, two laps of the boards and a pass down the middle,
 * leaving a fresh, glossy strip behind it. It repeats until the intermission ends. Still (no moving Zamboni) for reduced motion.
 */
export function IntermissionRink({ game, home, away, compact = false }: { game: Game; home: Team; away: Team; compact?: boolean }) {
  const { left, deadline } = useIntermissionLeft(game);
  const colors = useMemo(() => zamboniColors(home.cardColor ?? home.color), [home.cardColor, home.color]);
  const route = useMemo(() => resurfacePath(), []);
  const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const next = game.period ? (game.period >= 3 ? "overtime" : `period ${game.period + 1}`) : "the next period";
  const { path, gate, machine, root } = useResurfacing(still, deadline);
  const id = `rink-${game.id}${compact ? "-c" : ""}`;
  return (
    <section className={`intermission${compact ? " compact" : ""}`} data-testid="intermission" aria-label={`Intermission after period ${game.period ?? ""}. ${left > 0 ? `${clockText(left)} until ${next}` : `${next} about to start`}. The Zamboni is resurfacing the ice.`}>
      <div className="int-count" aria-hidden="true">
        <span className="int-k">INTERMISSION{game.period ? ` · END OF P${game.period}` : ""}</span>
        <strong className="int-t">{clockText(left)}</strong>
        <span className="int-l">{left > 0 ? `until ${next}` : `${next} about to start`}</span>
      </div>
      <svg ref={root} viewBox="0 0 200 85" className="int-rink" aria-hidden="true">
        <defs>
          <clipPath id={`${id}-ice`}><rect x="3" y="3" width="194" height="79" rx="26" /></clipPath>
        </defs>
        {/* boards, with the yellow kick plate */}
        <rect x="0.8" y="0.8" width="198.4" height="83.4" rx="29" className="int-boards" />
        <rect x="2.4" y="2.4" width="195.2" height="80.2" rx="27" className="int-kick" />
        <g clipPath={`url(#${id}-ice)`}>
          <rect x="0" y="0" width="200" height="85" className="int-ice" />
          <g className="int-scuffs">{SCUFFS.map((d, i) => <path key={i} d={d} />)}</g>
          {/* the fresh ice the Zamboni leaves: it draws along the route as the machine moves */}
          <path ref={gate} d={EXIT_PATH} fill="none" stroke="none" />
          <path ref={path} d={route} pathLength={100} className={`int-fresh${still ? " done" : ""}`} />
          {/* markings */}
          <g className="int-marks">
            <path d="M11 3V82M189 3V82" className="int-goal" />
            <path d="M75 3V82M125 3V82" className="int-blue" />
            <path d="M100 3V82" className="int-red" />
            {[[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5]].map(([x, y]) => (
              <g key={x + "-" + y}><circle cx={x} cy={y} r="15" className="int-circle" /><circle cx={x} cy={y} r="1.3" className="int-dot" /></g>
            ))}
            {[[80, 20.5], [80, 64.5], [120, 20.5], [120, 64.5]].map(([x, y]) => <circle key={x + "-" + y} cx={x} cy={y} r="1.3" className="int-dot" />)}
            <circle cx="100" cy="42.5" r="15" className="int-circle blue" />
            <path d="M11 36.5a6 6 0 0 1 0 12M189 36.5a6 6 0 0 0 0 12" className="int-crease" />
            <rect x="5.5" y="38.5" width="5.5" height="8" rx="1" className="int-net" />
            <rect x="189" y="38.5" width="5.5" height="8" rx="1" className="int-net" />
          </g>
          <image href={`/logos/${home.id}.svg`} x="89" y="31.5" width="22" height="22" preserveAspectRatio="xMidYMid meet" />
        </g>
        <rect x="0.6" y="36" width="4.4" height="13" rx="0.8" className="int-gate" />
        {!still && (
          <g>
            <g ref={machine} className="int-zamboni" style={{ "--z-body": colors.body, "--z-cab": colors.cab, "--z-edge": colors.edge, "--z-sign": colors.sign, "--z-accent": colors.accent } as React.CSSProperties}>
              <ellipse cx="0" cy="0.8" rx="15" ry="7.6" className="int-zshadow" />
              <rect x="-15" y="-4.6" width="3" height="9.2" rx="0.8" className="int-cond" />
              <rect x="-12" y="-6" width="25" height="12" rx="2.2" className="int-zbody" />
              {[[-9.5, -7.4], [-9.5, 5.2], [6.5, -7.4], [6.5, 5.2]].map(([x, y]) => <rect key={x + "," + y} x={x} y={y} width="4.4" height="2.2" rx="0.8" className="int-tire" />)}
              <rect x="3.6" y="-4.2" width="8" height="8.4" rx="1.6" className="int-cab" />
              <circle cx="8" cy="0" r="1.9" className="int-driver" />
              <rect x="-10" y="-4.4" width="11.5" height="8.8" rx="1" className="int-sign" />
              <text x="-4.25" y="-1.7" className="int-sign-t" textAnchor="middle">BRING</text>
              <text x="-4.25" y="0.9" className="int-sign-t gold" textAnchor="middle">NHL TO</text>
              <text x="-4.25" y="3.4" className="int-sign-t" textAnchor="middle">KC</text>
            </g>
          </g>
        )}
      </svg>
      <p className="int-cap"><span aria-hidden="true">🧊</span> {away.short} at {home.short} · {left > FINISH_S ? "the Zamboni is resurfacing the ice" : "fresh ice for the next period"}</p>
    </section>
  );
}
