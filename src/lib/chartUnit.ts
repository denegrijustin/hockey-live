import { useCallback, useRef } from "react";

/**
 * Charts drawn in a fixed viewBox shrink their text with the chart. This sets `--u` (user units per screen pixel) on the
 * svg, so CSS can size labels in real pixels: `font-size: calc(0.6875rem * var(--u, 1))`.
 * Returns a callback ref, so it also works for an svg that mounts later.
 */
export function useChartUnit<T extends SVGSVGElement>(viewBoxWidth: number) {
  const stop = useRef<(() => void) | null>(null);
  return useCallback(
    (node: T | null) => {
      stop.current?.();
      stop.current = null;
      if (!node) return;
      const set = () => {
        const w = node.getBoundingClientRect().width;
        if (w) node.style.setProperty("--u", String(viewBoxWidth / w));
      };
      set();
      if (typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(set);
      ro.observe(node);
      stop.current = () => ro.disconnect();
    },
    [viewBoxWidth],
  );
}
