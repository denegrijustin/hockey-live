/**
 * Monte Carlo playoff projection (pure, deterministic for a given seed).
 *
 * Model: same transparent Poisson idea as projection.mjs. Team attack/defense
 * rates (goals for/against per game) are shrunk toward the prior-season rate
 * (or a 3.0 league prior) using 20 games of prior history; home edge is 0.12
 * goals. Independent Poisson goals per game; regulation ties go to OT/SO,
 * where the home side wins with probability attackH / (attackH + attackA).
 * OT/SO winner gets 2 points and no regulation win; the loser gets 1 point.
 *
 * Playoff format: 16 teams; per conference the top 3 of each division plus the
 * 2 best remaining teams. Division seeds are ordered by points.
 *
 * Playoff rounds: the 16 teams are then played through the NHL bracket (division winner with the better record plays the lower wild card, the other
 * division winner the higher wild card, 2nd v 3rd inside each division; division finals; conference finals; the Final), each series best of seven with
 * home ice (games 1, 2, 5, 7) for the team with the better regular-season record, each game won with the same Poisson model. It is played from the
 * regular-season standings: series already played in a real postseason are not tracked.
 *
 * Tiebreaks: points, then regulation wins, then a seeded coin flip. The NHL's
 * full procedure (head-to-head points, regulation+OT wins, goal differential)
 * is NOT implemented. This is an uncalibrated model, not official odds.
 */
const PRIOR_GAMES = 20;
const LEAGUE_RATE = 3;
const HOME_EDGE = 0.12;
import { isCalledOff } from "./game-data.mjs";
const finished = (g) => g.state === "OFF" || g.state === "FINAL";
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rates(row, prior) {
  const gp = row?.gp ?? 0;
  const priorRate = (k) => (prior?.gp ? (prior[k] + LEAGUE_RATE * PRIOR_GAMES) / (prior.gp + PRIOR_GAMES) : LEAGUE_RATE);
  const rate = (k) => ((row?.[k] ?? 0) + priorRate(k) * PRIOR_GAMES) / (gp + PRIOR_GAMES);
  return { attack: rate("gf"), defense: rate("ga") };
}

function poisson(mean) {
  const p = [Math.exp(-mean)];
  for (let i = 1; i < 30; i++) p.push((p[i - 1] * mean) / i);
  return p;
}

/** Returns cumulative thresholds [homeReg, homeReg+homeOT, ...+awayOT] for one game. */
function gameProbs(h, a) {
  const hm = clamp((h.attack + a.defense) / 2 + HOME_EDGE, 1, 6);
  const am = clamp((a.attack + h.defense) / 2 - HOME_EDGE, 1, 6);
  const hp = poisson(hm), ap = poisson(am);
  let homeReg = 0, tie = 0, mass = 0;
  for (let i = 0; i < hp.length; i++)
    for (let j = 0; j < ap.length; j++) {
      const p = hp[i] * ap[j];
      mass += p;
      if (i > j) homeReg += p;
      else if (i === j) tie += p;
    }
  homeReg /= mass; tie /= mass;
  const homeShare = h.attack / (h.attack + a.attack);
  const c1 = homeReg, c2 = homeReg + tie * homeShare, c3 = homeReg + tie;
  return [c1, c2, c3];
}

