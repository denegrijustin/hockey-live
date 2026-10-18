import { useState } from "react";
import { useVisibleInterval } from "../lib/polling";

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(Date.now() - ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** A small data-status pill for the header: live and fresh, a saved copy, or offline. */
export function StatusPill({ live, offline, updatedAt }: { live: boolean; offline: boolean; updatedAt?: string }) {
  const [, tick] = useState(0);
  useVisibleInterval(() => tick((n) => n + 1), 15000);
  const age = updatedAt ? Date.now() - Date.parse(updatedAt) : 0;
  const saved = offline || age > 86400000;
  const state = saved ? "saved" : live ? "live" : "fresh";
  const label = saved ? "saved copy" : live ? "live" : "synced";
  const showAge = !!updatedAt && !(live && !saved && age < 10000 && false);
  return (
    <span className="status-pill" data-state={state} role="status">
      <i aria-hidden="true" />
      <span className="pill-label">{label}</span>
      {showAge && <span className="pill-age"> · {ago(age)}</span>}
    </span>
  );
}
