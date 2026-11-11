// Personal relevance of a game: how much it matters to THIS viewer (favorite teams, followed players' teams, saved games) on top of how
// watchable it is for everyone. Pure and deterministic; every reason is emitted only when its fact is true, and the wording reuses
// insights.mjs / watchability.mjs so a card never says two different things about one game.
import { isCalledOff, isLive, isUpcoming, byStartThenId } from "./game-data.mjs";
import { matchupInsights, T } from "./insights.mjs";
import { closeAndLate, pregameHomeWin, tierOf, watchability } from "./watchability.mjs";

/** Points per component, in one place so tests and the contract agree. */
export const W = { favorite: 35, secondFavorite: 10, watch: 0.3, division: 10, line: 10, insight: 10, live: 10, soon: 5, saved: 20, followed: 10 };
const DAY = 86400000;

/**
 * @typedef {object} RelevanceCtx
 * @property {string[]=} favorites favorite team ids
 * @property {string[]=} followedTeams teams of followed players (an availability fact: "plays", never an injury claim)
 * @property {Array<number|string>=} saved saved game ids
 * @property {any[]=} teams Team[] (division is needed for the division and playoff-line facts)
 * @property {any=} analysis analyzeSeason() result: before[gameId], analysis[gameId].score
 * @property {any[]=} allGames
 * @property {any=} sim playoff chances by team id
 * @property {((g:any)=>any)=} baselineFor previous-season table for the pregame model, per game
 * @property {number=} now epoch ms (default Date.now())
 */

const list = (a) => (Array.isArray(a) ? a : []);
const joinIds = (ids) => ids.join(", ");

/** True when there is any personal context at all (favorites, followed players' teams or saved games). */
export const hasContext = (ctx) => list(ctx?.favorites).length + list(ctx?.followedTeams).length + list(ctx?.saved).length > 0;

/**
 * @param {any} game
 * @param {RelevanceCtx} ctx
 * @returns {{score:number, reasons:Array<{key:string,points:number,text:string}>, explanation:string}}
 */
export function relevance(game, ctx = {}) {
  const none = { score: 0, reasons: [], explanation: "" };
  // Called-off, finished and unknown games are labelled by their cards, never ranked up.
  if (!game || isCalledOff(game) || !(isLive(game) || isUpcoming(game))) return none;
  const now = Number.isFinite(ctx.now) ? ctx.now : Date.now();
  const favorites = list(ctx.favorites), followed = list(ctx.followedTeams), saved = list(ctx.saved).map(Number);
  const teams = list(ctx.teams);
  const reasons = [];
  const add = (key, points, text) => { if (points > 0) reasons.push({ key, points: Math.round(points), text }); };
  const playing = [game.away, game.home];

  // Favorite teams
  const favs = playing.filter((id) => favorites.includes(id));
  if (favs.length) add("favorite", W.favorite + (favs.length > 1 ? W.secondFavorite : 0), `${favs.length > 1 ? "Your teams" : "Your team"}: ${joinIds(favs)}`);

  // Saved game
  if (saved.includes(Number(game.id))) add("saved", W.saved, "Saved by you");

  // Followed players' teams (only when the team plays; not a claim about who is in the lineup)
  const fol = playing.filter((id) => followed.includes(id));
  if (fol.length) add("followed", W.followed, `Followed player's team: ${joinIds(fol)}`);

  // Same division as a favorite, when no favorite is playing
  if (favorites.length && !favs.length && teams.length) {
    const div = (id) => teams.find((t) => t.id === id)?.division;
    const dv = div(game.home);
    const mine = favorites.filter((f) => div(f) === dv);
    if (dv && div(game.away) === dv && mine.length) add("division", W.division, `${dv} Division game, like ${joinIds(mine)}`);
  }

  // Watchability (the same model as the ring) and the facts behind it
  const before = ctx.analysis?.before?.[game.id];
  const importance = ctx.analysis?.analysis?.[game.id]?.score;
  let pre = null;
  if (before) { try { pre = pregameHomeWin(game, before, ctx.baselineFor?.(game)); } catch { pre = null; } }
  if (Number.isFinite(importance)) {
    const score = watchability(importance, pre);
    const tier = tierOf(score);
    // Always counts toward the rank; it is only SAID when the game is at least "Worth a look".
    reasons.push({ key: "watch", points: Math.round(W.watch * score), text: score >= 50 ? `${tier.label} (${score}/100)` : "" });
  }

  // Standings, form, schedule and live facts, from insights.mjs
  const insights = before ? matchupInsights(game, before, before, { teams, allGames: ctx.allGames ?? [], sim: ctx.sim ?? null, pregameHome: pre }) : [];
  const line = insights.find((i) => i.id.startsWith("line-"));
  if (line) add("line", W.line, line.text);
  const cl = closeAndLate(game);
  const liveFact = cl.both ? { pts: W.live, text: cl.label } : insights.filter((i) => i.kind === "live").map((i) => ({ pts: i.id === "live-upset" ? 8 : 6, text: i.text }))[0];
  if (liveFact && isLive(game)) add("live", liveFact.pts, liveFact.text);
  const top = insights.find((i) => i.kind !== "live" && !i.id.startsWith("line-"));
  if (top) add("insight", (top.priority / 100) * W.insight, top.text);

  // Puck drop within 24 hours
  const t = Date.parse(game.start);
  if (isUpcoming(game) && Number.isFinite(t) && t >= now - 300000 && t - now <= DAY) add("soon", W.soon, "Puck drop within 24 hours");

  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  const said = reasons.filter((r) => r.text).sort((a, b) => b.points - a.points || a.key.localeCompare(b.key));
  return { score, reasons: reasons.filter((r) => r.text), explanation: said.slice(0, 3).map((r) => r.text).join(" · ") };
}

/**
 * The live and upcoming games that matter most to this viewer, best first (ties: puck drop, then id).
 * `horizonDays` limits upcoming candidates to the coming days (saved games are always kept); `limit` caps the list.
 * @returns {Array<{game:any, score:number, reasons:Array<{key:string,points:number,text:string}>, explanation:string}>}
 */
export function rankGames(games, ctx = {}, { horizonDays = Infinity, limit = Infinity } = {}) {
  const now = Number.isFinite(ctx.now) ? ctx.now : Date.now();
  const saved = list(ctx.saved).map(Number);
  const out = [];
  for (const g of list(games)) {
    if (!(isLive(g) || isUpcoming(g))) continue;
    if (g.type === 0) continue;
    if (!isLive(g) && !saved.includes(Number(g.id)) && Date.parse(g.start) - now > horizonDays * DAY) continue;
    out.push({ game: g, ...relevance(g, ctx) });
  }
  out.sort((a, b) => b.score - a.score || byStartThenId(a.game, b.game));
  return out.slice(0, limit);
}

export { T as RELEVANCE_THRESHOLDS };
