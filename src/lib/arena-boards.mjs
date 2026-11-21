// The home team's arena scoreboard on a Home game card. Pure: which artwork a team has, where its own (placeholder) data ribbon and side
// tables sit in that artwork (so the card covers them with the real numbers), and the board's numbers counted from the game feed.
//
// Artwork is 704 x 384. `ribbon` is the score strip (x, y, w, h in artwork pixels); `panels` are the side tables the art draws with made-up
// numbers, covered by real ones. A team with no artwork yet gets a board drawn in its colours (see ArenaBoard).
import arenas from "./arenas.json" with { type: "json" };
import { buildRecap } from "./game-recap.mjs";

export const ART = { w: 704, h: 384 };

/** Teams with arena artwork, by division as the art arrives. */
export const BOARDS = {
  // Pacific
  ANA: { ribbon: [108, 308, 494, 50] },
  CGY: { ribbon: [88, 314, 532, 54] },
  EDM: { ribbon: [148, 305, 408, 52] },
  LAK: { ribbon: [80, 296, 548, 58], panels: [[522, 228, 122, 70]] },
  SJS: { ribbon: [144, 306, 424, 56] },
  SEA: { ribbon: [124, 292, 458, 54], panels: [[124, 54, 88, 184], [494, 54, 88, 184]] },
  VAN: { ribbon: [98, 296, 544, 58] },
  VGK: { ribbon: [140, 288, 428, 54] },
  // Central
  CHI: { ribbon: [205, 292, 292, 32], panels: [[115, 243, 88, 78], [500, 243, 85, 78]] },
  COL: { ribbon: [196, 290, 330, 40], panels: [[52, 92, 120, 198], [536, 92, 120, 198]] },
  DAL: { ribbon: [208, 74, 290, 44] },
  MIN: { ribbon: [198, 293, 322, 36], panels: [[114, 104, 78, 186], [514, 104, 78, 186], [54, 258, 66, 40], [584, 258, 62, 40]] },
  NSH: { ribbon: [205, 296, 292, 34] },
  STL: { ribbon: [196, 290, 330, 40], panels: [[52, 92, 120, 198], [536, 92, 120, 198]] },
  UTA: { ribbon: [208, 74, 290, 44] },
  WPG: { ribbon: [198, 293, 320, 38], panels: [[114, 104, 78, 186], [514, 104, 78, 186], [52, 256, 68, 44], [586, 256, 64, 44]] },
  // Atlantic
  BOS: { ribbon: [100, 277, 505, 47] },
  BUF: { ribbon: [131, 276, 445, 54] },
  DET: { ribbon: [88, 276, 524, 66] },
  FLA: { ribbon: [196, 276, 316, 54], panels: [[84, 40, 540, 38]] },
  MTL: { ribbon: [75, 284, 555, 46] },
  OTT: { ribbon: [181, 290, 345, 40], panels: [[118, 60, 473, 42]] },
  TBL: { ribbon: [68, 300, 567, 40], panels: [[70, 86, 112, 210], [523, 86, 112, 210]] },
  TOR: { ribbon: [156, 262, 395, 44] },
  // Metropolitan
  CAR: { ribbon: [84,  286,  540,  36], panels: [[80,  108,  100,  148],  [524,  108,  102,  148]] },
  CBJ: { ribbon: [84,  292,  540,  36], panels: [[84,  108,  116,  184],  [508,  108,  116,  184]] },
  NJD: { ribbon: [70,  302,  562,  36], panels: [[72,  86,  108,  212],  [524,  86,  108,  212]] },
  NYI: { ribbon: [156,  262,  395,  44] },
  NYR: { ribbon: [84,  286,  540,  36], panels: [[78,  108,  104,  148],  [524,  108,  104,  148]] },
  PHI: { ribbon: [84,  292,  540,  36], panels: [[84,  108,  116,  184],  [508,  108,  116,  184]] },
  PIT: { ribbon: [70,  302,  562,  36], panels: [[72,  86,  108,  212],  [524,  86,  108,  212]] },
  WSH: { ribbon: [160,  300,  388,  44] },
};

/** The board for a home team: its artwork and overlay boxes as percentages of the picture, or null (a drawn board). */
export function boardFor(teamId) {
  const b = BOARDS[teamId];
  if (!b) return null;
  const pct = ([x, y, w, h]) => ({ left: (100 * x) / ART.w, top: (100 * y) / ART.h, width: (100 * w) / ART.w, height: (100 * h) / ART.h });
  return { src: `/scoreboards/${teamId}.webp`, ribbon: pct(b.ribbon), panels: (b.panels ?? []).map(pct) };
}

