/** An uncalibrated, transparent Poisson estimate, not betting odds. */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export function elapsedMinutes(game) {
  if (!game.period || game.period > 3) return null;
  if (game.intermission) return game.period * 20;
  if (!/^\d{1,2}:\d{2}$/.test(game.clock ?? '')) return null;
  const [m, s] = game.clock.split(':').map(Number);
  if (m > 20 || s > 59 || m * 60 + s > 1200) return null;
  return (game.period - 1) * 20 + 20 - m - s / 60;
}
function strength(row, prior) {
  const gp = row?.gp ?? 0;
  const priorRate = (key) => prior?.gp ? (prior[key] + 3 * 20) / (prior.gp + 20) : 3;
  const rate = (key) => ((row?.[key] ?? 0) + priorRate(key) * 20) / (gp + 20);
  const recent = (row?.results ?? []).slice(-5);
  const form = recent.length ? clamp(recent.reduce((s, r) => s + r.gf - r.ga, 0) / recent.length - (rate('gf') - rate('ga')), -2, 2) * .08 * recent.length / 5 : 0;
  return { attack: rate('gf'), defense: rate('ga'), form };
}
function poisson(mean) {
  const p = [Math.exp(-mean)];
  for (let i = 1; i < 40; i++) p.push(p[i - 1] * mean / i);
  return p;
}
/** @param {any} game @param {any} table @param {any} baseline @param {any} feed */
export function projectGame(game, table = {}, baseline = {}, feed = null) {
  if (['OFF', 'FINAL'].includes(game.state) || game.type === 1) return null;
  // Use one coherent play-by-play snapshot for score, clock, strength and events.
  if (feed && ['LIVE', 'CRIT'].includes(game.state) && ['LIVE', 'CRIT'].includes(feed.state)) game = feed;
  const h = strength(table?.[game.home], baseline?.[game.home]);
  const a = strength(table?.[game.away], baseline?.[game.away]);
  let homeMean = clamp((h.attack + a.defense) / 2 + .12 + h.form, 1, 6);
  let awayMean = clamp((a.attack + h.defense) / 2 - .12 + a.form, 1, 6);
  const live = ['LIVE', 'CRIT'].includes(game.state);
  let hs = 0, as = 0, shotAdjustment = 0;
  const situation = feed?.situation;
  const advantage = situation?.homePowerPlay && situation.home > situation.away ? 1 : situation?.awayPowerPlay && situation.away > situation.home ? -1 : 0;
  const ppMinutes = advantage && Number.isFinite(situation.seconds) ? clamp(situation.seconds / 60, 0, 5) : 0;
  const ppBoost = situation && Math.abs(situation.home - situation.away) > 1 ? 2.4 : 1.7;
  const factors = [];
  const adjustPowerPlay = (hm, am, remaining) => {
    const fraction = remaining > 0 ? Math.min(ppMinutes, remaining) / remaining : 0;
    return [hm * (1 + fraction * (advantage === 1 ? ppBoost : advantage === -1 ? -.35 : 0)), am * (1 + fraction * (advantage === -1 ? ppBoost : advantage === 1 ? -.35 : 0))];
  };
  if (live) {
    if (game.homeScore == null || game.awayScore == null) return null;
    hs = game.homeScore; as = game.awayScore;
    // Shootout attempt state is not represented by the scoreboard. Withhold estimates.
    if (game.periodType === 'SO') return null;
    if ((game.period ?? 0) > 3) {
      if (hs !== as) return null; // Await the official final after a sudden-death goal.
      const base = homeMean / (homeMean + awayMean);
      const [hm, am] = adjustPowerPlay(homeMean, awayMean, ppMinutes || 1);
      const eventChance = 1 - Math.exp(-(hm + am) * ppMinutes / 60);
      const homeWin = eventChance * hm / (hm + am) + (1 - eventChance) * base;
      return { live, homeWin, score: {home: hs + (homeWin >= .5 ? 1 : 0), away: as + (homeWin < .5 ? 1 : 0)}, shotAdjustment: 0, overtime: true, factors: [`Tied in overtime; next-goal estimate uses season strength.`, ...(advantage ? [`${advantage > 0 ? game.home : game.away} has a ${situation.home}–${situation.away} skater advantage${ppMinutes ? ` (${situation.seconds}s remaining)` : '; duration unavailable'}.`] : [])] };
    }
    const elapsed = elapsedMinutes(game);
    if (elapsed == null) return null;
    // Only use detailed shots when their score/period agrees with the scoreboard.
    const aligned = feed && feed.homeScore === hs && feed.awayScore === as && feed.period === game.period;
    const shots = aligned ? feed.shots.filter(s => s.period <= 3 && s.periodType !== 'SO').filter(s => {
      const [m, sec] = s.time.split(':').map(Number);
      const t = (s.period - 1) * 20 + m + sec / 60;
      return t <= elapsed && t >= elapsed - 10;
    }) : [];
    const recentH = shots.filter(s => s.team === game.home).length;
    const recentA = shots.filter(s => s.team === game.away).length;
    const totalH = game.homeShots, totalA = game.awayShots;
    const overall = totalH != null && totalA != null ? (totalH - totalA) / (totalH + totalA + 20) : 0;
    shotAdjustment = clamp(overall * .2 + (recentH - recentA) / (recentH + recentA + 10) * .15, -.25, .25);
    homeMean *= (60 - elapsed) / 60 * (1 + shotAdjustment);
    awayMean *= (60 - elapsed) / 60 * (1 - shotAdjustment);
    [homeMean, awayMean] = adjustPowerPlay(homeMean, awayMean, 60 - elapsed);
    factors.push(hs === as ? `Tied ${hs}–${as} with ${(60 - elapsed).toFixed(1)} regulation minutes left.` : `${hs > as ? game.home : game.away} leads ${Math.max(hs, as)}–${Math.min(hs, as)} with ${(60 - elapsed).toFixed(1)} regulation minutes left.`);
    if (advantage) factors.push(`${advantage > 0 ? game.home : game.away} power play: ${situation.home}–${situation.away} skaters (home–away)${ppMinutes ? `, ${situation.seconds}s remaining` : ', duration unavailable; no strength adjustment'}.`);
    if (recentH + recentA) factors.push(`Last 10 minutes: ${game.home} ${recentH}, ${game.away} ${recentA} shots on goal.`);
    else if (totalH != null && totalA != null) factors.push(`Shots on goal: ${game.home} ${totalH}, ${game.away} ${totalA}.`);
    factors.push('Season scoring history and recent form set the starting strength.');
  }
  const hp = poisson(homeMean), ap = poisson(awayMean);
  const tieShare = h.attack / (h.attack + a.attack);
  let homeWin = 0, mass = 0;
  const scores = new Map();
  const add = (home, away, p) => { const key = `${home}:${away}`; scores.set(key, (scores.get(key) ?? 0) + p); };
  for (let i = 0; i < hp.length; i++) for (let j = 0; j < ap.length; j++) {
    const p = hp[i] * ap[j], home = hs + i, away = as + j;
    mass += p;
    if (home === away) {
      homeWin += p * tieShare;
      add(home + 1, away, p * tieShare); add(home, away + 1, p * (1 - tieShare));
    } else { if (home > away) homeWin += p; add(home, away, p); }
  }
  const likely = [...scores.entries()].sort((x, y) => y[1] - x[1])[0][0].split(':').map(Number);
  return { live, homeWin: homeWin / mass, score: { home: likely[0], away: likely[1] }, shotAdjustment, overtime: false, factors };
}
