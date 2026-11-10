/**
 * Pure search over what the app has already loaded: teams, today's games, players that were fetched, and the app's views.
 * Nothing here fetches or invents: an item exists only if the caller passed it in.
 */
import { isLive } from "./game-data.mjs";

/** Result groups, in display order. */
export const KINDS = [
  { kind: "team", label: "Teams" },
  { kind: "game", label: "Games" },
  { kind: "player", label: "Players" },
  { kind: "view", label: "Pages" },
];

/** Lower-case, strip diacritics, collapse whitespace and punctuation to single spaces. */
export function normalize(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Match quality of one query token against one key (lower is better).
// 0 exact abbreviation, 1 exact other key, 2 prefix, 3 word prefix, 4 substring, Infinity no match.
function tokenScore(token, key) {
  const t = key.text;
  if (t === token) return key.abbr ? 0 : 1;
  if (t.startsWith(token)) return 2;
  if (t.includes(" " + token)) return 3;
  if (t.includes(token)) return 4;
  return Infinity;
}

const key = (text, abbr = false) => ({ text: normalize(text), abbr });

/**
 * Build the index. `today` (YYYY-MM-DD, Eastern) selects which games are searchable: games on that day, plus anything live.
 * players: [{id, name, team?, headshot?, number?}] only from data already fetched. views: [{id,label,hint?,short?}].
 */
export function buildIndex({ teams = [], games = [], players = [], views = [], today = null } = {}) {
  const items = [];
  const byId = new Map(teams.map((t) => [t.id, t]));
  for (const t of teams) {
    items.push({
      kind: "team", id: t.id, title: t.name, subtitle: `${t.id} · ${t.division ?? ""}`.replace(/ · $/, ""),
      keys: [key(t.id, true), key(t.name), key(t.city), key(t.short), key(`${t.city} ${t.short}`)],
      payload: { id: t.id },
    });
  }
  for (const g of games) {
    const live = isLive(g);
    if (!live && !(today && g.date === today)) continue;
    const a = byId.get(g.away), h = byId.get(g.home);
    const status = live ? "Live" : g.state === "FINAL" || g.state === "OFF" ? "Final" : "Today";
    const score = g.awayScore != null && g.homeScore != null ? ` · ${g.awayScore}–${g.homeScore}` : "";
    items.push({
      kind: "game", id: g.id, title: `${g.away} vs ${g.home}`, subtitle: `${status}${score}`,
      keys: [
        key(`${g.away} vs ${g.home}`), key(`${g.home} vs ${g.away}`),
        key(`${a?.name ?? g.away} vs ${h?.name ?? g.home}`), key(`${h?.name ?? g.home} vs ${a?.name ?? g.away}`),
        key(live ? "live" : "today"), key(g.away), key(g.home),
      ],
      payload: { id: g.id },
    });
  }
  for (const p of players) {
    if (p?.id == null || !p.name) continue;
    items.push({
      kind: "player", id: String(p.id), title: p.name, subtitle: [p.team, p.number != null ? `#${p.number}` : ""].filter(Boolean).join(" · "),
      keys: [key(p.name), key(p.team ?? "", true)].filter((k) => k.text),
      payload: { id: p.id, name: p.name, team: p.team, headshot: p.headshot ?? null, number: p.number ?? null },
    });
  }
  for (const v of views) {
    items.push({
      kind: "view", id: v.id, title: v.label, subtitle: v.hint ?? "",
      keys: [key(v.label), key(v.short ?? ""), key(v.id)].filter((k) => k.text),
      payload: { id: v.id },
    });
  }
  items.forEach((it, i) => { it.order = i; });
  return { items };
}

/**
 * Search. Every query token must match some key of the item; an item's score is its worst token's best-key score.
 * Results are grouped by kind (KINDS order), sorted by score then original order, and capped at `limit` per group.
 * An empty query lists live and today's games and the pages, never teams or players.
 * Returns { groups: [{kind,label,items}], flat } where flat is the keyboard order.
 */
export function search(index, query, { limit = 6 } = {}) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  const scored = [];
  for (const it of index.items) {
    if (!tokens.length) { if (it.kind === "game" || it.kind === "view") scored.push({ it, score: 0 }); continue; }
    let worst = 0;
    for (const tok of tokens) {
      let best = Infinity;
      for (const k of it.keys) best = Math.min(best, tokenScore(tok, k));
      worst = Math.max(worst, best);
      if (worst === Infinity) break;
    }
    if (worst !== Infinity) scored.push({ it, score: worst });
  }
  const groups = [];
  for (const { kind, label } of KINDS) {
    const items = scored
      .filter((s) => s.it.kind === kind)
      .sort((a, b) => a.score - b.score || a.it.order - b.it.order)
      .slice(0, limit)
      .map((s) => s.it);
    if (items.length) groups.push({ kind, label, items });
  }
  return { groups, flat: groups.flatMap((g) => g.items) };
}
