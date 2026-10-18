import { useEffect, useRef, useState } from "react";

const THRESHOLD = 72; // px of (damped) pull needed to refresh

/**
 * Pull-to-refresh for phone lists: drag down from the top of the page and let go. Returns how far along the pull is
 * (0 to about 1.4) and whether a refresh was just triggered, for the indicator. The page keeps its normal scrolling.
 */
export function usePullToRefresh(onRefresh: () => void, enabled: boolean) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  // The gesture's state and the latest callback live in refs, so re-renders (the indicator updates state) never reset a pull.
  const gesture = useRef({ startY: 0, active: false, dist: 0 });
  const latest = useRef(onRefresh);
  latest.current = onRefresh;
  useEffect(() => {
    if (!enabled) return;
    const g = gesture.current;
    const start = (e: TouchEvent) => {
      g.active = e.touches.length === 1 && window.scrollY <= 0 && !document.querySelector("dialog[open]");
      g.startY = e.touches[0]?.clientY ?? 0;
      g.dist = 0;
    };
    const move = (e: TouchEvent) => {
      if (!g.active) return;
      const dy = (e.touches[0]?.clientY ?? 0) - g.startY;
      if (dy <= 0 || window.scrollY > 0) {
        g.active = false;
        setPull(0);
        return;
      }
      g.dist = dy * 0.5;
      setPull(Math.min(g.dist / THRESHOLD, 1.4));
    };
    const end = () => {
      if (!g.active) return;
      g.active = false;
      setPull(0);
      if (g.dist >= THRESHOLD) {
        setBusy(true);
        latest.current();
        window.setTimeout(() => setBusy(false), 900);
      }
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    window.addEventListener("touchcancel", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [enabled]);
  return { pull, busy };
}
