import { useEffect, useLayoutEffect, type RefObject } from "react";

/**
 * Keeps an underline under the active tab inside `ref`: it measures the tab marked aria-pressed or aria-current and sets --ux (left) and --uw (width)
 * on the container, so a CSS transform can slide the indicator from one tab to the next. Re-measures when `key` changes and when the box resizes.
 */
export function useSlidingUnderline(ref: RefObject<HTMLElement | null>, key: string) {
  const measure = () => {
    const box = ref.current;
    const active = box?.querySelector<HTMLElement>('[aria-pressed="true"],[aria-current="page"]');
    if (!box || !active) return;
    const b = box.getBoundingClientRect(), r = active.getBoundingClientRect();
    box.style.setProperty("--ux", `${r.left - b.left + box.scrollLeft}px`);
    box.style.setProperty("--uw", String(r.width));
    box.dataset.slide = "";
  };
  useLayoutEffect(measure, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
