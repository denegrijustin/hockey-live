// Number formatting shared by the NHL+ views and cards. Missing values show as an en dash, never as zero.
export const DASH = "–";
export const fmt = (v: number | null | undefined, digits = 2) => (v == null || !Number.isFinite(v) ? DASH : v.toFixed(digits));
export const fmtInt = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? DASH : String(Math.round(v)));
export const fmtPct = (v: number | null | undefined, digits = 1) => (v == null || !Number.isFinite(v) ? DASH : `${(v * 100).toFixed(digits)}%`);
/** Save percentage the hockey way: .915 */
export const fmtSv = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? DASH : v.toFixed(3).replace(/^0/, ""));
export const fmtSigned = (v: number | null | undefined, digits = 2) => (v == null || !Number.isFinite(v) ? DASH : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`);
export const fmtMin = (seconds: number | null | undefined) => (seconds == null || !Number.isFinite(seconds) ? DASH : `${(seconds / 60).toFixed(seconds >= 6000 ? 0 : 1)}`);
export const fmtClockMin = (seconds: number | null | undefined) => {
  if (seconds == null || !Number.isFinite(seconds)) return DASH;
  const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
