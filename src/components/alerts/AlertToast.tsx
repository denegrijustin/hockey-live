import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AlertItem } from "./alertFeed";

/** Transient toast for a new alert (separate from the "Updated just now" toast). Loaded only when an alert arrives. */
export default function AlertToast({ item, onView, onDone }: { item: AlertItem; onView: () => void; onDone: () => void }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    setShown(true);
    const t = setTimeout(() => { setShown(false); onDone(); }, 6000);
    return () => clearTimeout(t);
  }, [item, onDone]);
  return createPortal(
    <div className="toast-host alert-toasts" aria-live="polite">
      {shown && <div className="toast alert-toast" role="status"><span>{item.title}</span><button type="button" onClick={onView}>View</button></div>}
    </div>,
    document.body,
  );
}
