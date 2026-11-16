import { useEffect, useRef, useState } from "react";
import type { Game } from "../types";
import { oilersWon } from "../lib/win-splash.mjs";
import { motionOff } from "../motion";
import "./win-splash.css";

/** How long the splash holds before it fades back behind the card. */
export const SPLASH_MS = 7000;
// Games whose splash has already played in this page load: a card that re-renders or remounts goes straight to the faded backdrop.
const played = new Set<number>();

/** True when the game is an Oilers win: the card then carries the splash (`<WinSplash>`) and the `la-win-card` class. */
export const isOilersWin = (game: Game) => oilersWon(game);

/**
 * When Edmonton wins, the card shows the "Play La Bamba" artwork for seven seconds (from the first moment the card is on screen), then it fades softly to the back of the
 * card and stays there, faded, behind the score. With reduced motion there is no splash: the faded artwork is simply there. Decorative; it never takes clicks.
 */
export function WinSplash({ game }: { game: Game }) {
  const win = oilersWon(game);
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
    <span ref={ref} className={`la-win ${phase}`} data-testid="win-splash" data-phase={phase} aria-hidden="true">
      <i className="la-back" />
      <i className="la-top" />
    </span>
  );
}
