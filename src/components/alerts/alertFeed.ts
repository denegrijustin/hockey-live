import { useSyncExternalStore } from "react";

/** One notification-center entry (shape written by src/lib/alerts.mjs). */
export type AlertItem = {
  id: string; kind: string; gameId: number | null; teams: string[]; title: string; body: string; at: number; read: boolean;
  why: "team" | "saved" | "player"; players: { id: number; name: string }[];
};

/**
 * Tiny in-memory view of the stored alert list, so the header bell (main chunk) can show the unread count without loading the
 * alert engine. The engine (alerts-runtime, a lazy chunk) is the only writer.
 */
let items: AlertItem[] = [];
let added: AlertItem[] = [];
const listeners = new Set<() => void>();
export const feed = {
  set(next: AlertItem[], fresh: AlertItem[] = []) { items = next; added = fresh; listeners.forEach((l) => l()); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  items: () => items,
  added: () => added,
};
export const useAlertItems = () => useSyncExternalStore(feed.subscribe, feed.items, feed.items);
export const useAddedAlerts = () => useSyncExternalStore(feed.subscribe, feed.added, feed.added);

export const loadRuntime = () => import("./alerts-runtime");
export const markAllRead = () => void loadRuntime().then((r) => r.markAllRead());
export const clearAlerts = () => void loadRuntime().then((r) => r.clearAll());
