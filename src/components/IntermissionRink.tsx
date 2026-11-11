import { useEffect, useMemo, useRef, useState } from "react";
import { motionOff } from "../motion";
import type { Game, Team } from "../types";
import { INTERMISSION_MS, clockText, intermissionLeft, parseClock, resurfacePath, lapState, exitProgress, EXIT_PATH, ENTER_PATH, ENTER_S, enterProgress, zamboniColors, resurfacingMotion, FINISH_S, firstSeenAt } from "../lib/intermission.mjs";
import { LogoImage } from "./TeamLogo";

const SEEN = (g: Game) => `iceboard-int-${g.id}-${g.period ?? 0}`;
/** When this intermission was first seen, kept so a reload doesn't restart the fallback clock (storage may be blocked; stale keys are pruned). */
const firstSeen = (g: Game) => firstSeenAt(() => localStorage, SEEN(g), Date.now());

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
  const paint = useRef<SVGPathElement>(null);
  const sign = useRef<SVGGElement>(null);
  const gate = useRef<SVGPathElement>(null);
  const inlet = useRef<SVGPathElement>(null);
  const sheen = useRef<SVGPathElement>(null);
  const machine = useRef<SVGGElement>(null);
  const root = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const route = path.current, out = gate.current, inn = inlet.current, z = machine.current, svg = root.current;
    if (still || !route || !out || !inn || !z || !svg) return;
    const len = route.getTotalLength(), outLen = out.getTotalLength();
    const motion = resurfacingMotion((s: number) => route.getPointAtLength(s), len);
    const exit = resurfacingMotion((s: number) => out.getPointAtLength(s), outLen);
    const enter = resurfacingMotion((s: number) => inn.getPointAtLength(s), inn.getTotalLength());
    paint.current?.setAttribute("d", motion.trail);
    sheen.current?.setAttribute("d", motion.trail);
    let raf = 0, visible = true, last = 0, lastQ = -1, lastFresh = "";
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // 30 frames a second is smooth at this speed and halves the style and paint work (several rinks can be on screen at once).
      if (!visible || document.hidden || now - last < 33) return;
      last = now;
      // The job is paced to the clock: it starts with the intermission and is done when 10 seconds are left.
      const left = (deadline.current - Date.now()) / 1000;
      // It drives in through the gate for the first ENTER_S seconds (the laps are paced from when it arrives), so it never pops onto the ice.
      const e = enterProgress(left), lap = lapState(left, INTERMISSION_MS / 1000 - ENTER_S), p = lap.progress, q = exitProgress(left);
      // With the laps done it drives off through the gate and is out of sight (past the boards) with 10 seconds left.
      const pose = q > 0 ? exit.at(q) : e < 1 ? enter.at(e) : motion.at(p);
      z.setAttribute("transform", `translate(${pose.x.toFixed(3)} ${pose.y.toFixed(3)}) rotate(${pose.deg.toFixed(3)})`);
      // Keep the roof placard level and legible even during a U-turn.
      sign.current?.setAttribute("transform", `rotate(${-pose.deg})`);
      const fresh = String(q > 0 || lap.laid ? 0 : e < 1 ? 100 : pose.fresh);
      if (paint.current && fresh !== lastFresh) paint.current.style.strokeDashoffset = sheen.current!.style.strokeDashoffset = lastFresh = fresh;
      // A custom property on the root restyles everything under it, so it is only written when it changes.
      if (q !== lastQ) svg.style.setProperty("--ice-finish", String((lastQ = q)));
    };
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io?.observe(svg);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [still]);
  return { path, paint, sheen, sign, gate, inlet, machine, root };
}

// Scuffs in the ice, drawn in a fixed pattern (the fresh strip paints over them as the Zamboni passes).
const SCUFFS = Array.from({ length: 46 }, (_, i) => {
  const x = 8 + ((i * 73) % 184);
  const y = 6 + ((i * 41) % 74);
  const w = 6 + ((i * 17) % 10);
  return `M${x} ${y}q${w / 2} ${-3 - (i % 3)} ${w} ${(i % 2 ? 1 : -1) * 2}`;
});

/**
 * Between periods: the countdown to the next period and a Zamboni resurfacing the ice, continuous lengthwise passes,
 * leaving a fresh, glossy strip behind it. It finishes once, then drives through the gate. Still (no moving Zamboni) for reduced motion.
 */
