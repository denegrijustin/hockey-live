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

/** The provider's own status words, verbatim ("Injured Reserve", "Day-To-Day", "Out", anything else as given); "Not reported" only when the feed gives none. */
const statusText = (v) => (String(v ?? "").trim() || "Not reported");
export const isDayToDay = (item) => /^day[- ]?to[- ]?day$/i.test(String(item?.status ?? "").trim());

/** What the provider's fantasy status codes mean, only where that is certain. Unknown codes show the code alone. */
export const FANTASY_DEFINITIONS = { IR: "IR = injured reserve", "IR-LT": "IR-LT = long-term injured reserve" };
export const fantasyDefinition = (code) => FANTASY_DEFINITIONS[String(code ?? "").toUpperCase()] ?? null;

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
        headshot: a.headshot?.href ?? (a.id ? `https://a.espncdn.com/i/headshots/nhl/players/full/${a.id}.png` : null),
        status: statusText(i.status),
        statusRaw: i.status ?? null,
        fantasy: d.fantasyStatus?.abbreviation ?? null,
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

/**
 * An ESTIMATE of how serious it looks, from the reported return date, the long-term injured-reserve code and what the team has said. The thresholds (42 and 15 days) are this app's own,
 * not the league's or the provider's, so the UI shows the result only as "Estimated from the reported return date". No basis at all is "Not reported", never short-term.
 */
export function severity(item, today) {
  const days = item.returnDate ? daysBetween(item.returnDate, today) : null;
  if (SEASON_ENDING.test(`${item.comment} ${item.note}`)) return { level: "season", label: "Season-ending", days };
  if (item.longTerm || (days != null && days >= 42)) return { level: "serious", label: "Long-term", days };
  if (days != null && days >= 15) return { level: "moderate", label: "Moderate", days };
  if (isDayToDay(item)) return { level: "minor", label: "Day-to-day", days };
  if (days != null) return { level: "minor", label: "Short-term", days };
  return { level: "unknown", label: "Not reported", days };
}

/**
 * When he may be back, in the provider's words only: "Reported return date (estimate): Oct 29" when the feed has a return date, "Return date has passed (Oct 20)" when that date is behind us,
 * "Out for the season" when the team's own comment says so, otherwise exactly "No return date reported". `days` (to the date) is kept for sorting.
 */
export function timeBack(item, today) {
  const sev = severity(item, today), days = sev.days;
  if (sev.level === "season") return { text: "Out for the season", days: null, date: null };
  if (days == null) return { text: "No return date reported", days: null, date: null };
  const date = item.returnDate;
  if (days < 0) return { text: `Return date has passed (${dateText(date)})`, days, date };
  return { text: `Reported return date (estimate): ${dateText(date)}`, days, date };
}

/** "Reported 3 days ago" for the report's own timestamp, with the absolute time for a tooltip; null when the feed gave none. */
export function reportedAgo(updated, now = Date.now()) {
  const t = Date.parse(updated ?? "");
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((now - t) / 60000));
  const hours = Math.round(mins / 60), days = Math.round(mins / 1440);
  const text = mins < 2 ? "Reported just now" : mins < 60 ? `Reported ${mins} min ago` : mins < 1440 ? `Reported ${hours} h ago` : `Reported ${days} ${days === 1 ? "day" : "days"} ago`;
  return { text, title: new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }) };
}

/** One roster match by normalized name, or null when there is none or more than one (never a guess). */
export function matchRoster(name, roster = []) {
  const k = normName(name);
  const hits = roster.filter((p) => normName(p.name) === k);
  return hits.length === 1 ? hits[0] : null;
}

/** The provider's status as a count bucket: IR-LT, IR (injured reserve with any other IR code), Day-To-Day, Out, other. */
export const statusBucket = (i) => (i.longTerm ? "irLt" : /injured reserve/i.test(i.status) ? "ir" : isDayToDay(i) ? "dayToDay" : /^out$/i.test(i.status) ? "out" : "other");

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
    schema: 2,
    season,
    updatedAt: new Date(now).toISOString(),
    sourceUpdated: espn?.timestamp ?? null,
    source: "ESPN injury report; impact from NHL box-score production",
    counts: { total: items.length, byStatus: items.reduce((m, i) => ({ ...m, [statusBucket(i)]: m[statusBucket(i)] + 1 }), { ir: 0, irLt: 0, dayToDay: 0, out: 0, other: 0 }), dayToDay: items.filter(isDayToDay).length, longTerm: items.filter((i) => i.severity.level === "serious" || i.severity.level === "season").length, high: items.filter((i) => i.impact.level === "high").length },
    teams: teamList,
    items,
  };
}

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 98th. */
export const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th")}`;
