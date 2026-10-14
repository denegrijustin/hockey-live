import { useCallback, useRef, useState } from "react";

/** Hover / keyboard-focus / tap tooltips for a list of markers, with a roving tab stop and arrow-key navigation. */
export function useMarkerTips(count: number) {
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const refs = useRef<(SVGGElement | null)[]>([]);
  const shown = pinned ?? hover ?? focus;
  const go = useCallback((i: number) => {
    const n = Math.max(0, Math.min(count - 1, i));
    setActive(n);
    refs.current[n]?.focus();
  }, [count]);
  const props = (i: number) => ({
    ref: (el: SVGGElement | null) => { refs.current[i] = el; },
    tabIndex: i === Math.min(active, Math.max(0, count - 1)) ? 0 : -1,
    onMouseEnter: () => setHover(i),
    onMouseLeave: () => setHover((h) => (h === i ? null : h)),
    onFocus: () => { setFocus(i); setActive(i); },
    onBlur: () => setFocus((f) => (f === i ? null : f)),
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); setPinned((p) => (p === i ? null : i)); setActive(i); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(i + 1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(i - 1); }
      else if (e.key === "Home") { e.preventDefault(); go(0); }
      else if (e.key === "End") { e.preventDefault(); go(count - 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setPinned((p) => (p === i ? null : i)); }
      else if (e.key === "Escape" && pinned != null) { e.stopPropagation(); setPinned(null); }
    },
  });
  return { shown, props, clear: () => setPinned(null) };
}