export function simulatePlayoffs({ games, teams, table, baseline = {}, sims = 20000, seed = 1 }) {
  const n = teams.length;
  const index = new Map(teams.map((t, i) => [t.id, i]));
  const strength = teams.map((t) => rates(table?.[t.id], baseline?.[t.id]));
  const basePts = Float64Array.from(teams, (t) => table?.[t.id]?.pts ?? 0);
  const baseRw = Float64Array.from(teams, (t) => table?.[t.id]?.rw ?? 0);

  const remaining = games.filter((g) => g.type === 2 && !finished(g) && !isCalledOff(g) && index.has(g.home) && index.has(g.away));
  const m = remaining.length;
  const complete = m === 0;
  const H = new Int32Array(m), A = new Int32Array(m);
  const C = new Float64Array(m * 3);
  remaining.forEach((g, k) => {
    H[k] = index.get(g.home); A[k] = index.get(g.away);
    const c = gameProbs(strength[H[k]], strength[A[k]]);
    C[k * 3] = c[0]; C[k * 3 + 1] = c[1]; C[k * 3 + 2] = c[2];
  });

  // Group structure.
  const confs = [...new Set(teams.map((t) => t.conference))];
  const confTeams = confs.map((c) => teams.map((t, i) => (t.conference === c ? i : -1)).filter((i) => i >= 0));
  const divs = confs.map((c, ci) =>
    [...new Set(confTeams[ci].map((i) => teams[i].division))].map((d) => confTeams[ci].filter((i) => teams[i].division === d)),
  );

  // Playoff bracket: needs two conferences of two divisions, each with at least three teams (not true of the toy worlds in the tests).
  const bracketOk = confs.length === 2 && divs.every((d) => d.length === 2 && d.every((x) => x.length >= 3));
  let pw = null; // pw[h * n + a]: chance the home team h beats a in one game
  if (bracketOk) {
    pw = new Float64Array(n * n);
    for (let h = 0; h < n; h++) for (let a = 0; a < n; a++) if (h !== a) pw[h * n + a] = gameProbs(strength[h], strength[a])[1];
  }
  const nSims = complete ? Math.min(sims, 10000) : sims; // a finished regular season is fixed, but the bracket still needs many plays
  const counts = {
    div: [new Float64Array(n), new Float64Array(n), new Float64Array(n)],
    wc: [new Float64Array(n), new Float64Array(n)],
    conf1: new Float64Array(n),
    pres: new Float64Array(n),
    r2: new Float64Array(n), r3: new Float64Array(n), fin: new Float64Array(n), cup: new Float64Array(n),
  };
  const sumPts = new Float64Array(n), sumRw = new Float64Array(n);
  const pts = new Float64Array(n), rw = new Float64Array(n), key = new Float64Array(n);
  const rand = mulberry32(seed);
  const byKey = (a, b) => key[b] - key[a];
  const taken = new Uint8Array(n);
  /** Best of seven; the team with the higher key has home ice in games 1, 2, 5 and 7. Returns the winner. */
  const series = (x, y) => {
    const hi = key[x] >= key[y] ? x : y, lo = hi === x ? y : x;
    let hw = 0, lw = 0, g = 0;
    while (hw < 4 && lw < 4) {
      const hiHome = g === 0 || g === 1 || g === 4 || g === 6;
      const p = hiHome ? pw[hi * n + lo] : 1 - pw[lo * n + hi];
      if (rand() < p) hw++; else lw++;
      g++;
    }
    return hw === 4 ? hi : lo;
  };
  const divTop = confs.map(() => []), wcOf = confs.map(() => []);

  for (let s = 0; s < nSims; s++) {
    pts.set(basePts); rw.set(baseRw);
    for (let k = 0; k < m; k++) {
      const r = rand(), c = k * 3, h = H[k], a = A[k];
      if (r < C[c]) { pts[h] += 2; rw[h]++; }
      else if (r < C[c + 1]) { pts[h] += 2; pts[a] += 1; }
      else if (r < C[c + 2]) { pts[a] += 2; pts[h] += 1; }
      else { pts[a] += 2; rw[a]++; }
    }
    for (let i = 0; i < n; i++) {
      sumPts[i] += pts[i]; sumRw[i] += rw[i];
      // Complete seasons break exact ties by team order instead of a coin flip.
      key[i] = pts[i] * 1000 + rw[i] + (complete ? -i * 1e-6 : rand() * 0.5);
    }
    taken.fill(0);
    let best = -1;
    for (let ci = 0; ci < confs.length; ci++) {
      const conf = confTeams[ci];
      if (bracketOk) divTop[ci] = []; // fresh every simulation
      for (const div of divs[ci]) {
        const order = [...div].sort(byKey);
        for (let r = 0; r < 3 && r < order.length; r++) {
          counts.div[r][order[r]]++; taken[order[r]] = 1;
        }
        if (bracketOk) divTop[ci].push(order);
      }
      const rest = conf.filter((i) => !taken[i]).sort(byKey);
      for (let r = 0; r < 2 && r < rest.length; r++) counts.wc[r][rest[r]]++;
      if (bracketOk) wcOf[ci] = rest.slice(0, 2);
      let top = conf[0];
      for (const i of conf) if (key[i] > key[top]) top = i;
      counts.conf1[top]++;
    }
    for (let i = 0; i < n; i++) if (best < 0 || key[i] > key[best]) best = i;
    counts.pres[best]++;
    if (bracketOk) {
      const champs = [];
      for (let ci = 0; ci < confs.length; ci++) {
        // the better division winner plays the lower wild card, the other division winner the higher one; 2nd v 3rd inside each division
        const [d0, d1] = divTop[ci];
        const aTop = key[d0[0]] >= key[d1[0]], A = aTop ? d0 : d1, B = aTop ? d1 : d0, [wc1, wc2] = wcOf[ci];
        const a1 = series(A[0], wc2), b1 = series(B[0], wc1), a2 = series(A[1], A[2]), b2 = series(B[1], B[2]);
        counts.r2[a1]++; counts.r2[b1]++; counts.r2[a2]++; counts.r2[b2]++;
        const a3 = series(a1, a2), b3 = series(b1, b2);
        counts.r3[a3]++; counts.r3[b3]++;
        const champ = series(a3, b3);
        counts.fin[champ]++; champs.push(champ);
      }
      counts.cup[series(champs[0], champs[1])]++;
    }
  }

  const pct = (x) => (x / nSims) * 100;
  const teamsOut = {};
  teams.forEach((t, i) => {
    const pDivision = counts.div.map((c) => pct(c[i]));
    const pWildCard = counts.wc.map((c) => pct(c[i]));
    const pPlayoffs = pDivision.reduce((x, y) => x + y, 0) + pWildCard.reduce((x, y) => x + y, 0);
    teamsOut[t.id] = {
      pPlayoffs: Math.min(100, pPlayoffs),
      pMiss: Math.max(0, 100 - pPlayoffs),
      pDivision, pWildCard,
      pConferenceFirst: pct(counts.conf1[i]),
      pPresidents: pct(counts.pres[i]),
      // the rounds (null when the league is not two conferences of two divisions): win round 1, win round 2, win the conference, win the Cup
      pRound2: bracketOk ? pct(counts.r2[i]) : null, pRound3: bracketOk ? pct(counts.r3[i]) : null,
      pFinal: bracketOk ? pct(counts.fin[i]) : null, pCup: bracketOk ? pct(counts.cup[i]) : null,
      expPts: sumPts[i] / nSims,
      expRegWins: sumRw[i] / nSims,
    };
  });
  return { teams: teamsOut, sims, remainingGames: m, complete };
}

/** Per-team playoff chance (0-100) for game cards; clamped to [1,99] unless the season is complete. */
export function chancesForCards(result, teams) {
  return Object.fromEntries(
    teams.map((t) => {
      const p = result.teams[t.id]?.pPlayoffs ?? 50;
      return [t.id, { chance: result.complete ? (p >= 50 ? 100 : 0) : clamp(p, 1, 99) }];
    }),
  );
}
