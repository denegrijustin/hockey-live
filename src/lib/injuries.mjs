// The injury report: who is hurt, what the injury is, how serious it looks, when the player may be back, and how much the team misses him.
// Injuries come from ESPN's NHL injury feed; impact comes from the player's box-score production in earlier games (this season once there are a few,
// otherwise last season). Pure, so the Worker, the page and the tests share it.
import { skaterImpact } from "./model.mjs";

export const normName = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii)\b/g, " ").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const ALIAS = { TB: "TBL", NJ: "NJD", SJ: "SJS", LA: "LAK", WAS: "WSH", UTAH: "UTA", MON: "MTL" };
const DAY = 86400000;
const toDay = (d) => Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`);
export const daysBetween = (to, from) => Math.round((toDay(to) - toDay(from)) / DAY);
const dateText = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const real = (v) => (v && !/^not specified$/i.test(v) ? v : null);

/** Which of our team ids an ESPN team group is. By name first, then by abbreviation. */
export function teamIdFor(group, teams) {
  const byName = teams.find((t) => t.name === group.displayName || normName(t.name) === normName(group.displayName));
  if (byName) return byName.id;
  const abbr = group.injuries?.[0]?.athlete?.team?.abbreviation?.toUpperCase();
  const id = ALIAS[abbr] ?? abbr;
  return teams.some((t) => t.id === id) ? id : null;
}

const STATUS = { "day-to-day": "Day-to-day", "injured reserve": "Injured reserve", out: "Out" };

/** ESPN's injury feed as one flat list of injuries, each with our team id. */
export function parseEspnInjuries(json, teams) {
  const out = [];
  for (const group of json?.injuries ?? []) {
    const team = teamIdFor(group, teams);
    if (!team) continue;
    for (const i of group.injuries ?? []) {
      const a = i.athlete ?? {}, d = i.details ?? {};
      const specific = /\(([^)]+)\)/.exec(i.shortComment ?? "")?.[1];
      const generic = real(d.type);
      const kind = specific && generic && normName(specific) !== normName(generic) ? `${specific[0].toUpperCase()}${specific.slice(1)} (${generic.toLowerCase()})` : (generic ?? (specific ? `${specific[0].toUpperCase()}${specific.slice(1)}` : "Not specified"));
      out.push({
        id: String(i.id ?? a.id ?? `${team}-${a.displayName}`),
        name: a.displayName ?? "Unknown player",
        pos: a.position?.abbreviation ?? null,
        team,
        headshot: a.headshot?.href ?? null,
        status: STATUS[String(i.status ?? "").toLowerCase()] ?? i.status ?? "Unknown",
        longTerm: /\bLT\b/i.test(d.fantasyStatus?.abbreviation ?? ""),
        kind,
        detail: real(d.detail),
        side: real(d.side),
        returnDate: d.returnDate ? String(d.returnDate).slice(0, 10) : null,
        updated: i.date ?? null,
        comment: i.shortComment ?? "",
        note: i.longComment ?? "",
      });
    }
  }
  return out;
}

const SEASON_ENDING = /out for the (?:rest of the )?season|season-ending|miss the (?:rest|remainder) of the season|done for the season/i;

/** How serious it looks: from the reported time out, the injured-reserve type and what the team has said. */
export function severity(item, today) {
  const days = item.returnDate ? daysBetween(item.returnDate, today) : null;
  if (SEASON_ENDING.test(`${item.comment} ${item.note}`)) return { level: "season", label: "Season-ending", days };
  if (item.longTerm || (days != null && days >= 42)) return { level: "serious", label: "Long-term", days };
  if (days != null && days >= 15) return { level: "moderate", label: "Moderate", days };
  if (item.status === "Day-to-day") return { level: "minor", label: "Day-to-day", days };
  if (days != null) return { level: "minor", label: "Short-term", days };
  return { level: "unknown", label: "Unknown", days };
}

/** When he may be back, in words: time left to a reported return date, what the team said, or that nothing is reported. */
export function timeBack(item, today) {
  const sev = severity(item, today), days = sev.days;
  if (sev.level === "season") return { text: "Out for the season", days: null, date: null };
  if (days == null) {
    const w = /(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*weeks?/i.exec(`${item.comment} ${item.note}`);
    if (w) return { text: `Reported: ${w[2] ? `${w[1]}–${w[2]}` : w[1]} weeks`, days: null, date: null };
    return { text: item.status === "Day-to-day" ? "Day-to-day, no return date" : "No return date reported", days: null, date: null };
  }
  const date = item.returnDate;
  if (days < 0) return { text: `Return date passed (${dateText(date)}): could be back any day`, days, date };
  if (days === 0) return { text: "Could return today", days, date };
  if (days === 1) return { text: `About a day · ${dateText(date)}`, days, date };
  if (days < 14) return { text: `About ${days} days · ${dateText(date)}`, days, date };
  const weeks = Math.round(days / 7);
  return { text: `About ${weeks} ${weeks === 1 ? "week" : "weeks"} · ${dateText(date)}`, days, date };
}

/**
 * A season's production by player, as an impact index per game, and where each player stands among his position group.
 * Skaters use the same box-score index as the rest of the app (goals, assists, shots, plus-minus, penalty minutes); goalies use saves above a .900 save percentage.
 */
export function impactBook({ skaters = [], goalies = [], minGp = 5 }) {
  const rows = [];
  for (const s of skaters) {
    const gp = Number(s.gamesPlayed ?? 0);
    if (!gp) continue;
    const per = skaterImpact({ goals: s.goals, assists: s.assists, shots: s.shots, plusMinus: s.plusMinus, pim: s.penaltyMinutes }) / gp;
    rows.push({ key: normName(s.skaterFullName), group: "skater", gp, perGame: per, goals: s.goals ?? 0, assists: s.assists ?? 0, toi: s.timeOnIcePerGame ? s.timeOnIcePerGame / 60 : null, team: s.teamAbbrevs ?? null });
  }
  for (const g of goalies) {
    const gp = Number(g.gamesPlayed ?? 0);
    if (!gp || g.saves == null || !g.shotsAgainst) continue;
    rows.push({ key: normName(g.goalieFullName), group: "goalie", gp, perGame: (g.saves - 0.9 * g.shotsAgainst) / gp, savePct: g.savePct ?? null, team: g.teamAbbrevs ?? null });
  }
  const pool = (group) => rows.filter((r) => r.group === group && r.gp >= minGp).map((r) => r.perGame).sort((a, b) => a - b);
  const pools = { skater: pool("skater"), goalie: pool("goalie") };
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const percentile = (r) => {
    const p = pools[r.group];
    if (p.length < 5) return null;
    let below = 0;
    while (below < p.length && p[below] < r.perGame) below++;
    return Math.round((below / p.length) * 100);
  };
  return { get: (name) => byKey.get(normName(name)) ?? null, percentile, size: rows.length };
}

const levelOf = (pct) => (pct == null ? null : pct >= 80 ? "high" : pct >= 40 ? "medium" : "low");
export const IMPACT_LABEL = { high: "High impact", medium: "Medium impact", low: "Low impact" };

/**
 * How much the team misses him, from how he produced in earlier games: this season once he has played a few (3+), otherwise last season.
 * @param {{ get: (n: string) => any, percentile: (r: any) => number | null }} current
 * @param {{ get: (n: string) => any, percentile: (r: any) => number | null } | null} previous
 */
export function impactFor(name, current, previous, { minCurrent = 3 } = {}) {
  const c = current.get(name), p = previous?.get(name);
  const use = c && c.gp >= minCurrent ? { r: c, book: current, basis: "season" } : p && p.gp >= 5 ? { r: p, book: previous, basis: "last" } : c ? { r: c, book: current, basis: "season" } : null;
  if (!use) return { basis: "none", level: null, label: "No earlier games to judge by", percentile: null, gp: 0 };
  const { r, book, basis } = use;
  const pct = book.percentile(r), level = levelOf(pct);
  return { basis, small: basis === "season" && r.gp < minCurrent, gp: r.gp, perGame: Math.round(r.perGame * 100) / 100, percentile: pct, level, label: level ? IMPACT_LABEL[level] : "Not enough players to rank", goals: r.goals, assists: r.assists, toi: r.toi == null ? null : Math.round(r.toi * 10) / 10, savePct: r.savePct ?? null, group: r.group };
}

const SEV_RANK = { season: 4, serious: 3, moderate: 2, minor: 1, unknown: 0 };

/**
 * The whole report: every injured player with his injury, severity, time back and impact, plus which teams are hurt most.
 * @param {{ espn: any, teams: any[], today: string, now?: number, season: number, skaters?: any[], goalies?: any[], prevSkaters?: any[], prevGoalies?: any[] }} a
 */
export function buildInjuryReport({ espn, teams, today, now = Date.now(), season, skaters = [], goalies = [], prevSkaters = [], prevGoalies = [] }) {
  const cur = impactBook({ skaters, goalies, minGp: 3 });
  const prev = prevSkaters.length || prevGoalies.length ? impactBook({ skaters: prevSkaters, goalies: prevGoalies, minGp: 10 }) : null;
  const items = parseEspnInjuries(espn, teams).map((i) => ({ ...i, severity: severity(i, today), back: timeBack(i, today), impact: impactFor(i.name, cur, prev) }));
  items.sort((a, b) => (b.impact.percentile ?? -1) - (a.impact.percentile ?? -1) || SEV_RANK[b.severity.level] - SEV_RANK[a.severity.level] || a.name.localeCompare(b.name));
  const teamsOut = new Map();
  for (const i of items) {
    const t = teamsOut.get(i.team) ?? { team: i.team, count: 0, high: 0, lost: 0 };
    t.count++;
    if (i.impact.level === "high") t.high++;
    t.lost += (i.impact.percentile ?? 0) / 100;
    teamsOut.set(i.team, t);
  }
  const teamList = [...teamsOut.values()].map((t) => ({ ...t, lost: Math.round(t.lost * 10) / 10 })).sort((a, b) => b.lost - a.lost || b.count - a.count);
  return {
    schema: 1,
    season,
    updatedAt: new Date(now).toISOString(),
    sourceUpdated: espn?.timestamp ?? null,
    source: "ESPN injury report; impact from NHL box-score production",
    counts: { total: items.length, dayToDay: items.filter((i) => i.status === "Day-to-day").length, longTerm: items.filter((i) => i.severity.level === "serious" || i.severity.level === "season").length, high: items.filter((i) => i.impact.level === "high").length },
    teams: teamList,
    items,
  };
}
