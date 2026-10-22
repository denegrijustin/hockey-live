// "Playing well? Winning?" — every club placed by how it plays (5v5 expected-goal share) against what it has to show for it (points %).
export const PLAY_ROWS = [
  { key: "well", label: "Playing well", note: "5v5 xG share 52.5%+" },
  { key: "even", label: "Even", note: "in between" },
  { key: "out", label: "Getting outplayed", note: "under 47.5%" },
];
export const RESULT_COLS = [
  { key: "winning", label: "Winning", note: "points % .600+" },
  { key: "water", label: "Treading water", note: "in between" },
  { key: "losing", label: "Losing", note: "under .450" },
];
export const CELLS = {
  "well/winning": { title: "The real deal", tone: "good" },
  "well/water": { title: "Due for more", tone: "plain" },
  "well/losing": { title: "Unlucky", tone: "warn" },
  "even/winning": { title: "Finding a way", tone: "plain" },
  "even/water": { title: "Middle of the pack", tone: "plain" },
  "even/losing": { title: "Coin flips going wrong", tone: "plain" },
  "out/winning": { title: "Living dangerously", tone: "warn" },
  "out/water": { title: "Hanging on", tone: "plain" },
  "out/losing": { title: "Trouble", tone: "bad" },
};
export const PLAY_HIGH = 52.5, PLAY_LOW = 47.5, WIN_HIGH = 0.6, WIN_LOW = 0.45;

export const playBand = (xgPct) => (xgPct >= PLAY_HIGH ? "well" : xgPct < PLAY_LOW ? "out" : "even");
export const resultBand = (ptsPct) => (ptsPct >= WIN_HIGH ? "winning" : ptsPct < WIN_LOW ? "losing" : "water");

/**
 * @param {{team: string, xGPct: number | null}[]} xgRows  xGPct is a percent (0-100), from the 5-on-5 team table
 * @param {Record<string, {gp: number, pts: number}>} standings
 * @returns {Record<string, {team, xgPct, ptsPct, gp}[]>} keyed "play/result", each sorted by xG share
 */
export function playMatrix(xgRows, standings) {
  const out = Object.fromEntries(Object.keys(CELLS).map((k) => [k, []]));
  for (const r of xgRows) {
    const s = standings?.[r.team];
    if (r.xGPct == null || !s || !s.gp) continue;
    const ptsPct = s.pts / (2 * s.gp);
    out[`${playBand(r.xGPct)}/${resultBand(ptsPct)}`].push({ team: r.team, xgPct: r.xGPct, ptsPct, gp: s.gp });
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.xgPct - a.xgPct);
  return out;
}
