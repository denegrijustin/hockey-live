// Moneyline and puck-line picks: where they come from, how they are graded, and how much to trust them. Pure, so the Worker, the page and the tests share it.
//
// A pick is logged once, before the puck drops, from the model's chance and the market's price, and is never changed afterwards. Its chance is not the model's raw
// number: it starts at what the market implies and moves only as far as picks with the same size of edge have really done (see calibratedChance).
import { analyzeSeason, finished } from "./model.mjs";
import { projectGame } from "./projection.mjs";

export const SCHEMA = 1;
/** The smallest gap (in probability points) between the model's chance and the market's for a game to get a pick. */
export const MIN_EDGE = 0.03;
/** How many picks' worth of "the market is right" a bucket starts with; its own record moves the number only gradually. */
export const PRIOR_PICKS = 100;
/** Edge buckets, in probability points. */
export const BUCKETS = [[0.03, 0.05], [0.05, 0.08], [0.08, 0.12], [0.12, Infinity]];
export const bucketLabel = ([lo, hi]) => (hi === Infinity ? `${Math.round(lo * 100)}+ pts` : `${Math.round(lo * 100)}–${Math.round(hi * 100)} pts`);

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** American price to the chance it implies, vig included. */
export const impliedProb = (price) => (price > 0 ? 100 / (price + 100) : -price / (-price + 100));
/** The market's chance for each side once the vig is taken out. */
export function fairProbs(priceA, priceB) {
  const a = impliedProb(priceA), b = impliedProb(priceB);
  return [a / (a + b), b / (a + b)];
}
/** Units won on a 1-unit stake at this American price. */
export const winUnits = (price) => (price > 0 ? price / 100 : 100 / -price);
export const priceText = (price) => (price > 0 ? `+${Math.round(price)}` : `${Math.round(price)}`);

/** The NHL's partner odds feed to { [gameId]: { ml: {home, away}, pl: {home: {line, price}, away: {line, price}} } }. Anything missing is left out. */
export function parseOdds(json) {
  const out = {};
  for (const g of json?.games ?? []) {
    const side = (t) => {
      const odds = t?.odds ?? [];
      const ml = odds.find((o) => o.description === "MONEY_LINE_2_WAY");
      const pl = odds.find((o) => o.description === "PUCK_LINE");
      const line = pl ? Number(String(pl.qualifier).replace("+", "")) : NaN;
      return { ml: ml && Number.isFinite(Number(ml.value)) ? Number(ml.value) : null, pl: pl && Number.isFinite(line) && Number.isFinite(Number(pl.value)) ? { line, price: Number(pl.value) } : null };
    };
    const home = side(g.homeTeam), away = side(g.awayTeam);
    if (g.gameId == null) continue;
    out[g.gameId] = { ml: home.ml != null && away.ml != null ? { home: home.ml, away: away.ml } : null, pl: home.pl && away.pl ? { home: home.pl, away: away.pl } : null };
  }
  return out;
}

const poisson = (mean) => { const p = [Math.exp(-mean)]; for (let i = 1; i < 30; i++) p.push(p[i - 1] * mean / i); return p; };
/** The chance a side covers a puck line (regulation scoring; an overtime game is decided by one goal), given each team's expected goals. */
export function coverProb(side, line, means) {
  const need = Math.floor(-line) + 1; // the margin the side must reach: -1.5 -> win by 2+, +1.5 -> not lose by 2+
  const hp = poisson(means.home), ap = poisson(means.away);
  let p = 0, mass = 0;
  for (let i = 0; i < hp.length; i++) for (let j = 0; j < ap.length; j++) {
    const w = hp[i] * ap[j];
    mass += w;
    if ((side === "home" ? i - j : j - i) >= need) p += w;
  }
  return p / mass;
}

/** Every pick the market offers on a game, each with the model's chance, the market's fair chance and the gap between them. */
export function candidates(game, projection, odds) {
  if (!projection?.means || !odds) return [];
  const out = [];
  const add = (kind, side, line, price, model, fair) => out.push({ kind, side, line, price, model, fair, edge: model - fair, team: side === "home" ? game.home : game.away });
  if (odds.ml) {
    const [fh, fa] = fairProbs(odds.ml.home, odds.ml.away);
    add("ml", "home", null, odds.ml.home, projection.homeWin, fh);
    add("ml", "away", null, odds.ml.away, 1 - projection.homeWin, fa);
  }
  if (odds.pl) {
    const [fh, fa] = fairProbs(odds.pl.home.price, odds.pl.away.price);
    add("pl", "home", odds.pl.home.line, odds.pl.home.price, coverProb("home", odds.pl.home.line, projection.means), fh);
    add("pl", "away", odds.pl.away.line, odds.pl.away.price, coverProb("away", odds.pl.away.line, projection.means), fa);
  }
  return out;
}

