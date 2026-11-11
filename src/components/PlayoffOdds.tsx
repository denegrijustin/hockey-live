import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMyTeam } from "../hooks/useMyTeam";
import { simulatePlayoffs } from "../lib/playoff-sim.mjs";
import { TIERS } from "../lib/playoff-tracker.mjs";
import type { Game, Team } from "../types";
import "./playoff-odds.css";
import { TeamLogo } from "./TeamLogo";
import { TeamLink } from "./TeamProfile";
import { PageHeader } from "./PageHeader";
import { Icon } from "./icons";

const SIMS = 20000;
type TeamOdds = { pPlayoffs: number; pDivision: number[]; pWildCard: number[]; pConferenceFirst: number; pPresidents: number; expPts: number };
type Metric = "make" | "div" | "conf" | "pres";
const METRICS: { id: Metric; label: string; short: string; get: (x: TeamOdds) => number; blurb: string }[] = [
  { id: "make", label: "Make the playoffs", short: "Make it", get: (x) => x.pPlayoffs, blurb: "Division spot or wild card: eight teams a conference get in." },
  { id: "div", label: "Win the division", short: "Division", get: (x) => x.pDivision[0], blurb: "Finish first in the division." },
  { id: "conf", label: "Top of the conference", short: "#1 seed", get: (x) => x.pConferenceFirst, blurb: "Finish first in the whole conference." },
  { id: "pres", label: "Presidents’ Trophy", short: "Trophy", get: (x) => x.pPresidents, blurb: "Finish first in the league." },
];
const CONFS = [["all", "Both"], ["E", "East"], ["W", "West"]] as const;
const DETAIL: [string, (x: TeamOdds) => number, string][] = [
  ["Division 1st", (x) => x.pDivision[0], "div"], ["Division 2nd", (x) => x.pDivision[1], "div"], ["Division 3rd", (x) => x.pDivision[2], "div"],
  ["Wild card 1", (x) => x.pWildCard[0], "wc"], ["Wild card 2", (x) => x.pWildCard[1], "wc"], ["Make the playoffs", (x) => x.pPlayoffs, "make"],
  ["#1 in conference", (x) => x.pConferenceFirst, "conf"], ["Presidents’ Trophy", (x) => x.pPresidents, "pres"],
];
const fmt = (p: number) => (p >= 99.5 ? ">99%" : p < 0.5 ? "<1%" : `${Math.round(p)}%`);
const tierOf = (p: number) => (TIERS.find((t) => p >= t.min) ?? TIERS[TIERS.length - 1]).key;
const clamp = (p: number) => Math.max(0, Math.min(100, p));

/** Rows slide to their new place when the ranking changes (Web Animations, skipped for reduced motion). */
function useFlip(listRef: React.RefObject<HTMLElement | null>, key: string) {
  const prev = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    list.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const top = el.getBoundingClientRect().top;
      next.set(el.dataset.flip!, top);
      const was = prev.current.get(el.dataset.flip!);
      if (!reduce && was != null && Math.abs(was - top) > 1 && el.animate) el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" });
    });
    prev.current = next;
  }, [listRef, key]);
}

