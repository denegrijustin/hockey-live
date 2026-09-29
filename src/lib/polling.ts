import { useEffect, useState } from "react";
export function useFeed<T>(url: string | null, interval = 30000) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setData(null);
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
