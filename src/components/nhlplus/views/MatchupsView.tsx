import { useEffect, useMemo } from "react";
import { finished } from "../../../lib/model.mjs";
import { isLive } from "../../../lib/game-data.mjs";
import { SIT_LABEL, goalieMetrics, matchupPairs, teamGameLog, teamMetrics } from "../../../lib/nhlplus.mjs";
import { lastGames, upcomingGames } from "../../../lib/nhlplus-view.mjs";
import type { Ctx } from "../context";
import { Derived, Face, Loading, Logo, Panel, SitFilter, TeamSelect, Unavailable, teamName } from "../common";
import { CompareRow } from "../shared/CompareRow";
import type { CompareSide } from "../shared/CompareRow";
import { useStarters } from "../shared/useStarters";
import type { StarterInfo } from "../shared/useStarters";
import { fmt, fmtInt, fmtMin, fmtPct, fmtSigned, fmtSv } from "../shared/format";
import { MetricTip } from "../shared/MetricTip";
import type { Goalie, Sit } from "../../../lib/moneypuck-types";
import type { Game } from "../../../types";

const sideOf = (team: string, value: number | null, text: string, sub?: string): CompareSide => ({ team, value, text, sub });

export function MatchupsView({ ctx }: { ctx: Ctx }) {
  const { s, set, summary, appGames } = ctx;
  const upcoming = useMemo(() => upcomingGames(appGames, (g: Game) => finished(g) || isLive(g), 10), [appGames]);
  const first = upcoming[0];
  const a = s.mA ?? first?.away ?? "EDM", b = s.mB ?? first?.home ?? "CHI";
  const game = useMemo(() => {
    const byId = s.mGame != null ? appGames.find((g) => g.id === s.mGame) : undefined;
    if (byId && ((byId.away === a && byId.home === b) || (byId.away === b && byId.home === a))) return byId;
    return upcoming.find((g) => (g.away === a && g.home === b) || (g.away === b && g.home === a)) ?? null;
  }, [s.mGame, appGames, upcoming, a, b]);
  // Keep the explicit pair in state once the viewer touches a control, so it survives switching views.
  useEffect(() => { if (s.mA == null && s.mB == null && first) set({ mA: first.away, mB: first.home, mGame: first.id }); }, [first?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (patch: { mA?: string; mB?: string }) => set({ ...patch, mGame: null });
  if (summary.state === "loading") return <Loading what="team data" />;
  if (!summary.data) return <Unavailable what="Team data" onRetry={summary.retry} />;
  const data = summary.data;
  const m = (t: string, sit: Sit) => teamMetrics(data.teams[t]?.[sit]);
  const pairs = matchupPairs(data, a, b);
  const profileSit = s.sit;
  const pa = m(a, profileSit), pb = m(b, profileSit);
  const sitLabel = SIT_LABEL[profileSit];
  const row = (label: string, tip: string | undefined, key: string, f: (v: number | null) => string, o: { higherIsBetter?: boolean; pct?: boolean; unit?: string } = {}) => (
    <CompareRow key={key} label={label} tip={tip} unit={o.unit} higherIsBetter={o.higherIsBetter ?? true} diffPct={o.pct} compact
      left={sideOf(a, (pa as any)?.[key] ?? null, f((pa as any)?.[key] ?? null))} right={sideOf(b, (pb as any)?.[key] ?? null, f((pb as any)?.[key] ?? null))} />
  );
  return (
    <>
      <div className="np-filters">
        <TeamSelect label="Team 1" value={a} onChange={(v) => pick({ mA: v })} />
        <button type="button" className="np-swap" aria-label="Swap teams" onClick={() => set({ mA: b, mB: a, mGame: null })}>⇄</button>
        <TeamSelect label="Team 2" value={b} onChange={(v) => pick({ mB: v })} />
        {upcoming.length > 0 && (
          <label className="np-field"><span className="np-field-label">Upcoming game</span>
            <select aria-label="Upcoming game" value={game?.id ?? ""} onChange={(e) => { const g = upcoming.find((x) => x.id === +e.target.value); if (g) set({ mA: g.away, mB: g.home, mGame: g.id }); }}>
              <option value="">Choose a game</option>
              {upcoming.map((g) => <option key={g.id} value={g.id}>{g.away} at {g.home} · {g.date}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="np-vs" aria-label={`${teamName(a)} versus ${teamName(b)}`}>
        <span><Logo team={a} size={34} /><b>{teamName(a)}</b></span><i>vs</i><span><Logo team={b} size={34} /><b>{teamName(b)}</b></span>
        {game && <small>{game.away} at {game.home} · {game.date}</small>}
      </div>
      {a === b && <div className="np-empty" role="status">Choose two different teams.</div>}
      <Panel id="np-mu-chances" title="Chances created vs. allowed" sub={<>Expected goals per 60 minutes of each situation: what one team creates beside what the other allows. <Derived /></>}>
        <div className="np-grid2 np-grid2-flush">
          {[[a, b], [b, a]].map(([off, def]) => (
            <div key={off}>
              <h4 className="np-sub"><Logo team={off} size={18} />{off} attack vs. {def} defense</h4>
              {pairs.filter((p) => p.offenseTeam === off).map((p) => {
                const defSit = p.sit === "5on4" ? "4on5" : p.sit;
                const mo = m(off, p.sit as Sit), md = m(def, defSit as Sit);
                return (
                  <CompareRow key={p.id} label={p.label} unit={p.unit} tip={p.sit === "5on4" ? "pp" : "xGF60"}
                    left={sideOf(`${off} create`, p.offense, fmt(p.offense), `${off} ${SIT_LABEL[p.sit as keyof typeof SIT_LABEL]} · ${fmtMin(mo?.toi)} min`)}
                    right={sideOf(`${def} allow`, p.defense, fmt(p.defense), `${def} ${SIT_LABEL[defSit as keyof typeof SIT_LABEL]} · ${fmtMin(md?.toi)} min`)} />
                );
              })}
            </div>
          ))}
        </div>
      </Panel>
      <Panel id="np-mu-profile" title={`Team profile · ${sitLabel}`} sub={<>Rates use {sitLabel} time. <Derived /></>} actions={<SitFilter sit={s.sit} onChange={(sit) => set({ sit })} />}>
        <div className="np-cmp-head"><span><Logo team={a} size={18} />{a} · {fmtInt(pa?.gp)} GP · {fmtMin(pa?.toi)} min</span><span>{b} · {fmtInt(pb?.gp)} GP · {fmtMin(pb?.toi)} min<Logo team={b} size={18} /></span></div>
        {row("xG share", "xGPct", "xGPct", (v) => fmtPct(v), { pct: true })}
        {row("xG for", "xGF60", "xGF60", (v) => fmt(v), { unit: "per 60" })}
        {row("xG against", "xGA60", "xGA60", (v) => fmt(v), { unit: "per 60", higherIsBetter: false })}
        {row("Goals for", "GF", "GF60", (v) => fmt(v), { unit: "per 60" })}
        {row("Goals against", "GA", "GA60", (v) => fmt(v), { unit: "per 60", higherIsBetter: false })}
        {row("Shooting %", "shPct", "shPct", (v) => fmtPct(v), { pct: true })}
        {row("Save %", "svPct", "svPct", (v) => fmtPct(v), { pct: true })}
        {row("Shot-attempt share", "CFPct", "CFPct", (v) => fmtPct(v), { pct: true })}
      </Panel>
      <Goaltending ctx={ctx} a={a} b={b} game={game} />
      <Recent ctx={ctx} a={a} b={b} />
    </>
  );
}

function goalieRow(goalies: Goalie[], s: StarterInfo | undefined) {
  if (!s?.id) return null;
  return goalies.find((g) => g.id === s.id) ?? null;
}

function Goaltending({ ctx, a, b, game }: { ctx: Ctx; a: string; b: string; game: Game | null }) {
  const { season, summary } = ctx;
  const teams = useMemo(() => [a, b], [a, b]);
  const starters = useStarters(game, teams, season);
  const goalies = summary.data?.goalies ?? [];
  const info = (t: string) => {
    const st = starters[t];
    const g = goalieRow(goalies, st);
    return { st, g, m: g ? goalieMetrics(g.sit.all) : null };
  };
  const A = info(a), B = info(b);
  const side = (t: string, i: ReturnType<typeof info>, key: string, f: (v: number | null) => string): CompareSide => {
    const v = (i.m as any)?.[key] ?? null;
    return sideOf(t, v, f(v), key === "gsax" ? `${fmtInt(i.m?.gp)} GP · ${fmtMin(i.m?.toi)} min` : undefined);
  };
  const head = (t: string, i: ReturnType<typeof info>) => (
    <div className="np-starter">
      {i.st?.id ? <Face id={i.st.id} team={t} name={i.st.name ?? ""} season={season} size={40} /> : <Logo team={t} size={30} />}
      <div>
        <b>{i.st?.name ?? "Starter unknown"}</b>
        <small>{t} · <span className={`np-chip np-${i.st?.status ?? "unknown"}`}>{i.st?.status === "confirmed" ? "Confirmed" : i.st?.status === "projected" ? "Projected" : "Unknown"}</span>{i.st?.status === "projected" && i.st.gamesStarted != null ? ` · ${i.st.gamesStarted} starts` : ""}</small>
        {i.st?.id && !i.g && <small>No MoneyPuck goalie row yet</small>}
      </div>
    </div>
  );
  return (
    <Panel id="np-mu-goalies" title="Goaltending · all situations" sub={<><MetricTip id="starter">Starter</MetricTip> status is shown for each side; goalie numbers come from MoneyPuck season rows joined by NHL player id. <Derived /></>}>
      <div className="np-starters-2">{head(a, A)}{head(b, B)}</div>
      <CompareRow compact label="Goals saved above expected" tip="gsax" unit="total" diffDigits={2} left={side(a, A, "gsax", (v) => fmtSigned(v))} right={side(b, B, "gsax", (v) => fmtSigned(v))} />
      <CompareRow compact label="Goals saved above expected" tip="gsaxPer60" unit="per 60" left={side(a, A, "gsaxPer60", (v) => fmtSigned(v))} right={side(b, B, "gsaxPer60", (v) => fmtSigned(v))} />
      <CompareRow compact label="Save %" tip="svPct" diffDigits={3} left={side(a, A, "svPct", fmtSv)} right={side(b, B, "svPct", fmtSv)} />
      <CompareRow compact label="Expected save %" tip="xSvPct" diffDigits={3} left={side(a, A, "xSvPct", fmtSv)} right={side(b, B, "xSvPct", fmtSv)} />
      <p className="np-note">Totals grow with workload; the per-60 row does not. Neither is a forecast of this game.</p>
    </Panel>
  );
}

function Recent({ ctx, a, b }: { ctx: Ctx; a: string; b: string }) {
  const { s, set, games } = ctx;
  const n = s.mWindow;
  const logs = useMemo(() => (games.data ? [teamGameLog(games.data, a, "all"), teamGameLog(games.data, b, "all")] : null), [games.data, a, b]);
  const title = `Recent games · last ${n} · all situations`;
  const seg = (
    <div className="segmented np-seg" role="group" aria-label="Recent games window">
      {([5, 10] as const).map((k) => <button key={k} type="button" aria-pressed={n === k} onClick={() => set({ mWindow: k })}>Last {k}</button>)}
    </div>
  );
  if (games.state === "loading") return <Panel id="np-mu-recent" title={title} actions={seg}><Loading what="game data" /></Panel>;
  if (!logs) return <Panel id="np-mu-recent" title={title} actions={seg}><Unavailable what="Game-by-game data" onRetry={games.retry} /></Panel>;
  const wa = lastGames(logs[0], n), wb = lastGames(logs[1], n);
  const per = (w: ReturnType<typeof lastGames>, k: "xGF" | "xGA" | "GF" | "GA") => (w.games ? w[k] / w.games : null);
  const R = (label: string, f: (w: ReturnType<typeof lastGames>) => number | null, fm: (v: number | null) => string, o: { higherIsBetter?: boolean; pct?: boolean; unit?: string } = {}) => (
    <CompareRow compact label={label} unit={o.unit} higherIsBetter={o.higherIsBetter ?? true} diffPct={o.pct} left={sideOf(a, f(wa), fm(f(wa)))} right={sideOf(b, f(wb), fm(f(wb)))} />
  );
  return (
    <Panel id="np-mu-recent" title={title} actions={seg}
      sub={<>Derived from MoneyPuck shot-level expected goals for completed games ({a}: {wa.games} played, {b}: {wb.games} played). <Derived /></>}>
      {!wa.games && !wb.games ? <div className="np-empty">No completed games in the data yet.</div> : (
        <>
          {R("xG share", (w) => w.xGPct, (v) => fmtPct(v), { pct: true })}
          {R("xG for", (w) => per(w, "xGF"), (v) => fmt(v), { unit: "per game" })}
          {R("xG against", (w) => per(w, "xGA"), (v) => fmt(v), { unit: "per game", higherIsBetter: false })}
          {R("Goals for", (w) => per(w, "GF"), (v) => fmt(v), { unit: "per game" })}
          {R("Goals against", (w) => per(w, "GA"), (v) => fmt(v), { unit: "per game", higherIsBetter: false })}
          {R("Goals scored minus xG", (w) => (w.games ? w.goalsVsXFor : null), (v) => fmtSigned(v, 1), { unit: "total" })}
        </>
      )}
    </Panel>
  );
}
