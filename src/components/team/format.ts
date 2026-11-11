/** Small display helpers for the team page. A missing number is "—", never 0. */
export const DASH = "—";
export const streakText = (s: { type: string; count: number } | null | undefined) => (s ? `${s.type}${s.count}` : DASH);
export const pct3 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? DASH : v.toFixed(3).replace(/^0/, ""));
export const pctWhole = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? DASH : `${(v * 100).toFixed(1)}%`);
export const fixed = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? DASH : v.toFixed(d));
export const signed = (v: number | null | undefined) => (v == null ? DASH : v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");
export const recText = (r: { w: number; l: number; otl: number }) => `${r.w}–${r.l}–${r.otl}`;
export const ord = (n: number) => { const m = n % 100; return m >= 11 && m <= 13 ? `${n}th` : `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`; };
export const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const dayText = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
export const asOfText = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null);
