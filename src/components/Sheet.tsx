import { useEffect, useRef, type ReactNode } from "react";
import { useSheetDrag } from "../hooks/useSheetDrag";

/**
 * A bottom sheet (modal <dialog>): grabber, a centred title, an optional action on the left (Reset), Done on the right.
 * It closes with Done, Escape, a tap outside, or a swipe down on the bar.
 */
export function Sheet({ title, onClose, left, children }: { title: string; onClose: () => void; left?: ReactNode; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useSheetDrag(dialog, onClose);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="sheet-bar" {...drag}>
        <span className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-left">{left}</div>
        <h2>{title}</h2>
        <button className="sheet-done" onClick={onClose}>Done</button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
