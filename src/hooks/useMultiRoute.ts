import { useSyncExternalStore } from "react";
import { parseMulti, withMulti } from "../lib/multi-route.mjs";

/** Is this page one pane of a multi view? Set from the address at start-up (main.tsx), since the app later rewrites the address. */
export const embedded = () => typeof document !== "undefined" && document.documentElement.dataset.embed === "1";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const read = () => (typeof location === "undefined" ? "" : location.search);
const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener("popstate", l);
  return () => { listeners.delete(l); window.removeEventListener("popstate", l); };
};
const urlWith = (ids: number[] | null) => `${location.pathname}${withMulti(location.search, ids)}${location.hash}`;

/** Opens the multi view (a history entry: Back closes it). `popstate` is dispatched so the Game Center route that was open re-reads the address and closes. */
export function openMulti(ids: number[]) {
  try {
    history.pushState({ ...history.state, multi: 1 }, "", urlWith(ids));
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  } catch { /* no history */ }
  notify();
}
/** Changes which games the open multi view shows, in place. */
export function changeMulti(ids: number[]) {
  try { history.replaceState(history.state, "", urlWith(ids)); } catch { /* no history */ }
  notify();
}
/** Closes the multi view: Back when this app opened it, else the parameter is removed in place. */
export function closeMulti() {
  try {
    if (history.state?.multi) history.back();
    else { history.replaceState(history.state, "", urlWith(null)); window.dispatchEvent(new PopStateEvent("popstate", { state: history.state })); }
  } catch { /* no history */ }
  notify();
}

/** The games the address puts in the multi view, or null. */
export function useMultiRoute(): number[] | null {
  const search = useSyncExternalStore(subscribe, read, () => "");
  return parseMulti(search);
}
