import { useSyncExternalStore } from "react";

/** Whether a CSS media query matches, kept up to date. Reads the real value on the first render, so there is no flash. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
