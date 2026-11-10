import { computeFlow, FLOW_WINDOW_SEC } from './flow.mjs';
export function playMinute(play, gameType = 2) {
  const [m, s] = (play.time ?? '').split(':').map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(s) || !play.period || play.periodType === 'SO') return null;
  return Math.min(play.period - 1, 3) * 20 + Math.max(0, play.period - 4) * (gameType === 3 ? 20 : 5) + m + s / 60;
}
export function pulseMinute(game) {
  if (!game.period) return null;
  const length = game.period > 3 && game.type !== 3 ? 5 : 20;
  const start = Math.min(game.period - 1, 3) * 20 + Math.max(0, game.period - 4) * (game.type === 3 ? 20 : 5);
  if (game.periodType === 'SO') return 65;
  if (game.intermission || ['OFF','FINAL'].includes(game.state)) {
    if (game.intermission) return start + length;
  }
  const [m,s]=(game.clock ?? '').split(':').map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return ['OFF','FINAL'].includes(game.state) ? start + length : null;
  return start + length - m - s / 60;
}
/** Unblocked attempt share is a pressure proxy, not tracked offensive-zone possession. */
export function iceTilt(game) {
  const end=pulseMinute(game);
  if (end == null || !Array.isArray(game.plays)) return null;
  const attempts=game.plays.filter(p=>['goal','shot-on-goal','missed-shot'].includes(p.type) && p.periodType !== 'SO').filter(p=>{
    const minute=playMinute(p,game.type);return minute != null && minute > Math.max(0,end-10) && minute <= end;
  });
  const home=attempts.filter(p=>p.team===game.home).length,away=attempts.filter(p=>p.team===game.away).length;
  return {home,away,homeShare:home+away ? home/(home+away) : null,minutes:Math.min(10,end)};
}

/**
 * Game flow for the compact card and chart: a view of the Phase 5 "shot-attempt pressure" series (src/lib/flow.mjs, documented in
 * docs/phase5-momentum.md). CHANGED from the earlier "momentum" index: goals 5 / SOG 1.25 / missed .65 / hits .3 / penalties -1.6 on a
 * five-minute fade are replaced by attempt weights goal 1.0 / SOG .30 / missed .15 / blocked .10 (credited to the shooter) with an
 * optional distance multiplier, hits and penalties excluded, values normalised to [-1, 1] by a fixed reference. Positive favours home.
 * Return shape is unchanged: { points: [{ minute, value }], current, windowMinutes }, plus `series` (the full flow object).
 */
export function gameFlow(game, step = 0.25) {
  const end = pulseMinute(game);
  if (end == null || !Array.isArray(game.plays)) return null;
  const series = computeFlow(game.plays, { home: game.home, away: game.away, gameType: game.type, step: Math.max(1, Math.round(step * 60)), through: end * 60, until: end * 60 });
  const points = series ? series.points.map((p) => ({ minute: p.t / 60, value: p.value })) : [{ minute: 0, value: 0 }, { minute: end, value: 0 }];
  return { points, current: points.at(-1)?.value ?? 0, windowMinutes: FLOW_WINDOW_SEC / 60, series };
}
