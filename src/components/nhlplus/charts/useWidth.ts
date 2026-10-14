import { useEffect, useRef, useState } from "react";

/** Width of an element in CSS pixels, kept current as the layout changes (so charts draw at real size, even at 320px). */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    read();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", read); return () => window.removeEventListener("resize", read); }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Index cursor shared by the chart types: hover/touch picks an index, arrow keys move it, focus shows it. */
export function useCursor(count: number, initialOnFocus: "last" | "first" = "last") {
  const [active, setActive] = useState<number | null>(null);
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  const keys = {
    tabIndex: 0,
    onFocus: () => setActive((a) => (a == null ? (initialOnFocus === "last" ? count - 1 : 0) : clamp(a))),
    onBlur: () => setActive(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!count) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setActive((a) => clamp((a ?? -1) + 1)); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setActive((a) => clamp((a ?? count) - 1)); }
      else if (e.key === "Home") { e.preventDefault(); setActive(0); }
      else if (e.key === "End") { e.preventDefault(); setActive(count - 1); }
      else if (e.key === "Escape") setActive(null);
    },
  };
  return { active: active != null && active < count ? active : null, setActive, keys };
}
