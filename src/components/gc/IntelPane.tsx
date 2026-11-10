import { useEffect, useMemo, useState } from "react";
import type { Team, Game } from "../../types";
import { useGameCenter } from "./GameCenterContext";
import { useLeagueMatchups } from "../useLeagueMatchups";
import { TeamLink } from "../TeamProfile";
import { BASIS_HELP, BASIS_LABEL, buildIntel, intelPhase } from "../../lib/game-intel.mjs";
import "./intel.css";

/**
 * Props the Overview/Intel host passes (all optional; without them the pane still shows the live and postgame flow facts).
 *  - before: the PREGAME standings table for this game, i.e. `before` as GameOverlay already receives it (analysis `before[game.id]`).
 *  - teams: all teams (needed for the playoff line, divisions and names).
 *  - allGames: the season's games (needed only for the computed clinch status).
 *  - matchups: league snapshot override; by default the pane reads it with useLeagueMatchups (shared cache, same data as the Matchup lens).
 *  - exclude: ids or kinds already shown elsewhere (pass the ids returned by matchupInsights so nothing repeats).
 *  - analysis / table: accepted for the contract; not used (the pregame table is what is true before the puck drops).
 */
export type IntelPaneProps = {
  analysis?: unknown;
  before?: Record<string, any> | null;
  table?: Record<string, any> | null;
  teams?: Team[];
  allGames?: Game[];
  matchups?: any;
  exclude?: string[];
};

type Item = { id: string; kind: string; phase: "pre" | "live" | "post"; priority: number; text: string; detail: string; basis: "official" | "derived" | "historical" | "projection"; link?: { team?: string; section?: string } };
const GROUPS = { pre: "Pregame", live: "Live", post: "Postgame" } as const;

export default function IntelPane({ before = null, teams = [], allGames = [], matchups, exclude = [] }: IntelPaneProps) {
  const { game, plays, feed, status, live, stale, error } = useGameCenter();
  const phase = intelPhase(game);
  const season = useLeagueMatchups(game.season, !matchups && phase !== "post" && phase !== null);
  const snapshot = matchups ?? season.data;
  const exKey = exclude.join("|");
  const items: Item[] = useMemo(
    () => buildIntel(game, { plays, situation: feed?.situation ?? null, teams, before, allGames, matchups: snapshot, exclude }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, plays, feed?.situation, teams, before, allGames, snapshot, exKey],
  );
  const [lens, setLens] = useState(false);
  useEffect(() => { setLens(!!document.querySelector(".game-dialog .tr-lens")); }, [items]);
  const names = (id: string) => teams.find((t) => t.id === id)?.short ?? id;

  const groups = (["pre", "live", "post"] as const).filter((g) => items.some((i) => i.phase === g));
  const used = new Set(items.map((i) => i.basis));
  const needsFeed = (phase === "live" || phase === "post") && !feed && !error;
  const noGoals = (phase === "live" || phase === "post") && feed && !items.some((i) => i.kind === "flow");

  return (
    <section className="gc-intel" data-testid="gc-intel" aria-label="Game intelligence" data-phase={phase ?? "none"}>
      {phase === null && <p className="gc-intel-note" role="status">{status.label}: no game intelligence for a game that is not scheduled to be played.</p>}
      {needsFeed && <p className="gc-intel-note" role="status">Loading play-by-play...</p>}
      {error && !feed && (phase === "live" || phase === "post") && <p className="gc-intel-note" role="status">Play-by-play is unavailable right now, so goal-flow facts are left out.</p>}
      {live && stale && <p className="gc-intel-note" role="status">Live data may be out of date; the facts below are from the last update.</p>}
      {groups.map((g) => (
        <section key={g} className="gc-intel-group" aria-labelledby={`gc-intel-${g}`} data-group={g}>
          <h3 id={`gc-intel-${g}`}>{GROUPS[g]}</h3>
          <ul>
            {items.filter((i) => i.phase === g).map((i) => (
              <li key={i.id} className="gc-intel-item" data-intel-id={i.id} data-kind={i.kind} data-basis={i.basis}>
                <p className="gc-intel-text">
                  <span>{i.text}</span>
                  <span className={`gc-basis gc-basis-${i.basis}`} title={BASIS_HELP[i.basis as keyof typeof BASIS_HELP]}>{BASIS_LABEL[i.basis as keyof typeof BASIS_LABEL]}</span>
                </p>
                <p className="gc-intel-detail">{i.detail}</p>
                <Links item={i} lens={lens} name={names} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {noGoals && <p className="gc-intel-note" role="status">{items.length ? "No goals yet, so there is no goal-flow to report." : "No goals in the play-by-play, so there is no goal-flow to report."}</p>}
      {groups.length === 0 && !needsFeed && phase !== null && !noGoals && <p className="gc-intel-note" role="status">Nothing to add beyond what the sections above show.</p>}
      <dl className="gc-intel-legend" aria-label="What the labels mean">
        {(Object.keys(BASIS_LABEL) as (keyof typeof BASIS_LABEL)[]).filter((b) => used.has(b) || !items.length).map((b) => (
          <div key={b}><dt className={`gc-basis gc-basis-${b}`}>{BASIS_LABEL[b]}</dt><dd>{BASIS_HELP[b]}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function Links({ item, lens, name }: { item: Item; lens: boolean; name: (id: string) => string }) {
  const link = item.link;
  if (!link) return null;
  const toLens = link.section === "matchup-lens" && lens;
  if (!link.team && !toLens) return null;
  return (
    <p className="gc-intel-links">
      {link.team && <TeamLink id={link.team} className="gc-intel-link">{name(link.team)} profile</TeamLink>}
      {toLens && (
        <button type="button" className="gc-intel-link" onClick={() => document.querySelector(".game-dialog .tr-lens")?.scrollIntoView({ block: "center" })}>
          See the Matchup lens
        </button>
      )}
    </p>
  );
}
