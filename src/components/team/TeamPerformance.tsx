import { asOfText, DASH, fixed, pct3, pctWhole, recText, signed } from "./format";

const Row = ({ label, w }: { label: string; w: any }) => (
  <tr>
    <th scope="row">{label}{w.short && w.gp > 0 && <small> (only {w.gp})</small>}</th>
    <td>{w.gp ? recText(w) : DASH}</td><td>{w.gp ? w.pts : DASH}</td><td>{w.gp ? `${w.gf}–${w.ga}` : DASH}</td><td>{w.gp ? signed(w.diff) : DASH}</td>
  </tr>
);

/** How the team is playing: recent windows, home and away, goals, and special teams (season to date, with its date and games). */
export function TeamPerformance({ summary }: { summary: any }) {
  const s = summary, st = s?.specialTeams;
  if (!s) return <section className="tpg-card" aria-labelledby="tpg-perf"><h2 id="tpg-perf">Performance</h2><p className="rs-none">Performance appears once the team has played.</p></section>;
  const asOf = asOfText(st?.asOf);
  return (
    <section className="tpg-card" aria-labelledby="tpg-perf">
      <h2 id="tpg-perf">Performance</h2>
      <table className="tpg-table">
        <caption>Results by window (regular season)</caption>
        <thead><tr><th scope="col">Window</th><th scope="col">W–L–OTL</th><th scope="col">Pts</th><th scope="col">GF–GA</th><th scope="col">Diff</th></tr></thead>
        <tbody>
          <Row label="Last 5" w={s.last5} /><Row label="Last 10" w={s.last10} />
          <Row label="Home" w={s.home} /><Row label="Away" w={s.away} />
        </tbody>
      </table>
      <dl className="tpg-stats">
        <div><dt>Goals for</dt><dd>{s.gf}<small>{fixed(s.gfPerGame, 2)} per game</small></dd></div>
        <div><dt>Goals against</dt><dd>{s.ga}<small>{fixed(s.gaPerGame, 2)} per game</small></dd></div>
        <div><dt>Goal difference</dt><dd>{signed(s.diff)}<small>Season to date</small></dd></div>
        <div><dt>Points %</dt><dd>{pct3(s.pointsPct)}<small>Derived</small></dd></div>
        <div><dt>Power play</dt><dd>{pctWhole(st?.pp)}</dd></div>
        <div><dt>Penalty kill</dt><dd>{pctWhole(st?.pk)}</dd></div>
        <div><dt>Shots for / game</dt><dd>{fixed(st?.shotsFor)}</dd></div>
        <div><dt>Shots against / game</dt><dd>{fixed(st?.shotsAgainst)}</dd></div>
      </dl>
      <p className="tpg-note">{st ? <>Power play, penalty kill and shots: season to date{asOf ? `, as of ${asOf}` : ""}{st.gp != null ? ` (${st.gp} GP)` : ""}.{st.stale ? " This snapshot may be out of date." : ""}</> : "Power play, penalty kill and shots are not available right now."}</p>
    </section>
  );
}
