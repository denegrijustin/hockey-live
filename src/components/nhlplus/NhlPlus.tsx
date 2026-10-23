import { useCallback, useEffect, useRef, useState } from "react";
import { useSlidingUnderline } from "../../hooks/useSlidingUnderline";
import type { Game, Team } from "../../types";
import { useMoneyPuck, useMoneyPuckRefresh } from "../../lib/moneypuck-client";
import { NHLPLUS_EVENT, useNhlPlusTarget } from "../../lib/nhlplus-nav";
import type { NhlPlusTarget, NhlPlusView } from "../../lib/nhlplus-nav";
import { refreshMessage } from "../../lib/nhlplus-view.mjs";
import { DataStatus } from "./shared/DataStatus";
import "./shared/shared.css";
import "./nhlplus.css";
import { INITIAL } from "./state";
import type { NpState } from "./state";
import type { Ctx } from "./context";
import { TeamsView } from "./views/TeamsView";
import { MatchupsView } from "./views/MatchupsView";
import { GoalieView } from "./views/GoalieView";
import { PlayersView } from "./views/PlayersView";
import { TrendsView } from "./views/TrendsView";
import { MatrixView } from "./views/MatrixView";
import { DataView } from "./views/DataView";

const VIEWS: [NhlPlusView, string][] = [["teams", "Teams"], ["matchups", "Matchups"], ["goalies", "Goalies"], ["players", "Players"], ["trends", "Trends"], ["matrix", "Play vs results"], ["data", "Data"]];

// Filters live here, outside React, so they survive switching between NHL+ views and between dashboard tabs.
let saved: NpState = INITIAL;
let handledNonce = 0;

export function NhlPlus({ games, season }: { games: Game[]; season: number; teams?: Team[] }) {
  const [s, setS] = useState<NpState>(saved);
  const set = useCallback((patch: Partial<NpState>) => setS((cur) => (saved = { ...cur, ...patch })), []);
  const target = useNhlPlusTarget();
  // A target arrives through the store (read on mount and on change) or the window event (while mounted); a nonce is applied once.
  const apply = useCallback((t: NhlPlusTarget | null | undefined) => {
    if (!t || t.nonce === handledNonce) return;
    handledNonce = t.nonce;
    const patch: Partial<NpState> = { view: t.view };
    if (t.view === "matchups") { patch.mA = t.away ?? null; patch.mB = t.home ?? null; patch.mGame = t.gameId ?? null; }
    if (t.team) { patch.highlight = [t.team]; patch.tTeam = t.team; }
    if (t.sit && t.sit !== "other") patch.sit = t.sit;
    set(patch);
  }, [set]);
  useEffect(() => { apply(target); }, [target, apply]);
  useEffect(() => {
    const on = (e: Event) => apply((e as CustomEvent<NhlPlusTarget>).detail);
    window.addEventListener(NHLPLUS_EVENT, on);
    return () => window.removeEventListener(NHLPLUS_EVENT, on);
  }, [apply]);

  const v = s.view;
  const subnav = useRef<HTMLElement>(null);
  useSlidingUnderline(subnav, v);
  const summary = useMoneyPuck(season, "summary");
  const skaters = useMoneyPuck(season, "skaters", { enabled: v === "players" || (v === "data" && s.dSource === "skaters") });
  const lines = useMoneyPuck(season, "lines", { enabled: (v === "players" && s.pTab === "lines") || (v === "data" && s.dSource === "lines") });
  const gamesPart = useMoneyPuck(season, "games", { enabled: v === "matchups" || v === "trends" || v === "data" });
  const refresh = useMoneyPuckRefresh(season);
  const toggleTeam = useCallback((team: string) => setS((cur) => (saved = { ...cur, highlight: cur.highlight.includes(team) ? cur.highlight.filter((t) => t !== team) : [...cur.highlight, team] })), []);
  const ctx: Ctx = { season, s, set, summary, skaters, lines, games: gamesPart, appGames: games, toggleTeam, refresh };

  const primary = v === "players" ? (s.pTab === "lines" ? lines : skaters) : v === "trends" ? gamesPart : v === "data" && s.dSource === "skaters" ? skaters : v === "data" && s.dSource === "lines" ? lines : summary;
  const what = v === "trends" ? "Game data" : "Season data";
  const msg = refreshMessage(refresh.result, refresh.error);
  return (
    <section className="nhlplus" aria-label="NHL+">
      <h2 className="sr-only">NHL+</h2>
      <div className="np-bar">
        <nav ref={subnav} className="np-subnav" aria-label="NHL+ views">
          {VIEWS.map(([id, label]) => <button key={id} type="button" aria-pressed={v === id} onClick={() => set({ view: id })}>{label}</button>)}
        </nav>
        <div className="np-refresh-top">
          {msg && <span role="status" aria-live="polite" className="np-refresh-msg">{msg}</span>}
          <button type="button" className="np-refresh-btn" disabled={refresh.running} onClick={() => refresh.refresh()} aria-label="Check MoneyPuck for new data">{refresh.running ? "Checking…" : "↻ Refresh"}</button>
        </div>
      </div>
      <DataStatus compact state={primary.state} updated={primary.updated} stale={primary.stale} savedCopy={primary.savedCopy} what={what} onRetry={primary.retry} />
      <div className="np-body">
        {v === "teams" && <TeamsView ctx={ctx} />}
        {v === "matchups" && <MatchupsView ctx={ctx} />}
        {v === "goalies" && <GoalieView ctx={ctx} />}
        {v === "players" && <PlayersView ctx={ctx} />}
        {v === "trends" && <TrendsView ctx={ctx} />}
        {v === "matrix" && <MatrixView ctx={ctx} />}
        {v === "data" && <DataView ctx={ctx} />}
      </div>
    </section>
  );
}