/** The home arena's name, for the marquee of a drawn board. */
export const arenaOf = (teamId) => arenas[teamId]?.arena ?? "";

const count = (plays, type, team) => plays.filter((p) => p.type === type && p.team === team).length;

/**
 * The numbers a scoreboard shows, counted from the game feed (play-by-play): shots on goal, faceoffs won (as a share), hits, blocked shots and
 * penalty minutes for each side, the goals (newest first, with the scorer and when), and which side is on the power play. Null without a feed.
 */
export function boardStats(feed, game) {
  const plays = feed?.plays;
  if (!plays?.length || !game) return null;
  const A = game.away, H = game.home;
  const sog = (t) => plays.filter((p) => (p.type === "shot-on-goal" || p.type === "goal") && p.team === t && p.periodType !== "SO").length;
  const fo = { a: count(plays, "faceoff", A), h: count(plays, "faceoff", H) };
  const pim = (t) => plays.filter((p) => p.type === "penalty" && p.team === t).reduce((s, p) => s + (p.duration ?? 0), 0);
  const foPct = (w, l) => (w + l ? `${Math.round((100 * w) / (w + l))}%` : "—");
  const rows = [
    { label: "SOG", away: sog(A), home: sog(H) },
    { label: "FO%", away: foPct(fo.a, fo.h), home: foPct(fo.h, fo.a) },
    { label: "HITS", away: count(plays, "hit", A), home: count(plays, "hit", H) },
    { label: "BLK", away: count(plays, "blocked-shot", A), home: count(plays, "blocked-shot", H) },
    { label: "PIM", away: pim(A), home: pim(H) },
  ];
  // the deeper lines for the table under the board (the side screens already show SOG, FO%, hits and blocks)
  const miss = (t) => count(plays, "missed-shot", t);
  const blockedBy = (t) => count(plays, "blocked-shot", t);          // a blocked-shot event belongs to the blocking team
  const att = { a: sog(A) + miss(A) + blockedBy(H), h: sog(H) + miss(H) + blockedBy(A) };
  const pct = (x, y) => (x + y ? `${Math.round((100 * x) / (x + y))}%` : "—");
  // power play: goals scored with more skaters than the other side, out of the minor and major penalties the other side took
  const sk = (p) => { const m = /^(\d)(\d)(\d)(\d)$/.exec(p.sit ?? ""); return m ? { a: +m[2], h: +m[3] } : null; };
  const ppGoals = (side) => plays.filter((p) => p.type === "goal" && p.periodType !== "SO" && p.team === (side === "a" ? A : H)).filter((p) => { const k = sk(p); return k && (side === "a" ? k.a > k.h : k.h > k.a); }).length;
  const chances = (t) => plays.filter((p) => p.type === "penalty" && p.team === t && [2, 4, 5].includes(p.duration ?? 0)).length;
  const ga = (t) => plays.filter((p) => p.type === "goal" && p.periodType !== "SO" && p.team !== t && p.goalie).length; // goals against with a goalie in net
  const sv = (t, shots) => (shots ? (Math.max(0, shots - ga(t)) / shots).toFixed(3).replace(/^0/, "") : "—");
  let xg = null;
  try { xg = buildRecap({ game: feed, mp: null })?.xg ?? null; } catch { xg = null; }
  const deep = [
    { label: "SHOT ATT", away: att.a, home: att.h },
    { label: "CORSI %", away: pct(att.a, att.h), home: pct(att.h, att.a) },
    ...(xg ? [{ label: "xGOALS", away: xg.away.toFixed(2), home: xg.home.toFixed(2) }] : []),
    { label: "POWER PLAY", away: `${ppGoals("a")}/${chances(H)}`, home: `${ppGoals("h")}/${chances(A)}` },
    { label: "SAVE %", away: sv(A, sog(H)), home: sv(H, sog(A)) },
    { label: "TAKE / GIVE", away: `${count(plays, "takeaway", A)} / ${count(plays, "giveaway", A)}`, home: `${count(plays, "takeaway", H)} / ${count(plays, "giveaway", H)}` },
  ];
  const ord = (n) => (n <= 3 ? `P${n}` : n === 4 ? "OT" : `${n - 3}OT`);
  const goals = plays.filter((p) => p.type === "goal" && p.periodType !== "SO").map((p) => ({ side: p.team === H ? "home" : "away", team: p.team, who: p.player ?? "", when: `${ord(p.period)} ${p.time}` })).reverse();
  const s = feed.situation;
  const pp = s?.homePowerPlay ? "home" : s?.awayPowerPlay ? "away" : null;
  return { rows, deep, goals, pp };
}
