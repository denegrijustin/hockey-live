// Shapes of the published MoneyPuck snapshot parts (see moneypuck.mjs for how they are built). Source values keep the
// units MoneyPuck publishes: toi is seconds, counts are as published, src.* percentages are 0..1 rounded to two places.
export type Sit = "all" | "5on5" | "5on4" | "4on5" | "other";

export type MpMeta = {
  schema: 1;
  source: "MoneyPuck.com";
  sourceUrl: string;
  season: number;            // MoneyPuck's season (the start year), e.g. 2026
  seasonId: number;          // NHL season id, e.g. 20262027
  gameType: "regular";
  fetchedAt: string;         // when we downloaded it (ISO)
  sourceUpdated: { summary: string | null; shots: string | null }; // MoneyPuck's own update stamps (ISO, UTC)
  files: Record<string, string>;
};

export type TeamSit = {
  gp: number | null; toi: number | null;
  xGF: number | null; xGA: number | null; GF: number | null; GA: number | null;
  SOGF: number | null; SOGA: number | null; CF: number | null; CA: number | null;
  hdxGF: number | null; hdxGA: number | null; hdGF: number | null; hdGA: number | null; hdSF: number | null; hdSA: number | null;
  penF: number | null; penA: number | null; pimF: number | null; pimA: number | null;
  src: { xGoalsPercentage: number | null; corsiPercentage: number | null; fenwickPercentage: number | null };
};
export type DangerBlock = { SOG: number | null; xGA: number | null; GA: number | null };
export type GoalieSit = {
  gp: number | null; toi: number | null; xGA: number | null; GA: number | null; SOG: number | null;
  xRebounds: number | null; rebounds: number | null; ld: DangerBlock; md: DangerBlock; hd: DangerBlock;
};
export type Goalie = { id: number; name: string; team: string; sit: Partial<Record<Sit, GoalieSit>> };
export type SummaryPart = MpMeta & { teams: Record<string, Record<Sit, TeamSit>>; goalies: Goalie[] };

export type SkaterSit = {
  gp: number | null; toi: number | null; shifts: number | null; gameScore: number | null;
  ind: { G: number | null; A1: number | null; A2: number | null; P: number | null; SOG: number | null; SA: number | null; xG: number | null; hits: number | null; take: number | null; give: number | null; pen: number | null; pim: number | null; penDrawn: number | null };
  on: { xGF: number | null; xGA: number | null; GF: number | null; GA: number | null; CF: number | null; CA: number | null; src: { xGoalsPercentage: number | null; corsiPercentage: number | null } };
  off: { src: { xGoalsPercentage: number | null; corsiPercentage: number | null } };
};
export type Skater = { id: number; name: string; team: string; pos: string; sit: Partial<Record<Sit, SkaterSit>> };
export type SkatersPart = MpMeta & { skaters: Skater[] };

export type Line = {
  id: string; name: string; team: string; type: "line" | "pairing"; players: number[]; sit: "5on5";
  gp: number | null; toi: number | null; xGF: number | null; xGA: number | null; GF: number | null; GA: number | null;
  CF: number | null; CA: number | null; SOGF: number | null; SOGA: number | null;
  src: { xGoalsPercentage: number | null; corsiPercentage: number | null };
};
export type LinesPart = MpMeta & { lines: Line[] };

export type GameTeamSit = { xGF: number; xGA: number; GF: number; GA: number; SOGF: number; SOGA: number };
export type GameLog = {
  id: number; home: string; away: string; periods: number; overtime: boolean;
  goals: { home: number; away: number }; shots: number;
  teams: Record<string, Record<Sit, GameTeamSit>>;
  goalies: { id: number; name: string; team: string; xGA: number; GA: number; SOG: number }[];
};
export type GamesPart = MpMeta & { games: Record<string, GameLog>; through: number | null; derived: string };

export type Shot = {
  t: number;       // game seconds elapsed (P1 0..1200, P2 1200..2400, P3 2400..3600, OT after)
  p: number;       // period (4 = first overtime)
  team: string;    // the shooting team
  xg: number;      // MoneyPuck expected-goal value of the shot
  g: 0 | 1; sog: 0 | 1;
  sit: Exclude<Sit, "all">;  // shooting team's strength when the shot was taken
  type: string | null;       // shot type, e.g. WRIST
  x: number | null; y: number | null; // arena-adjusted coordinates (feet); shooting team attacks toward +x
  by: { id: number; name: string } | null; gk: { id: number; name: string } | null; en: 0 | 1;
};
export type ShotsPart = MpMeta & { gameId: number; home: string; away: string; shots: Shot[] };

export type HistoryDay = { schema: 1; date: string; sourceUpdated: MpMeta["sourceUpdated"]; fetchedAt: string; teams: Record<string, Partial<Record<Sit, { gp: number | null; toi: number | null; xGF: number | null; xGA: number | null; GF: number | null; GA: number | null }>>> };

export type MpStatus = {
  ok: boolean; season: number; seasonId: number;
  sourceUpdated: MpMeta["sourceUpdated"]; fetchedAt: string; lastCheckedAt: string | null; lastError: string | null; lastFailedAt?: string;
  counts: Record<string, number>; shotGames: number[]; historyDates: string[];
  refresh?: "updated" | "unchanged" | "running" | "recent" | "failed";
};
