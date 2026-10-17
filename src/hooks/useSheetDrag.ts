import { useRef, type PointerEvent, type RefObject } from "react";

const DISMISS_DISTANCE = 110; // px dragged down
const DISMISS_SPEED = 0.55; // px per ms for a quick flick

/**
 * Swipe-down-to-dismiss for a bottom sheet (a modal <dialog>). Spread the result on the sheet's handle area: dragging it
 * moves the sheet with the finger, and letting go either closes it (far enough or fast enough) or springs it back.
 * Mouse input is ignored: desktop has the Done button and Escape.
 */
export function useSheetDrag(sheet: RefObject<HTMLElement | null>, onClose: () => void) {
  const drag = useRef<{ y: number; at: number; pointer: number } | null>(null);
  const offset = (e: PointerEvent) => Math.max(0, e.clientY - (drag.current?.y ?? e.clientY));
  const settle = (e: PointerEvent) => {
    const el = sheet.current;
    const d = drag.current;
    drag.current = null;
    if (!el || !d) return;
    const dy = Math.max(0, e.clientY - d.y);
    const speed = dy / Math.max(1, e.timeStamp - d.at);
    el.style.transition = "transform 180ms ease-out";
    if (e.type !== "pointercancel" && (dy > DISMISS_DISTANCE || (dy > 60 && speed > DISMISS_SPEED))) {
      el.style.transform = "translateY(100%)";
      window.setTimeout(() => {
        onClose();
        el.style.transform = el.style.transition = "";
      }, 170);
    } else {
      el.style.transform = "";
      window.setTimeout(() => { el.style.transition = ""; }, 200);
    }
  };
  return {
    onPointerDown(e: PointerEvent) {
      // Buttons in the handle area (Done) must keep their own taps, so a drag never starts on one.
      if (e.pointerType === "mouse" || !sheet.current || (e.target as Element).closest("button")) return;
      drag.current = { y: e.clientY, at: e.timeStamp, pointer: e.pointerId };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer is already gone; the drag just ends sooner */
      }
      sheet.current.style.transition = "none";
    },
    onPointerMove(e: PointerEvent) {
      if (!drag.current || !sheet.current) return;
      sheet.current.style.transform = `translateY(${offset(e)}px)`;
    },
    onPointerUp: settle,
    onPointerCancel: settle,
  };
}
