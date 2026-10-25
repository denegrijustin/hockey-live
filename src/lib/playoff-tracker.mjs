// The playoff tracker: every team in a conference sorted into a tier by its simulated chance of making the playoffs. Pure, so the page and the tests share it.
// A conference has 8 spots (3 per division and 2 wild cards in each of the two divisions). "In the field" means the team made it in every simulated season.

export const TIERS = [
  { key: "in", label: "In the field", note: "made it in every simulated season", min: 99.95 },
  { key: "likely", label: "Likely in", note: "80% or better", min: 80 },
  { key: "toss", label: "Toss-up", note: "40% to 80%", min: 40 },
  { key: "life", label: "Life support", note: "5% to 40%: needs wins and help", min: 5 },
  { key: "long", label: "Long shot", note: "under 5%", min: 0.0001 },
  { key: "out", label: "Eliminated", note: "never made it in a simulated season", min: -Infinity },
];

/** @param {{ teams: any[], result: { teams: Record<string, { pPlayoffs: number }> }, spots?: number }} o */
export function buildTracker({ teams, result, spots = 8 }) {
  return ["E", "W"].map((conf) => {
    const members = teams.filter((t) => t.conference === conf && result.teams[t.id]);
    const tiers = TIERS.map((tier) => ({ ...tier, teams: /** @type {{ id: string, p: number }[]} */ ([]) }));
    for (const t of members) {
      const p = result.teams[t.id].pPlayoffs;
      const tier = tiers.find((x) => p >= x.min) ?? tiers.at(-1);
      tier.teams.push({ id: t.id, p });
    }
    for (const tier of tiers) tier.teams.sort((a, b) => b.p - a.p || a.id.localeCompare(b.id));
    const inField = tiers[0].teams.length;
    return { conf, spots, inField, contention: members.length - tiers.at(-1).teams.length, tiers };
  });
}