export function IntermissionRink({ game, home, away, compact = false }: { game: Game; home: Team; away: Team; compact?: boolean }) {
  const { left, deadline } = useIntermissionLeft(game);
  const colors = useMemo(() => zamboniColors(home.cardColor ?? home.color), [home.cardColor, home.color]);
  const route = useMemo(() => resurfacePath(), []);
  const still = motionOff();
  const next = game.period ? (game.period >= 3 ? "overtime" : `period ${game.period + 1}`) : "the next period";
  const { path, paint, sheen, sign, gate, inlet, machine, root } = useResurfacing(still, deadline);
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
          <path ref={inlet} d={ENTER_PATH} fill="none" stroke="none" />
          <path ref={path} d={route} fill="none" stroke="none" />
          <path ref={paint} d={route} pathLength={100} className={`int-fresh${still ? " done" : ""}`} />
          {/* a faint lighter sheen down the middle of each fresh pass: resurfaced ice is smoother and catches the light */}
          <path ref={sheen} d={route} pathLength={100} className={`int-sheen${still ? " done" : ""}`} />
          <rect width="200" height="85" className={`int-finish${still ? " done" : ""}`} />
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
          <LogoImage id={home.id} x={89} y={31.5} size={22} bare />
        </g>
        <rect x="0.6" y="36" width="4.4" height="13" rx="0.8" className="int-gate" />
        {!still && (
          <g>
            <g ref={machine} className="int-zamboni" style={{ "--z-body": colors.body, "--z-cab": colors.cab, "--z-edge": colors.edge, "--z-sign": colors.sign, "--z-accent": colors.accent } as React.CSSProperties}>
              <ellipse cx="0.8" cy="1.2" rx="13.4" ry="7.2" className="int-zshadow" />
              {/* the wash-water film the blade leaves, then the conditioner: steel housing as wide as the strip it resurfaces, blade lip, auger */}
              <path d="M-12.3 -5.8v11.6" className="int-water" />
              <path d="M-8.3 -3.3h1.2M-8.3 3.3h1.2" className="int-hitch" />
              <rect x="-11.8" y="-6.75" width="3.6" height="13.5" rx="0.9" className="int-cond" />
              <path d="M-11.8 -6.2V6.2" className="int-blade" />
              <path d="M-10.3 -6V6" className="int-auger" />
              {/* tires showing beside the body: drive wheels at the back, steering wheels at the front */}
              {[[-6.9, -6.5], [-6.9, 4.6], [6.4, -6.1], [6.4, 4.4]].map(([x, y]) => <rect key={x + "," + y} x={x} y={y} width="4.6" height="1.9" rx="0.6" className="int-tire" />)}
              <g className="int-chassis">
                {/* snow tank (ribbed lid) behind the operator, hood and nose in front */}
                <rect x="-8.4" y="-5" width="11.2" height="10" rx="1.7" className="int-zbody" />
                <rect x="-7.3" y="-3.9" width="9" height="7.8" rx="1.1" className="int-lid" />
                <path d="M-5 -3.9V3.9M-2.6 -3.9V3.9M-0.2 -3.9V3.9" className="int-rib" />
                <path d="M2.6 -4.5H11.2Q13.9 -4.5 13.9 -2V2Q13.9 4.5 11.2 4.5H2.6Z" className="int-zbody" />
                <path d="M3.4 -3.5H11.4M3.4 3.5H11.4" className="int-zstripe" />
                <path d="M-6.5 -4.3H10.8" className="int-body-shine" />
                {/* operator's seat, the operator in a jacket and cap, steering wheel and column */}
                <rect x="3.5" y="-2.8" width="3.6" height="5.6" rx="1" className="int-seat" />
                <ellipse cx="5.1" cy="0" rx="1.5" ry="2.5" className="int-driver-coat" />
                <circle cx="5.4" cy="0" r="1.05" className="int-driver" />
                <path d="M4.6 -0.9Q5.4 -1.7 6.2 -0.9" className="int-cap" />
                <path d="M7.1 0H8.5" className="int-col" />
                <ellipse cx="8.8" cy="0" rx="0.6" ry="1.9" className="int-wheel" />
                <rect x="13" y="-3.3" width="0.9" height="1.5" rx="0.3" className="int-lamp" />
                <rect x="13" y="1.8" width="0.9" height="1.5" rx="0.3" className="int-lamp" />
                <path d="M14 -3.9V3.9" className="int-bumper" />
                <circle cx="-7" cy="-3.6" r="0.7" className="int-beacon" />
              </g>
              {/* the roof placard rides on the tank lid and stays level through turns */}
              <g transform="translate(-2.9 0)">
                <g ref={sign} className="int-placard">
                  <rect x="-5.8" y="-1.4" width="11.6" height="2.8" rx="0.7" className="int-sign" />
                  <text x="0" y="0.45" className="int-sign-t" textAnchor="middle" textLength="10.4" lengthAdjust="spacingAndGlyphs">BRING NHL TO KC</text>
                </g>
              </g>
            </g>
          </g>
        )}
      </svg>
      <p className="int-cap"><span aria-hidden="true">🧊</span> {away.short} at {home.short} · {left > FINISH_S ? "the Zamboni is resurfacing the ice" : "fresh ice for the next period"}</p>
    </section>
  );
}
