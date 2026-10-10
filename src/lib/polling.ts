import { useEffect, useRef, useState } from "react";
export function useFeed<T>(url: string | null, interval = 30000) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const identity = useRef<string | null>(null);
  useEffect(() => {
    const nextIdentity = url?.split("?")[0] ?? null;
    if (identity.current !== nextIdentity) setData(null);
    identity.current = nextIdentity;
    setError("");
    if (!url) return;
    let active = true,
      inFlight = false;
    const controller = new AbortController();
    const update = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const r = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!r.ok) throw Error();
        const j = await r.json();
        if (active) {
          setData(j);
          setError("");
        }
      } catch {
        if (active)
          setError("Update unavailable — showing the last received data.");
      } finally {
        inFlight = false;
      }
    };
    void update();
    const timer = setInterval(update, interval);
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [url, interval]);
  return { data, error };
}

/**
 * Runs `fn` every `ms` while the tab is visible. A hidden tab skips its ticks; when the tab is shown again,
 * `fn` runs at once if a tick was missed. `enabled` false stops the timer.
 */
export function useVisibleInterval(fn: () => void, ms: number, enabled = true) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let missed = false;
    const timer = setInterval(() => {
      if (document.hidden) missed = true;
      else latest.current();
    }, ms);
    const show = () => {
      if (!document.hidden && missed) {
        missed = false;
        latest.current();
      }
    };
    document.addEventListener("visibilitychange", show);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", show);
    };
  }, [ms, enabled]);
}
