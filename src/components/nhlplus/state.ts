import type { NhlPlusView } from "../../lib/nhlplus-nav";
import type { Sit } from "../../lib/moneypuck-types";

export type Sort = { key: string; dir: "asc" | "desc" };
export type NpState = {
  view: NhlPlusView;
  sit: Sit;
  highlight: string[];
  // Teams
  teamMetric: string; teamSort: Sort; teamMin: number | null;
  // Matchups
  mA: string | null; mB: string | null; mGame: number | null; mWindow: 5 | 10;
  // Goalies
  gSort: Sort; gMin: number | null; gMinGp: number; gCmp: number[];
  // Players
  pTab: "skaters" | "lines"; pPos: "all" | "F" | "D"; pTeam: string; pQuery: string; pSort: Sort; pMin: number | null;
  lType: "line" | "pairing"; lTeam: string; lMin: number | null; lSort: Sort;
  // Trends
  tTeam: string;
  // Data
  dSource: "teams" | "goalies" | "skaters" | "lines"; dQuery: string; dSort: Sort;
};
export const INITIAL: NpState = {
  view: "teams", sit: "5on5", highlight: [],
  teamMetric: "xGPct", teamSort: { key: "xGPct", dir: "desc" }, teamMin: null,
  mA: null, mB: null, mGame: null, mWindow: 5,
  gSort: { key: "toi", dir: "desc" }, gMin: null, gMinGp: 0, gCmp: [],
  pTab: "skaters", pPos: "all", pTeam: "all", pQuery: "", pSort: { key: "P", dir: "desc" }, pMin: null,
  lType: "line", lTeam: "all", lMin: null, lSort: { key: "toi", dir: "desc" },
  tTeam: "EDM",
  dSource: "teams", dQuery: "", dSort: { key: "team", dir: "asc" },
};
export type SetState = (patch: Partial<NpState>) => void;

/** Minimum time on ice, in minutes, that applies when the viewer has not chosen one. Chosen so most of the league still shows. */
export const DEFAULT_MIN: Record<"team" | "goalie" | "skater" | "line", Record<string, number>> = {
  team: { all: 0, "5on5": 0, "5on4": 0, "4on5": 0, other: 0 },
  goalie: { all: 20, "5on5": 15, "5on4": 2, "4on5": 2, other: 0 },
  skater: { all: 60, "5on5": 40, "5on4": 5, "4on5": 5, other: 0 },
  line: { all: 20, "5on5": 20, "5on4": 20, "4on5": 20, other: 20 },
};
export const MIN_CHOICES = [0, 2, 5, 10, 20, 40, 60, 100, 200];
export const effectiveMin = (kind: keyof typeof DEFAULT_MIN, sit: string, chosen: number | null) => chosen ?? DEFAULT_MIN[kind][sit] ?? 0;
