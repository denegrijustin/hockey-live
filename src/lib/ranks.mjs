/** Standings ranks by points percentage (points / 2*GP), then points, regulation wins, goal differential. */
const DIVISION_SHORT = { Atlantic: "ATL", Metropolitan: "MET", Central: "CEN", Pacific: "PAC" };
const CONFERENCE_NAME = { E: "East", W: "West" };
const CONFERENCE_LONG = { E: "Eastern", W: "Western" };
const pct = (r) => (r && r.gp > 0 ? r.pts / (2 * r.gp) : 0);
/** Positive when a ranks ahead of b. */
function compare(a, b) {
  return (
    pct(a) - pct(b) ||
    (a?.pts ?? 0) - (b?.pts ?? 0) ||
    (a?.rw ?? 0) - (b?.rw ?? 0) ||
    ((a?.gf ?? 0) - (a?.ga ?? 0)) - ((b?.gf ?? 0) - (b?.ga ?? 0))
  );
}
const rankIn = (table, ids, id) =>
  1 + ids.filter((k) => compare(table[k], table[id]) > 0).length;
/** @returns {Record<string, any> | null} */
export function teamRanks(table, teams) {
  if (!table || !teams?.length) return null;
  if (!teams.some((t) => (table[t.id]?.gp ?? 0) > 0)) return null;
  /** @type {Record<string, any>} */ const out = {};
  for (const t of teams) {
    if (!table[t.id]) continue;
    const div = teams.filter((x) => x.division === t.division && table[x.id]).map((x) => x.id),
      conf = teams.filter((x) => x.conference === t.conference && table[x.id]).map((x) => x.id),
      all = teams.filter((x) => table[x.id]).map((x) => x.id);
    out[t.id] = {
      division: rankIn(table, div, t.id),
      divisionSize: div.length,
      conference: rankIn(table, conf, t.id),
      conferenceSize: conf.length,
      league: rankIn(table, all, t.id),
      leagueSize: all.length,
      divisionName: t.division,
      conferenceCode: t.conference,
    };
  }
  return out;
}
export const divisionShort = (name) => DIVISION_SHORT[name] ?? String(name ?? "").slice(0, 3).toUpperCase();
export function ordinal(n) {
  const m = n % 100;
  if (m >= 11 && m <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}
export function rankLine(r, compact = false) {
  if (!r) return "";
  const conf = compact ? r.conferenceCode : (CONFERENCE_NAME[r.conferenceCode] ?? r.conferenceCode);
  return `${divisionShort(r.divisionName)} #${r.division} · ${conf} #${r.conference} · #${r.league}${compact ? "" : " overall"}`;
}
export function rankTitle(r) {
  if (!r) return "";
  return `${ordinal(r.division)} of ${r.divisionSize} in the ${r.divisionName} · ${ordinal(r.conference)} of ${r.conferenceSize} in the ${CONFERENCE_LONG[r.conferenceCode] ?? r.conferenceCode} Conference · ${ordinal(r.league)} of ${r.leagueSize} overall, by points percentage`;
}
