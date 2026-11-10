import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { usePrefs } from "../../lib/prefs.ts";
import { Icon } from "../icons";
import { useAddedAlerts, useAlertItems, type AlertItem } from "./alertFeed";
import "./alerts.css";

const AlertToast = lazy(() => import("./AlertToast"));
const NotificationCenter = lazy(() => import("./NotificationCenter").then((m) => ({ default: m.NotificationCenter })));

/** Header bell. Shown once alerts are switched on (Settings > Notifications); the unread count is part of its accessible name. */
export function NotificationBell({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const enabled = usePrefs().alerts.enabled;
  const items = useAlertItems();
  const added = useAddedAlerts();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<AlertItem | null>(null);
  const unread = items.filter((i) => !i.read).length;
  useEffect(() => { if (added.length && !open) setToast(added[0]); }, [added, open]);
  const done = useCallback(() => setToast(null), []);
  if (!enabled) return null;
  return (
    <>
      <button type="button" className="alert-bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-haspopup="dialog" onClick={() => { setToast(null); setOpen(true); }}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="alert-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && <Suspense fallback={null}><NotificationCenter onClose={() => setOpen(false)} onNavigate={onNavigate} /></Suspense>}
      {toast && !open && <Suspense fallback={null}><AlertToast item={toast} onView={() => { setToast(null); setOpen(true); }} onDone={done} /></Suspense>}
    </>
  );
}