export function PlayoffOdds({ teams, games, table, baseline, season }: { teams: Team[]; games: Game[]; table: Record<string, any>; baseline?: Record<string, any>; season: number }) {
  const [result, setResult] = useState<any>(null);
  const { myTeam } = useMyTeam();
  const mine = teams.find((t) => t.id === myTeam);
  // My team: open on its conference with its row expanded; "Both" is one tap away.
  const [conf, setConf] = useState<"all" | "E" | "W">((mine?.conference as "E" | "W" | undefined) ?? "all");
  const [metric, setMetric] = useState<Metric>("make");
  const [open, setOpen] = useState<string | null>(mine?.id ?? null);
  const sig = useMemo(() => ({ teams, games, table, baseline }), [teams, games, table, baseline]);
  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled) setResult(simulatePlayoffs({ ...sig, baseline: sig.baseline ?? {}, sims: SIMS, seed: 1 })); };
    setResult(null);
    const w = window as any;
    const handle = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 500 }) : setTimeout(run, 30);
    return () => { cancelled = true; w.cancelIdleCallback ? w.cancelIdleCallback(handle) : clearTimeout(handle); };
  }, [sig]);

  const s = String(season);
  const seasonLabel = s.length === 8 ? `${s.slice(0, 4)}–${s.slice(6)}` : s;
  const m = METRICS.find((x) => x.id === metric)!;
  const shown = conf === "all" ? (["E", "W"] as const) : ([conf] as const);
  const listRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (!result || !myTeam || scrolled.current) return;
    const row = listRef.current?.querySelector<HTMLElement>(".po-row.mine");
    if (row) { scrolled.current = true; row.scrollIntoView({ block: "center", behavior: "auto" }); }
  }, [result, myTeam]);
  useFlip(listRef, `${metric}|${conf}`);

  return (
    <>
      <PageHeader title="Playoff odds" eyebrow="PLAYOFF PICTURE" />
      <section className="panel po-panel" aria-label="Playoff odds">
        <p className="po-note" role={result ? undefined : "status"}>
          {result
            ? result.complete
              ? `The ${seasonLabel} regular season is complete, so these are final results, not forecasts.`
              : `${result.sims.toLocaleString()} simulated seasons · ${result.remainingGames.toLocaleString()} games left.`
            : "Running simulations…"}
          {" "}An uncalibrated model of goals scored and allowed, not official odds.
        </p>
        <div className="po-controls">
          <div className="inj-seg po-seg" role="group" aria-label="Conference">
            {CONFS.map(([id, label]) => <button key={id} type="button" aria-pressed={conf === id} onClick={() => setConf(id)}>{label}</button>)}
          </div>
          <div className="inj-seg po-seg" role="group" aria-label="Rank teams by">
            {METRICS.map((x) => <button key={x.id} type="button" aria-pressed={metric === x.id} onClick={() => setMetric(x.id)}><span className="po-long">{x.label}</span><span className="po-short">{x.short}</span></button>)}
          </div>
        </div>
        <p className="po-blurb" aria-live="polite">{m.blurb} Tap a team for every number.</p>
        {!result && <div className="po-skel" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>}
        {result && (
          <div className={`po-confs${shown.length === 1 ? " one" : ""}`} ref={listRef}>
            {shown.map((c) => {
              const rows = teams.filter((t) => t.conference === c && result.teams[t.id]).sort((a, b) => {
                const A = result.teams[a.id] as TeamOdds, B = result.teams[b.id] as TeamOdds;
                return m.get(B) - m.get(A) || B.pPlayoffs - A.pPlayoffs || (table[b.id]?.pts ?? 0) - (table[a.id]?.pts ?? 0) || a.name.localeCompare(b.name);
              });
              const inCount = rows.filter((t) => result.teams[t.id].pPlayoffs >= 99.95).length;
              return (
                <section className="po-conf" key={c} data-testid={`po-grid-${c}`} aria-label={`${c === "E" ? "Eastern" : "Western"} Conference playoff probabilities`}>
                  <header>
                    <img className="po-conf-logo" src={`/logos/league/${c === "E" ? "east" : "west"}.webp`} alt={c === "E" ? "Eastern Conference" : "Western Conference"} width="64" height="47" />
                    <span><b>{m.label}</b><small>{inCount} of 8 spots clinched</small></span>
                  </header>
                  <ol className="po-list">
                    {rows.map((t, i) => {
                      const x = result.teams[t.id] as TeamOdds;
                      const rec = table[t.id] ?? { w: 0, l: 0, ot: 0, pts: 0 };
                      const p = clamp(m.get(x));
                      const id = `po-${t.id}`;
                      const isOpen = open === t.id;
                      const tier = metric === "make" ? tierOf(x.pPlayoffs) : "metric";
                      const divP = clamp(x.pDivision[0] + x.pDivision[1] + x.pDivision[2]);
                      return (
                        <li key={t.id} data-flip={`${c}-${t.id}`} className={`po-row ${tier}${isOpen ? " open" : ""}${t.id === myTeam ? " mine" : ""}`} data-team={t.id} style={{ ["--team" as any]: t.cardColor ?? t.color }}>
                          {metric === "make" && i === 8 && <div className="po-cut" aria-hidden="true"><span>Playoff line</span></div>}
                          <button type="button" className="po-btn" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(isOpen ? null : t.id)}>
                            <span className="po-rank">{i + 1}</span>
                            <TeamLogo id={t.id} size={32} />
                            <span className="po-who"><b>{t.short}</b><small>{rec.w}–{rec.l}–{rec.ot} · {rec.pts} pts</small></span>
                            <span className="po-meter" role="img" aria-label={`${t.name}: ${m.label} ${p.toFixed(1)}%`}>
                              {metric === "make"
                                ? <><i className="po-fill po-div" style={{ width: `${divP}%` }} /><i className="po-fill po-wc" style={{ left: `${divP}%`, width: `${Math.max(0, p - divP)}%` }} /></>
                                : <i className="po-fill" style={{ width: `${p}%` }} />}
                            </span>
                            <span className="po-pct">{fmt(p)}</span>
                            <span className="po-chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
                          </button>
                          <div className="po-more" id={id} role="region" aria-label={`${t.name} odds in detail`} inert={!isOpen}>
                            <div className="po-more-in">
                              <dl className="po-stats">
                                {DETAIL.map(([label, get, kind]) => (
                                  <div key={label} className={`po-stat ${kind}`}>
                                    <dt>{label}</dt><dd>{fmt(get(x))}</dd>
                                    <span className="po-bar"><i style={{ width: `${clamp(get(x))}%` }} /></span>
                                  </div>
                                ))}
                              </dl>
                              <p className="po-foot">Projected finish <b>{Math.round(x.expPts)} pts</b> · <TeamLink id={t.id}>Open {t.short} page</TeamLink></p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        )}
        {result && (
          <details className="po-how">
            <summary>How these are worked out</summary>
            <p>Each simulated season plays out the remaining games from team scoring rates. Ties in points are broken by regulation wins and then a coin flip; the NHL’s full tiebreak procedure is not implemented. “&lt;1%” means under half a percent. In “Make the playoffs” the bar is green for a division spot and amber for the wild card.</p>
          </details>
        )}
      </section>
    </>
  );
}
