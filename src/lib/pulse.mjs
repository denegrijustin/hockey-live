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
