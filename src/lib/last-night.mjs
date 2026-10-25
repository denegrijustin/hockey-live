// "Last night in the NHL": the finals of the previous day, the best and worst individual nights and the goalie of the night. Pure, so the page and the tests share it.

const finished = (g) => ["OFF", "FINAL"].includes(g.state) && g.homeScore != null && g.awayScore != null;
const etDay = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** The most recent day before today (Eastern time) on which games were played and finished, or null. */
/** @param {any[]} games @param {number} [now] @returns {string | null} */
export function lastNightDate(games, now = Date.now()) {
  const today = etDay(now);
  const days = [...new Set(games.filter((g) => g.type !== 0 && finished(g) && g.date < today).map((g) => g.date))].sort();
  return days.at(-1) ?? null;
}

/** That day's finished games, away team first as on the scoreboard, in the order they started. */
/** @param {any[]} games @param {string} date @returns {{ id: number, away: string, home: string, awayScore: number, homeScore: number, end: string }[]} */
export function finalsOn(games, date) {
  return games.filter((g) => g.type !== 0 && g.date === date && finished(g)).sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id)
    .map((g) => ({ id: g.id, away: g.away, home: g.home, awayScore: g.awayScore, homeScore: g.homeScore, end: g.end && g.end !== "REG" ? g.end : "" }));
}

const WEIGHT = { goal: 0.75, assist: 0.62, shot: 0.075, block: 0.05, hit: 0.01, takeaway: 0.03, giveaway: -0.03, plusMinus: 0.15, pim: -0.075 };
const minutes = (toi) => { const [m, s] = String(toi ?? "0:0").split(":").map(Number); return (m || 0) + (s || 0) / 60; };
const n = (v) => (Number.isFinite(v) ? v : 0);

/**
 * One skater's night as a score, in the spirit of the Game Score formula but built only from what a box score has: goals and assists, shots, blocks, hits,
 * takeaways and giveaways, penalty minutes, and plus-minus standing in for the goals for and against while he was on the ice. The pieces keep their names so the
 * best-and-worst chart can show what built the number.
 * @returns {{ total: number, parts: { points: number, onIce: number, penalties: number, other: number } }}
 */
export function gameScore(p) {
  const points = n(p.goals) * WEIGHT.goal + n(p.assists) * WEIGHT.assist;
  const onIce = n(p.plusMinus) * WEIGHT.plusMinus;
  const penalties = n(p.pim) * WEIGHT.pim;
  const other = n(p.shots) * WEIGHT.shot + n(p.blocks) * WEIGHT.block + n(p.hits) * WEIGHT.hit + n(p.takeaways) * WEIGHT.takeaway + n(p.giveaways) * WEIGHT.giveaway;
  return { total: points + onIce + penalties + other, parts: { points, onIce, penalties, other } };
}

/** Skaters (goalies are judged separately) with real ice time, scored, best first. `boxes` are the day's box scores. */
/** @param {any[]} boxes @returns {{ id: number, name: string, team: string, headshot?: string, gameId: number, goals: number, assists: number, shots: number, total: number, parts: { points: number, onIce: number, penalties: number, other: number } }[]} */
export function nightsOf(boxes, { minToi = 8 } = {}) {
  const out = [];
  for (const box of boxes) {
    for (const p of box?.players ?? []) {
      if (p.position === "G" || minutes(p.toi) < minToi) continue;
      const { total, parts } = gameScore(p);
      out.push({ id: p.id, name: p.name, team: p.team, headshot: p.headshot, gameId: box.id, goals: n(p.goals), assists: n(p.assists), shots: n(p.shots), total, parts });
    }
  }
  return out.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** @param {ReturnType<typeof nightsOf>} nights @param {number} [count] */
export const bestAndWorst = (nights, count = 5) => {
  const best = nights.slice(0, count);
  // On a short night the same players cannot be both the best and the worst.
  return { best, worst: nights.slice(Math.max(count, nights.length - count)).reverse() };
};

/** The goalie with the most goals saved above expected on the night (needs 15+ shots), from MoneyPuck's per-game part. */
export function goalieOfTheNight(mpGames, gameIds, { minShots = 15 } = {}) {
  let best = null;
  for (const id of gameIds) {
    for (const g of mpGames?.games?.[String(id)]?.goalies ?? []) {
      if (!Number.isFinite(g.xGA) || !Number.isFinite(g.GA) || !(g.SOG >= minShots)) continue;
      const gsax = g.xGA - g.GA;
      if (!best || gsax > best.gsax) best = { id: g.id, name: g.name, team: g.team, saves: g.SOG - g.GA, shots: g.SOG, gsax, gameId: id };
    }
  }
  return best;
}

/** A short line under a name: "1G 2A · 2 SOG". */
export const lineOf = (p) => [p.goals ? `${p.goals}G` : "", p.assists ? `${p.assists}A` : ""].filter(Boolean).join(" ") || "no points";
