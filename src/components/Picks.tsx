import { useMemo } from "react";
import type { Game, Team } from "../types";
import { useFeed } from "../lib/polling";
import { useChartUnit } from "../lib/chartUnit";
import { calibratedChance, explainPick, impliedProb, priceText, summarize, verdict } from "../lib/picks.mjs";
import { TeamLogo } from "./TeamLogo";

type Pick = { id: string; gameId: number; date: string; start: string; away: string; home: string; kind: "ml" | "pl"; side: "home" | "away"; team: string; line: number | null; price: number; model: number; fair: number; edge: number; result?: "win" | "loss"; units?: number; final?: string; margin?: number };
type Snapshot = { schema: number; season: number; startedAt: string | null; updatedAt: string | null; picks: Pick[] };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const label = (p: Pick, short: string) => (p.kind === "ml" ? `${short} moneyline ${priceText(p.price)}` : `${short} ${p.line! > 0 ? "+" : "−"}${Math.abs(p.line!)} ${priceText(p.price)}`);

/** The chance scale: a coin flip at 50%, the price's break-even, and where picks like this one really land. */
function ChanceScale({ chance, price }: { chance: number; price: number }) {
  const be = impliedProb(price);
  const lo = 0.3, hi = 0.8, at = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="pk-scale" role="img" aria-label={`Chance ${pct(chance)}; a coin flip is 50%, break-even at this price is ${pct(be)}`}>
      <div className="pk-track">
        <i className="pk-tick flip" style={{ left: at(0.5) }}><span>50% flip</span></i>
        <i className="pk-tick even" style={{ left: at(be) }}><span>Break-even {pct(be)}</span></i>
        <i className="pk-dot" style={{ left: at(chance) }} />
      </div>
    </div>
  );
}

function RecordChart({ series }: { series: ReturnType<typeof summarize>["series"] }) {
  const W = 600, H = 220, L = 44, R = 16, T = 16, B = 34;
  const ref = useChartUnit<SVGSVGElement>(W);
  const totals = series.map((s) => s.total), units = series.map((s) => s.units);
  const hi = Math.max(1, ...totals, ...units), lo = Math.min(-1, ...totals, ...units);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const slot = (W - L - R) / Math.max(1, series.length), x = (i: number) => L + slot * (i + 0.5);
  const path = series.map((s, i) => `${i ? "L" : "M"}${x(i)},${y(s.total)}`).join(" ");
  return (
    <svg ref={ref} className="pk-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly units won or lost and the season-to-date total across ${series.length} weeks`}>
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="pk-zero" />
      <text x={L - 6} y={y(0) + 4} textAnchor="end" className="pk-axis">0</text>
      <text x={L - 6} y={y(hi) + 4} textAnchor="end" className="pk-axis">+{hi.toFixed(0)}</text>
      <text x={L - 6} y={y(lo) + 4} textAnchor="end" className="pk-axis">{lo.toFixed(0)}</text>
      <text x={W - R} y={y(0) - 5} textAnchor="end" className="pk-axis even">break-even</text>
      {series.map((s, i) => (
        <g key={s.week}>
          <rect className={`pr-bar ${s.units >= 0 ? "up" : "down"}`} x={x(i) - Math.min(18, slot * 0.32)} width={Math.min(36, slot * 0.64)} y={Math.min(y(0), y(s.units))} height={Math.max(1, Math.abs(y(s.units) - y(0)))}>
            <title>{`Week of ${s.week}: ${s.w}–${s.l}, ${s.units >= 0 ? "+" : ""}${s.units.toFixed(1)} units`}</title>
          </rect>
          <text x={x(i)} y={H - 12} textAnchor="middle" className="pk-axis">{s.week.slice(5).replace("-", "/")}</text>
        </g>
      ))}
      {series.length > 1 && <path className="pr-line" d={path} pathLength={1} />}
      {series.map((s, i) => <circle key={s.week} className="pr-dot" cx={x(i)} cy={y(s.total)} r={3.5}><title>{`Season to date after week of ${s.week}: ${s.total >= 0 ? "+" : ""}${s.total.toFixed(1)} units`}</title></circle>)}
    </svg>
  );
}

