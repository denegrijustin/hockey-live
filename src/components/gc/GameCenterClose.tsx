import type { Ref } from "react";
import { Icon } from "../icons";

/**
 * The Game Center's one close control: an icon-only 44x44 button pinned to the top-right while the dialog scrolls.
 * Render it as the FIRST child of the scrolling <dialog>: the zero-height sticky wrapper keeps it in view without taking layout space
 * (sticky, not fixed, because the dialog is transformed by the sheet animation and the swipe-to-dismiss drag).
 */
export function GameCenterClose({ onClose, buttonRef }: { onClose: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <div className="gc-close-wrap">
      <button ref={buttonRef} type="button" className="gc-close" aria-label="Close game details" onClick={onClose}>
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}
