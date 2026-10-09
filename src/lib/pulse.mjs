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

const FLOW_WEIGHT = {
  goal: 5,
  'shot-on-goal': 1.25,
  'missed-shot': 0.65,
  hit: 0.3,
  penalty: -1.6,
};

/**
 * Recent game momentum on a five-minute rolling window. Positive values favor
 * the home team; negative values favor the away team. Older events fade
 * linearly so the line reacts to the latest pressure instead of becoming a
 * cumulative activity chart. A penalty is charged against the penalized team.
 */
export function gameFlow(game, step = 0.5) {
  const end = pulseMinute(game);
  if (end == null || !Array.isArray(game.plays)) return null;
  const events = game.plays
    .map((play) => ({ ...play, minute: playMinute(play, game.type) }))
    .filter((play) => play.minute != null && play.minute <= end && FLOW_WEIGHT[play.type] != null);
  const sample = (minute) => {
    let value = 0;
    for (const event of events) {
      const age = minute - event.minute;
      if (age < 0 || age > 5 || !event.team) continue;
      const weight = FLOW_WEIGHT[event.type] * (1 - age / 5);
      value += event.team === game.home ? weight : event.team === game.away ? -weight : 0;
    }
    return Math.round(value * 100) / 100;
  };
  const points = [];
  for (let minute = 0; minute < end; minute += step) points.push({ minute, value: sample(minute) });
  points.push({ minute: end, value: sample(end) });
  return { points, current: points.at(-1)?.value ?? 0, windowMinutes: 5 };
}
