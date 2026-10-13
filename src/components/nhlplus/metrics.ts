import { fmt, fmtPct, fmtSigned } from "./shared/format";

export type TeamMetricDef = { key: string; label: string; short: string; tip: string; higherIsBetter: boolean; unit: string; fmt: (v: number | null) => string; asPct?: boolean };
/** The team measures offered in the ranked bars and the table. All are derived from the published totals. */
export const TEAM_METRICS: TeamMetricDef[] = [
  { key: "xGPct", label: "xG share", short: "xG%", tip: "xGPct", higherIsBetter: true, unit: "%", fmt: (v) => fmtPct(v) },
  { key: "xGF60", label: "xG for per 60", short: "xGF/60", tip: "xGF60", higherIsBetter: true, unit: "xG/60", fmt: (v) => fmt(v) },
  { key: "xGA60", label: "xG against per 60", short: "xGA/60", tip: "xGA60", higherIsBetter: false, unit: "xG/60", fmt: (v) => fmt(v) },
  { key: "xGDiff60", label: "xG difference per 60", short: "xG diff/60", tip: "xGF60", higherIsBetter: true, unit: "xG/60", fmt: (v) => fmtSigned(v) },
  { key: "GF60", label: "Goals for per 60", short: "GF/60", tip: "GF", higherIsBetter: true, unit: "goals/60", fmt: (v) => fmt(v) },
  { key: "GA60", label: "Goals against per 60", short: "GA/60", tip: "GA", higherIsBetter: false, unit: "goals/60", fmt: (v) => fmt(v) },
  { key: "shPct", label: "Shooting %", short: "Sh%", tip: "shPct", higherIsBetter: true, unit: "%", fmt: (v) => fmtPct(v) },
  { key: "svPct", label: "Save %", short: "Sv%", tip: "svPct", higherIsBetter: true, unit: "%", fmt: (v) => fmtPct(v) },
  { key: "CFPct", label: "Shot-attempt share", short: "CF%", tip: "CFPct", higherIsBetter: true, unit: "%", fmt: (v) => fmtPct(v) },
];
export const metricDef = (key: string) => TEAM_METRICS.find((m) => m.key === key) ?? TEAM_METRICS[0];