/** The one pick for a game: the candidate with the biggest edge, if it clears MIN_EDGE. Sanity limits keep a broken price from making a "pick". */
export function choosePick(game, projection, odds) {
  const best = candidates(game, projection, odds).filter((c) => c.edge >= MIN_EDGE && c.model > 0.05 && c.model < 0.95 && Math.abs(c.price) <= 1000).sort((a, b) => b.edge - a.edge)[0];
  return best ? { id: `${game.id}-${best.kind}`, gameId: game.id, date: game.date, start: game.start, away: game.away, home: game.home, ...best } : null;
}

/** Win or loss for a finished game (no pushes: puck lines sit on a half goal). Null when the game is not finished. */
export function gradePick(pick, game) {
  if (!game || !finished(game) || game.homeScore == null || game.awayScore == null || game.homeScore === game.awayScore) return null;
  const margin = pick.side === "home" ? game.homeScore - game.awayScore : game.awayScore - game.homeScore;
  const won = pick.kind === "ml" ? margin > 0 : margin > -pick.line;
  return { result: won ? "win" : "loss", units: won ? winUnits(pick.price) : -1, final: `${game.awayScore}–${game.homeScore}`, end: game.end ?? "REG", margin };
}

/** The pick's chance of winning: the market's fair chance, moved by how much picks with this size of edge have beaten (or missed) the market. */
export function calibratedChance(graded, pick) {
  const b = BUCKETS.find(([lo, hi]) => pick.edge >= lo && pick.edge < hi) ?? BUCKETS.at(-1);
  const hist = graded.filter((g) => g.edge >= b[0] && g.edge < b[1]);
  const wins = hist.filter((g) => g.result === "win").length, expected = hist.reduce((s, g) => s + g.fair, 0);
  return { chance: clamp(pick.fair + (wins - expected) / (hist.length + PRIOR_PICKS), 0.02, 0.98), n: hist.length, bucket: bucketLabel(b) };
}

/** A plain label for a chance next to the price's break-even: a 53% pick at a 52.4% break-even is a thin edge, not a lock. */
export function verdict(chance, price) {
  const d = chance - impliedProb(price);
  return d >= 0.05 ? "Strong edge" : d >= 0.015 ? "Clear edge" : d >= 0 ? "Thin edge" : "No edge after the price";
}

const pct = (n) => `${Math.round(n * 100)}%`;
/** Why a graded pick won or missed, in plain English. */
export function explainPick(pick, graded, game, names) {
  const mine = names[pick.side], theirs = names[pick.side === "home" ? "away" : "home"];
  const mineGoals = pick.side === "home" ? game.homeScore : game.awayScore, theirGoals = pick.side === "home" ? game.awayScore : game.homeScore;
  const how = game.end === "OT" ? " in overtime" : game.end === "SO" ? " in a shootout" : "";
  const shots = game.homeShots != null && game.awayShots != null ? [pick.side === "home" ? game.homeShots : game.awayShots, pick.side === "home" ? game.awayShots : game.homeShots] : null;
  const shotNote = shots ? (shots[0] > shots[1] ? ` ${mine} outshot ${theirs} ${shots[0]}–${shots[1]}.` : shots[0] < shots[1] ? ` ${mine} was outshot ${shots[1]}–${shots[0]}.` : "") : "";
  const edge = ` The model had ${pct(pick.model)} against the market's ${pct(pick.fair)}.`;
  if (pick.kind === "ml") {
    return graded.result === "win"
      ? `Won: ${mine} beat ${theirs} ${mineGoals}–${theirGoals}${how} at ${priceText(pick.price)}.${shotNote}${edge}`
      : `Missed: ${mine} lost ${mineGoals}–${theirGoals}${how} to ${theirs}.${shotNote}${shotNote.includes("outshot ") && shots && shots[0] > shots[1] ? " Outshooting a team and still losing happens." : ""}${edge}`;
  }
  const lineText = pick.line > 0 ? `+${pick.line}` : `${pick.line}`;
  if (graded.result === "win") return pick.line < 0 ? `Won: ${mine} ${lineText} won by ${graded.margin} (${mineGoals}–${theirGoals}) and covered at ${priceText(pick.price)}.${shotNote}${edge}` : `Won: ${mine} ${lineText} ${graded.margin > 0 ? `won ${mineGoals}–${theirGoals}` : `lost by only ${-graded.margin} (${mineGoals}–${theirGoals})`}${how} and covered at ${priceText(pick.price)}.${shotNote}${edge}`;
  return pick.line < 0 ? `Missed: ${mine} ${lineText} ${graded.margin > 0 ? `won ${mineGoals}–${theirGoals} but needed two goals to cover` : `lost ${mineGoals}–${theirGoals}`}${how}.${shotNote}${edge}` : `Missed: ${mine} ${lineText} lost by ${-graded.margin} (${mineGoals}–${theirGoals}), one goal too many to cover.${shotNote}${edge}`;
}

