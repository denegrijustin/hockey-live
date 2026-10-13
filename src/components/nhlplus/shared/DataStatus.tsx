import type { LoadState } from "../../../lib/moneypuck-client";
import { Attribution } from "./Attribution";

const stamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : null;

/**
 * One compact line for the state of a MoneyPuck snapshot: loading, ready (with its timestamp), stale, saved copy, or
 * unavailable. `what` says what kind of data it is ("Season profile", "Completed game"); nightly files are never "live".
 */
export function DataStatus({ state, updated, stale, savedCopy, what = "Season data", onRetry, compact = false }: {
  state: LoadState; updated: string | null; stale?: boolean; savedCopy?: boolean; what?: string; onRetry?: () => void; compact?: boolean;
}) {
  const when = stamp(updated);
  let text: string, tone = "ok";
  if (state === "loading") { text = `Loading ${what.toLowerCase()}…`; tone = "wait"; }
  else if (state === "unavailable") { text = `${what} unavailable`; tone = "bad"; }
  else if (state === "idle") return null;
  else if (stale) { text = `${what} · stale · last updated ${when ?? "unknown"}`; tone = "warn"; }
  else if (savedCopy) { text = `${what} · saved copy · updated ${when ?? "unknown"}`; tone = "warn"; }
  else { text = `${what} · updated ${when ?? "unknown"}`; }
  return (
    <p className={`mp-status mp-${tone}${compact ? " mp-compact" : ""}`} role={tone === "bad" ? "alert" : "status"}>
      <span>{text}</span>
      {tone === "bad" && onRetry && <button type="button" className="mp-link" onClick={(e) => { e.stopPropagation(); onRetry(); }}>Retry</button>}
      <Attribution />
    </p>
  );
}
