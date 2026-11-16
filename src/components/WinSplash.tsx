import { useEffect, useRef, useState } from "react";
import type { Game } from "../types";
import { SPLASH, splashWinner } from "../lib/win-splash.mjs";
import { motionOff } from "../motion";
import "./win-splash.css";

/** How long the splash holds before it fades back behind the card. */
export const SPLASH_MS = 7000;
// Games whose splash has already played in this page load: a card that re-renders or remounts goes straight to the faded backdrop.
const played = new Set<number>();

/** True when the game is a win that carries a splash: the card then renders `<WinSplash>` and has the `la-win-card` class. */
export const isSplashWin = (game: Game) => splashWinner(game) != null;

/**
 * When Edmonton ("Play La Bamba"), Minnesota ("Let's Go Crazy!") or Chicago ("Chelsea Dagger") wins, the card shows that team's artwork for seven seconds (from the first moment the card is on screen), then it fades softly to the back of the
 * card and stays there, faded, behind the score. With reduced motion there is no splash: the faded artwork is simply there. Decorative; it never takes clicks.
 */
export function WinSplash({ game }: { game: Game }) {
  const team = splashWinner(game) as keyof typeof SPLASH | null, win = team != null;
  const ref = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<"wait" | "splash" | "back">(() => (played.has(game.id) || motionOff() ? "back" : "wait"));
  // Wait until the card is on screen, then start the splash.
  useEffect(() => {
    if (!win || phase !== "wait") return;
    const el = ref.current;
    if (!el) return;
    const start = () => { played.add(game.id); setPhase("splash"); };
    if (typeof IntersectionObserver === "undefined") { start(); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [win, phase, game.id]);
  // Hold it for seven seconds, then fade it behind the card.
  useEffect(() => {
    if (!win || phase !== "splash") return;
    const timer = window.setTimeout(() => setPhase("back"), SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [win, phase]);
  if (!win) return null;
  return (
    <span ref={ref} className={`la-win ${phase}`} data-testid="win-splash" data-team={team} data-phase={phase} aria-hidden="true" style={{ ["--la-img" as never]: `url(${SPLASH[team!].image})`, ["--la-bg" as never]: SPLASH[team!].bg } as never}>
      <i className="la-back" />
      <i className="la-top" />
    </span>
  );
}
