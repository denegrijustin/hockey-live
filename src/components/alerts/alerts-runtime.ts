import { ALERTS_KEY, createAlertStore, diffGames, memoryStorage, relevantEvents } from "../../lib/alerts.mjs";
import type { Prefs } from "../../lib/prefs.ts";
import type { Game } from "../../types";
import { feed, type AlertItem } from "./alertFeed";

/** The alert engine for this tab: diffing, filtering, storing, device notifications. Loaded only once alerts are switched on. */
const storage = (() => { try { void localStorage.length; return localStorage; } catch { return memoryStorage(); } })();
const store = createAlertStore(storage);
const items = () => store.items() as AlertItem[];

export function refresh(fresh: AlertItem[] = []) { feed.set(items(), fresh); }
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => { if (e.key === ALERTS_KEY || e.key === null) refresh(); });
}
refresh();

/** Device notification: only when the person granted permission and alerts are on; collapses repeats through `tag`. Never throws. */
export async function showDevice(item: AlertItem) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const opts = { body: item.body, tag: item.id, icon: "/icon-192.png" };
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) await reg.showNotification(item.title, opts);
    else new Notification(item.title, opts);
  } catch {}
}

/** One poll tick. Returns the snapshot to pass to the next tick (null = no baseline yet). */
export function tick(prev: Map<number, unknown> | null, games: Game[], prefs: Prefs, now = Date.now()) {
  const { events, next } = diffGames(prev, games, now);
  const added = store.claim(relevantEvents(events, prefs)) as AlertItem[];
  if (added.length) {
    refresh(added);
    if (prefs.alerts.enabled) added.forEach((i) => void showDevice(i));
  } else refresh();
  return next;
}
export function markAllRead() { store.markAllRead(); refresh(); }
export function clearAll() { store.clearAll(); refresh(); }
