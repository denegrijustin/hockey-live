// The home team's arena scoreboard on a Home game card. Pure: which artwork a team has, where its own (placeholder) data ribbon and side
// tables sit in that artwork (so the card covers them with the real numbers), and the board's numbers counted from the game feed.
//
// Artwork is 704 x 384. `ribbon` is the score strip (x, y, w, h in artwork pixels); `panels` are the side tables the art draws with made-up
// numbers, covered by real ones. A team with no artwork yet gets a board drawn in its colours (see ArenaBoard).
import arenas from "./arenas.json" with { type: "json" };

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
  const ord = (n) => (n <= 3 ? `P${n}` : n === 4 ? "OT" : `${n - 3}OT`);
  const goals = plays.filter((p) => p.type === "goal" && p.periodType !== "SO").map((p) => ({ side: p.team === H ? "home" : "away", team: p.team, who: p.player ?? "", when: `${ord(p.period)} ${p.time}` })).reverse();
  const s = feed.situation;
  const pp = s?.homePowerPlay ? "home" : s?.awayPowerPlay ? "away" : null;
  return { rows, goals, pp };
}