/** Moneyline and puck-line picks: this week's, the record so far, and each graded pick with why it won or missed. Not betting advice. */
export function Picks({ season, games, teams }: { season: number; games: Game[]; teams: Team[] }) {
  const { data, error } = useFeed<Snapshot>(`/api/picks/${season}`, 300_000);
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const short = (id: string) => teams.find((t) => t.id === id)?.short ?? id;
  const picks = data?.picks ?? [];
  const graded = useMemo(() => picks.filter((p) => p.result), [picks]);
  const open = useMemo(() => picks.filter((p) => !p.result).sort((a, b) => a.start.localeCompare(b.start)), [picks]);
  const summary = useMemo(() => summarize(picks), [picks]);
  const done = useMemo(() => [...graded].sort((a, b) => b.start.localeCompare(a.start)), [graded]);

  if (!data && !error) {
    return <section className="picks" aria-label="Picks"><div className="skel card" role="status" aria-label="Loading picks">{[0, 1, 2].map((i) => <div className="skel-item" key={i}><span className="skel-line w60" /><span className="skel-line w90" /><span className="skel-line w40" /></div>)}</div></section>;
  }
  if (!data) return <section className="picks" aria-label="Picks"><p className="empty">Picks are unavailable right now. Try again in a moment.</p></section>;

  return (
    <section className="picks" aria-label="Picks">
      <header className="pk-head">
        <h1>Picks</h1>
        <p>Moneyline and puck-line picks from the model, set against the market price (DraftKings, via the NHL). Information only, not betting advice.</p>
      </header>
      <p className="pk-honest" data-testid="pk-honest">{summary.honest}</p>

      <h2 className="pk-h">This week’s picks <span className="sb-count">{open.length}</span></h2>
      {open.length === 0 ? (
        <p className="pk-empty">{data.startedAt ? "No open picks right now. Picks are logged before puck drop when the odds are posted and the model sees an edge of at least 3 points." : "No picks have been logged yet. They are logged before puck drop when the odds are posted; the record starts with the first one."}</p>
      ) : (
        <ul className="pk-list">
          {open.map((p) => {
            const cal = calibratedChance(graded as never, p as never), v = verdict(cal.chance, p.price);
            return (
              <li key={p.id} className="pk-card" data-testid="pick">
                <div className="pk-top"><span>{when(p.start)}</span><b className={`pk-verdict ${v.startsWith("No") ? "none" : v.startsWith("Thin") ? "thin" : "good"}`}>{v}</b></div>
                <div className="pk-match"><TeamLogo id={p.away} size={28} /><span>{p.away} at {p.home}</span><TeamLogo id={p.home} size={28} /></div>
                <p className="pk-pick"><TeamLogo id={p.team} size={22} /> <b>{label(p, short(p.team))}</b></p>
                <ChanceScale chance={cal.chance} price={p.price} />
                <p className="pk-why">Chance {pct(cal.chance)} after history. The model says {pct(p.model)} and the market {pct(p.fair)}; {cal.n} graded {cal.n === 1 ? "pick" : "picks"} so far in this edge band ({cal.bucket}).</p>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="pk-h">Record</h2>
      {summary.n === 0 ? <p className="pk-empty">Nothing graded yet{data.startedAt ? ` (picks have been logged since ${new Date(data.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : ""}.</p> : (
        <>
          <dl className="pk-stats">
            <div><dt>Record</dt><dd>{summary.wins}–{summary.losses}</dd></div>
            <div><dt>Units</dt><dd>{summary.units >= 0 ? "+" : "−"}{Math.abs(summary.units).toFixed(1)}</dd></div>
            <div><dt>Per pick</dt><dd>{summary.roi >= 0 ? "+" : "−"}{Math.abs(summary.roi).toFixed(2)}</dd></div>
            <div><dt>Hit rate</dt><dd>{pct(summary.hitRate ?? 0)}</dd></div>
            <div><dt>Break-even</dt><dd>{pct(summary.breakEven)}</dd></div>
          </dl>
          <RecordChart series={summary.series} />
          <p className="pk-note">Bars: units won or lost each week (1 unit on every pick, at the price logged). Line: season to date. The zero line is break-even.</p>
        </>
      )}

      <h2 className="pk-h">Graded picks <span className="sb-count">{done.length}</span></h2>
      {done.length === 0 ? <p className="pk-empty">Picks appear here after their games finish, each with why it won or missed.</p> : (
        <ul className="pk-list">
          {done.map((p) => {
            const g = byId.get(p.gameId);
            return (
              <li key={p.id} className={`pk-card graded ${p.result}`} data-testid="graded-pick">
                <div className="pk-top"><span>{when(p.start)} · final {p.final}</span><b className={`pk-result ${p.result}`}>{p.result === "win" ? `Won +${(p.units ?? 0).toFixed(2)}` : "Missed −1"}</b></div>
                <p className="pk-pick"><TeamLogo id={p.team} size={22} /> <b>{label(p, short(p.team))}</b> <span>{p.away} at {p.home}</span></p>
                {g && <p className="pk-why">{explainPick(p as never, { result: p.result!, margin: p.margin ?? 0, units: p.units, final: p.final } as never, g as never, { away: short(p.away), home: short(p.home) })}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
