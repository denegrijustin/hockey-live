import { useSyncExternalStore } from "react";

/** Whether the browser reports a network connection, updated at once by the online/offline events. A hint, not proof: "online" can still mean no route. */
export function useOnline() {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
    },
    () => navigator.onLine !== false,
    () => true,
  );
}