/** 95% Wilson interval for a hit rate. */
export function wilson(w, n) {
  if (!n) return [0, 1];
  const z = 1.96, p = w / n, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d, e = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - e, c + e];
}

/** The Monday (Eastern) that starts the week a date falls in. */
export function weekOf(date) {
  const d = new Date(`${date}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Record, units, weekly bars and the running total from the graded picks, plus an honest sentence about what it shows. */
export function summarize(picks) {
  const graded = picks.filter((p) => p.result).sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const wins = graded.filter((p) => p.result === "win").length, losses = graded.length - wins;
  const units = graded.reduce((s, p) => s + p.units, 0);
  const breakEven = graded.length ? graded.reduce((s, p) => s + impliedProb(p.price), 0) / graded.length : 0;
  const [lo, hi] = wilson(wins, graded.length);
  const weeks = new Map();
  for (const p of graded) {
    const w = weekOf(p.date), row = weeks.get(w) ?? { week: w, w: 0, l: 0, units: 0 };
    p.result === "win" ? row.w++ : row.l++;
    row.units += p.units;
    weeks.set(w, row);
  }
  let run = 0;
  const series = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).map((r) => ({ ...r, total: (run += r.units) }));
  const roi = graded.length ? units / graded.length : 0;
  let honest;
  if (graded.length < 30) honest = `Only ${graded.length} graded ${graded.length === 1 ? "pick" : "picks"} so far: far too few to say whether these picks beat the line. Treat every pick as a coin flip with a small, unproven lean.`;
  else if (lo > breakEven) honest = `${wins}–${losses}, ${units >= 0 ? "+" : ""}${units.toFixed(1)} units. The hit rate is above break-even even at the low end of its range, which is encouraging, but a season is a short sample.`;
  else if (units >= 0) honest = `${wins}–${losses}, ${units >= 0 ? "+" : ""}${units.toFixed(1)} units, but within the range luck alone can produce. No proof these picks beat the line.`;
  else honest = `${wins}–${losses}, ${units.toFixed(1)} units: the picks are behind the line so far. Do not read them as an edge.`;
  return { n: graded.length, wins, losses, units, roi, hitRate: graded.length ? wins / graded.length : null, breakEven, lo, hi, series, honest };
}

/** Whether a stored snapshot is one this code can build on; anything else (missing, older shape, wrong season) is rebuilt rather than called current. */
export const isCurrentSnapshot = (s, season) => !!s && s.schema === SCHEMA && s.season === season && Array.isArray(s.picks) && typeof s.startedAt === "string";

/**
 * One refresh: grade any logged pick whose game has finished, then log a pick for every game that has not started and has odds.
 * A pick already logged is left exactly as it was.
 */
export function updatePicks({ season, games, odds, existing, teams, baseline = {}, now = Date.now() }) {
  const snap = isCurrentSnapshot(existing, season) ? { ...existing, picks: existing.picks.map((p) => ({ ...p })) } : { schema: SCHEMA, season, startedAt: new Date(now).toISOString(), picks: [] };
  const byId = new Map(games.map((g) => [g.id, g]));
  let graded = 0, added = 0;
  for (const p of snap.picks) {
    if (p.result) continue;
    const r = gradePick(p, byId.get(p.gameId));
    if (r) { Object.assign(p, r); graded++; }
  }
  const have = new Set(snap.picks.map((p) => p.gameId));
  const open = games.filter((g) => g.type === 2 && g.state === "FUT" && Date.parse(g.start) > now && !have.has(g.id) && odds?.[g.id]);
  if (open.length) {
    const { before } = analyzeSeason(games, teams);
    for (const g of open) {
      const table = before[g.id];
      const projection = table ? projectGame({ ...g, state: "FUT", homeScore: null, awayScore: null }, table, baseline) : null;
      const pick = choosePick(g, projection, odds[g.id]);
      if (pick) { snap.picks.push({ ...pick, model: pick.model, loggedAt: new Date(now).toISOString() }); added++; }
    }
  }
  snap.updatedAt = new Date(now).toISOString();
  return { snapshot: snap, added, graded };
}
