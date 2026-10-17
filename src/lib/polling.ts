import { useEffect, useRef, useState } from "react";
type Listener = (data: unknown, error: string) => void;
interface Feed {
  listeners: Map<Listener, number>;
  data: unknown;
  error: string;
  at: number;
  every: number;
  timer: ReturnType<typeof setInterval> | null;
  inFlight: boolean;
  controller: AbortController;
}
const feeds = new Map<string, Feed>();
let watching = false;
/** A poll this soon after another for the same URL reuses it, so cards mounting together share one request. */
const SHARE_MS = 2000;

async function poll(url: string, feed: Feed) {
  if (document.hidden || feed.inFlight) return;
  feed.inFlight = true;
  try {
    const r = await fetch(url, { signal: feed.controller.signal, cache: "no-store" });
    if (!r.ok) throw Error();
    feed.data = await r.json();
    feed.error = "";
    feed.at = Date.now();
  } catch {
    if (feed.controller.signal.aborted) return;
    feed.error = "Update unavailable — showing the last received data.";
  } finally {
    feed.inFlight = false;
  }
  feed.listeners.forEach((_, listener) => listener(feed.data, feed.error));
}

function retime(url: string, feed: Feed) {
  const every = Math.min(...feed.listeners.values());
  if (feed.timer && every === feed.every) return;
  if (feed.timer) clearInterval(feed.timer);
  feed.every = every;
  feed.timer = setInterval(() => void poll(url, feed), every);
}

/**
 * Polls `url` every `interval` ms while the tab is visible. Every subscriber to the same URL shares one timer and one
 * request; the shortest requested interval wins. Returns the unsubscribe function.
 */
export function subscribeFeed(url: string, interval: number, listener: Listener) {
  if (!watching) {
    watching = true;
    document.addEventListener("visibilitychange", () => feeds.forEach((feed, key) => void poll(key, feed)));
  }
  let feed = feeds.get(url);
  if (!feed) {
    feed = { listeners: new Map(), data: null, error: "", at: 0, every: 0, timer: null, inFlight: false, controller: new AbortController() };
    feeds.set(url, feed);
  }
  feed.listeners.set(listener, interval);
  retime(url, feed);
  if (feed.data !== null || feed.error) listener(feed.data, feed.error);
  if (Date.now() - feed.at > SHARE_MS) void poll(url, feed);
  return () => {
    feed.listeners.delete(listener);
    if (feed.listeners.size) return retime(url, feed);
    if (feed.timer) clearInterval(feed.timer);
    feed.controller.abort();
    if (feeds.get(url) === feed) feeds.delete(url);
  };
}

export function useFeed<T>(url: string | null, interval = 30000) {
  const [state, setState] = useState<{ data: T | null; error: string }>({ data: null, error: "" });
  const identity = useRef<string | null>(null);
  useEffect(() => {
    const nextIdentity = url?.split("?")[0] ?? null;
    // Same endpoint with a new query (a score change) keeps the last data on screen; a different endpoint clears it.
    if (identity.current !== nextIdentity) setState({ data: null, error: "" });
    else setState((s) => ({ ...s, error: "" }));
    identity.current = nextIdentity;
    if (!url) return;
    return subscribeFeed(url, interval, (data, error) => setState((s) => ({ data: (data as T | null) ?? s.data, error })));
  }, [url, interval]);
  return state;
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
