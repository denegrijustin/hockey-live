import { useEffect, useMemo, useState } from "react";
import { SIT_LABEL, goalieGameLog, rolling, share, teamGameLog } from "../../../lib/nhlplus.mjs";
import { callouts, lastGames } from "../../../lib/nhlplus-view.mjs";
import { useMoneyPuckStatus } from "../../../lib/moneypuck-client";
import type { HistoryDay } from "../../../lib/moneypuck-types";
import type { Ctx } from "../context";
import { Derived, Loading, Logo, Panel, SitFilter, TeamSelect, Unavailable, teamName } from "../common";
import { GameChart } from "../charts/GameChart";
import { LineChart } from "../charts/LineChart";
import { fmt, fmtPct, fmtSigned } from "../shared/format";
import { MetricTip } from "../shared/MetricTip";

const MINT = "#7be1c6", AMBER = "#e9c67d", BLUE = "#8fb8e8";

export function TrendsView({ ctx }: { ctx: Ctx }) {
  const { s, set, games, season } = ctx;
  const team = s.tTeam, sitLabel = SIT_LABEL[s.sit];
  const status = useMoneyPuckStatus(season);
  const log = useMemo(() => (games.data ? teamGameLog(games.data, team, s.sit) : []), [games.data, team, s.sit]);
  const r5 = useMemo(() => rolling(log, 5, { partial: true }), [log]);
  const r10 = useMemo(() => rolling(log, 10, { partial: true }), [log]);
  const xLabels = log.map((_: any, i: number) => String(i + 1));
  const tipTitles = log.map((g: any, i: number) => `Game ${i + 1}: ${g.home ? "vs" : "at"} ${g.opp}${g.overtime ? " (OT)" : ""}`);
  const gameBars = (f: "xGF" | "xGA", a: "GF" | "GA") => log.map((g: any, i: number) => ({ id: g.id, label: `${g.home ? "" : "@"}${g.opp}`, title: tipTitles[i], expected: g[f] ?? null, actual: g[a] ?? null }));
  // Goalie performance for this team, kept apart from team defense: every goalie who played for the team, game by game.
  const goalieIds = useMemo(() => {
    const seen = new Map<number, string>();
    for (const g of Object.values(games.data?.games ?? {})) for (const k of g.goalies ?? []) if (k.team === team) seen.set(k.id, k.name);
    return [...seen.entries()];
  }, [games.data, team]);
  const goalieLogs = useMemo(() => goalieIds.map(([id, name]) => ({ id, name, log: goalieGameLog(games.data, id) as { id: number; gsax: number | null }[] })), [goalieIds, games.data]);
  const gsaxBars = useMemo(() => log.map((g: any, i: number) => {
    const game = games.data?.games[String(g.id)];
    const mine = (game?.goalies ?? []).filter((k) => k.team === team);
    return { id: g.id, label: `${g.home ? "" : "@"}${g.opp}`, title: tipTitles[i], actual: mine.length ? mine.reduce((t, k) => t + (k.xGA - k.GA), 0) : null };
  }), [log, games.data, team]); // eslint-disable-line react-hooks/exhaustive-deps
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const dates = status?.historyDates ?? [];
  useEffect(() => {
    if (dates.length < 2) { setHistory([]); return; }
    let live = true;
    Promise.all(dates.slice(-30).map((d) => fetch(`/data/moneypuck/${season}/history/${d}.json`).then((r) => (r.ok ? (r.json() as Promise<HistoryDay>) : null)).catch(() => null)))
      .then((days) => { if (live) setHistory(days.filter((d): d is HistoryDay => !!d?.teams)); });
    return () => { live = false; };
  }, [dates.join(","), season]); // eslint-disable-line react-hooks/exhaustive-deps
  if (games.state === "loading") return <Loading what="game-by-game data" />;
  if (!games.data) return <><div className="np-filters"><TeamSelect label="Team" value={team} onChange={(tTeam) => set({ tTeam })} /></div><Unavailable what="Game-by-game data" onRetry={games.retry} /></>;
  const w5 = lastGames(log, 5), w10 = lastGames(log, 10);
  const roll = (rows: any[], pick: (r: any) => number | null, n: number) => log.map((_: any, i: number) => (rows[i] ? pick(rows[i]) : null)).map((v: number | null) => v) as (number | null)[];
  const hollow = (n: number) => log.map((_: any, i: number) => i + 1 < n);
  return (
    <>
      <div className="np-filters">
        <TeamSelect label="Team" value={team} onChange={(tTeam) => set({ tTeam })} />
        <SitFilter sit={s.sit} onChange={(sit) => set({ sit })} />
        <span className="np-count" role="status"><Logo team={team} size={18} /> {teamName(team)} · {log.length} game{log.length === 1 ? "" : "s"}</span>
      </div>
      {!log.length ? <div className="np-empty" role="status">{teamName(team)} has no games in the data yet.</div> : (
        <>
          <Panel id="np-tr-callouts" title={`Results against chance quality · ${sitLabel}`} sub={<>Goals minus expected goals over the most recent games. <Derived /> Derived from MoneyPuck shot-level xG; says nothing about what comes next.</>}>
            <ul className="np-callouts">
              {callouts(w5).map((t) => <li key={`5${t}`}>{t}</li>)}
              {log.length > 5 && callouts(w10).map((t) => <li key={`10${t}`}>{t}</li>)}
            </ul>
          </Panel>
          <div className="np-grid2">
            <Panel id="np-tr-for" title={`Goals scored vs. expected goals · ${sitLabel}`} sub="By game, oldest to newest. Bars are expected goals for; diamonds are goals scored.">
              <GameChart games={gameBars("xGF", "GF")} mode="expected-actual" color={MINT} yLabel="Goals" fmtValue={(v) => fmt(v, v % 1 ? 1 : 0)} ariaLabel={`${teamName(team)} goals scored versus expected goals by game, ${sitLabel}`} expectedLabel="Expected goals for" actualLabel="Goals for" />
            </Panel>
            <Panel id="np-tr-against" title={`Goals allowed vs. expected goals against · ${sitLabel}`} sub="Bars are expected goals against (team defense); diamonds are goals allowed.">
              <GameChart games={gameBars("xGA", "GA")} mode="expected-actual" color={AMBER} yLabel="Goals" fmtValue={(v) => fmt(v, v % 1 ? 1 : 0)} ariaLabel={`${teamName(team)} goals allowed versus expected goals against by game, ${sitLabel}`} expectedLabel="Expected goals against" actualLabel="Goals against" />
            </Panel>
          </div>
          <div className="np-grid2">
            <Panel id="np-tr-xgpct" title={`Rolling xG share · ${sitLabel}`} sub={<><MetricTip id="rolling">Rolling</MetricTip> 5- and 10-game totals, share taken from the totals. Hollow points: window not yet full. <Derived /></>}>
              <LineChart ariaLabel={`${teamName(team)} rolling expected-goals share, ${sitLabel}`} xLabels={xLabels} tipTitles={tipTitles} xTitle="Game number" yLabel="xG share" yFmt={(v) => fmtPct(v, 0)}
                refs={[{ y: 0.5, label: "50%" }]} includeY={[0.4, 0.6]}
                series={[{ key: "r5", label: "5 games", color: MINT, values: roll(r5, (r) => r.xGPct, 5), hollow: hollow(5) }, { key: "r10", label: "10 games", color: BLUE, dash: "5 4", values: roll(r10, (r) => r.xGPct, 10), hollow: hollow(10) }]} />
            </Panel>
            <Panel id="np-tr-gvx" title={`Rolling goals minus xG, 5 games · ${sitLabel}`} sub="Scored: goals for minus xG for. Allowed: goals against minus xG against. Hollow points: window not yet full.">
              <LineChart ariaLabel={`${teamName(team)} rolling goals minus expected goals, 5 games, ${sitLabel}`} xLabels={xLabels} tipTitles={tipTitles} xTitle="Game number" yLabel="Goals minus xG" yFmt={(v) => fmtSigned(v, 1)}
                refs={[{ y: 0, label: "0" }]} includeY={[-1, 1]}
                series={[{ key: "f", label: "Scored (goals for − xGF)", color: MINT, values: roll(r5, (r) => r.goalsVsXFor, 5), hollow: hollow(5) }, { key: "a", label: "Allowed (goals against − xGA)", color: AMBER, dash: "5 4", values: roll(r5, (r) => r.goalsVsXAgainst, 5), hollow: hollow(5) }]} />
            </Panel>
          </div>
          <Panel id="np-tr-goalie" title="Goaltending, apart from team defense · all situations" sub={<>Team defense is the expected goals against above. Goaltending is <MetricTip id="gsax">goals saved above expected</MetricTip> by the goalies who played, per game. <Derived /></>}>
            <GameChart games={gsaxBars} mode="single" color={MINT} yLabel="GSAx per game" fmtValue={(v) => fmtSigned(v, 1)} ariaLabel={`${teamName(team)} goalies, goals saved above expected by game`} />
            <ul className="np-goalie-list">
              {goalieLogs.map((g) => {
                const total = g.log.reduce((t, x) => t + (x.gsax ?? 0), 0);
                return <li key={g.id}><b>{g.name}</b> {g.log.length} game{g.log.length === 1 ? "" : "s"} · GSAx {fmtSigned(total)}</li>;
              })}
            </ul>
          </Panel>
        </>
      )}
      {dates.length >= 2 && history.length >= 2 && (
        <Panel id="np-tr-history" title={`xG share by daily snapshot · ${sitLabel}`} sub="Season-to-date xG share as saved after each MoneyPuck update. Derived.">
          {(() => {
            const pts = history.map((d) => { const t = d.teams[team]?.[s.sit]; return { date: d.date, v: t ? share(t.xGF, t.xGA) : null }; });
            return <LineChart ariaLabel={`${teamName(team)} xG share by snapshot date`} xLabels={pts.map((p) => p.date.slice(5))} tipTitles={pts.map((p) => p.date)} xTitle="Snapshot date" yLabel="xG share" yFmt={(v) => fmtPct(v, 0)} refs={[{ y: 0.5, label: "50%" }]} includeY={[0.45, 0.55]} series={[{ key: "h", label: "Season to date", color: MINT, values: pts.map((p) => p.v) }]} />;
          })()}
        </Panel>
      )}
      {dates.length === 1 && <p className="np-note">Daily snapshots started {dates[0]}.</p>}
    </>
  );
}
