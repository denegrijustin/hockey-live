import { useEffect, useRef, useState } from "react";
import { useMedia } from "../hooks/useMedia";
import { useSlidingUnderline } from "../hooks/useSlidingUnderline";
import { Icon, type IconName } from "./icons";

interface ViewDef {
  id: string;
  label: string;
  /** The shorter name under the icon in the phone tab bar. */
  short: string;
  icon: IconName;
  /** One line on what is there: shown in the More menu and the desktop sidebar. */
  hint: string;
}

const V = (id: string, label: string, icon: IconName, short = label, hint = ""): ViewDef => ({ id, label, short, icon, hint });
const HOME = V("scoreboard", "Home", "home", "Home", "Today's games and the league at a glance");
const GAMES = V("games", "Games", "games", "Games", "Every game: schedule, scores and live, with filters and search");
const STANDINGS = V("standings", "Standings", "standings", "Standings", "League, conference and division tables, resumés");
const TEAMS = V("teams", "Teams", "teams", "Teams", "All 32 teams and their profiles");
const YESTERDAY = V("yesterday", "Last night", "night", "Last night", "Final scores and the best and worst nights");
const TEAMSCHED = V("teamschedule", "Schedule", "calendar", "Schedule", "A team's season as a list or calendar");
const TRENDS = V("trends", "Team trends", "trends", "Trends", "Momentum, playoff outlook and goals saved above expected");
const ODDS = V("odds", "Playoff odds", "odds", "Playoff odds", "Simulated chances and the playoff tracker");
const PICKS = V("picks", "Picks", "picks", "Picks", "Win picks and how they have done");
const NHLPLUS = V("nhlplus", "NHL+", "nhlplus", "NHL+", "Advanced team, goalie and player analytics");
const EDGE = V("edge", "NHL EDGE", "edge", "NHL EDGE", "Skating speed and shot tracking from NHL EDGE");
const MAP = V("map", "Imperialism map", "map", "Imperialism map", "Which team has beaten the most of the league");
const PLAYERS = V("players", "Players", "players", "Players", "Skater impact and goalie leaders");
const INJURIES = V("injuries", "Injury report", "injury", "Injuries", "Who is out, how long and how much it matters");

/** The four everyday destinations; the fifth, More, holds the groups below. Same on a phone's tab bar and at the top of the desktop sidebar. */
const PRIMARY = [HOME, GAMES, STANDINGS, TEAMS];
/** Everything else, grouped by what you are trying to do. Each entry is a real screen. */
export const MORE_GROUPS: { title: string; items: ViewDef[] }[] = [
  { title: "Games & schedule", items: [YESTERDAY, TEAMSCHED] },
  { title: "League intelligence", items: [TRENDS, ODDS, PICKS, NHLPLUS, EDGE, MAP] },
  { title: "Players & teams", items: [PLAYERS, INJURIES] },
];
const MORE = MORE_GROUPS.flatMap((g) => g.items);
export const VIEW_IDS = [...PRIMARY, ...MORE].map((v) => v.id);
/** Page titles, for the tab title and the screen-reader announcement on a view change. */
export const VIEW_TITLES: Record<string, string> = Object.fromEntries([...PRIMARY, ...MORE].map((v) => [v.id, v.label]));

export function MainNav({ view, setView, liveCount = 0, onRefresh, onChooseTeams }: { view: string; setView: (id: string) => void; liveCount?: number; onRefresh?: () => void; onChooseTeams?: () => void }) {
  const wide = useMedia("(min-width: 1100px)");
  const [more, setMore] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const inMore = MORE.some((v) => v.id === view);
  useSlidingUnderline(bar, inMore ? "more" : view);
  if (wide) {
    return (
      <nav className="side-nav" aria-label="Main">
        <ul className="side-group" aria-label="Main destinations">
          {PRIMARY.map((v) => (
            <li key={v.id}>
              <button className="nav-item" aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
                <Icon name={v.icon} size={20} />
                {v.label}
                {v.id === "scoreboard" && liveCount > 0 && <i className="tab-dot inline" data-testid="live-dot" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
        {MORE_GROUPS.map((g) => (
          <div className="side-group" key={g.title}>
            <h2 className="side-title">{g.title}</h2>
            <ul>
              {g.items.map((v) => (
                <li key={v.id}>
                  <button className="nav-item" aria-current={view === v.id ? "page" : undefined} title={v.hint} onClick={() => setView(v.id)}>
                    <Icon name={v.icon} size={20} />
                    {v.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    );
  }
  const close = () => { setMore(false); moreBtn.current?.focus({ preventScroll: true }); };
  return (
    <>
      <nav ref={bar} className="tab-bar" aria-label="Main">
        {PRIMARY.map((v) => (
          <button key={v.id} className="tab-item" aria-label={v.label} aria-current={view === v.id ? "page" : undefined} onClick={() => { setMore(false); setView(v.id); }}>
            <Icon name={v.icon} />
            {v.id === "scoreboard" && liveCount > 0 && <i className="tab-dot" data-testid="live-dot" aria-hidden="true" />}
            <span aria-hidden="true">{v.short}</span>
          </button>
        ))}
        <button ref={moreBtn} className="tab-item" aria-label="More" aria-haspopup="dialog" aria-expanded={more} aria-current={inMore ? "page" : undefined} onClick={() => setMore((open) => !open)}>
          <Icon name="more" />
          <span aria-hidden="true">More</span>
        </button>
      </nav>
      {more && <MoreMenu view={view} onPick={(id) => { setView(id); setMore(false); }} onRefresh={onRefresh} onChooseTeams={onChooseTeams} onClose={close} />}
    </>
  );
}

/** The More menu: grouped, with a line on what each screen holds. Tapping outside or pressing Escape closes it and returns focus to More. */
function MoreMenu({ view, onPick, onRefresh, onChooseTeams, onClose }: { view: string; onPick: (id: string) => void; onRefresh?: () => void; onChooseTeams?: () => void; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current?.querySelector("button")?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      // Keep Tab inside the open menu.
      if (e.key !== "Tab" || !menu.current) return;
      const items = [...menu.current.querySelectorAll<HTMLElement>("button")];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <>
      <div className="menu-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={menu} className="more-menu" role="dialog" aria-label="More">
        {MORE_GROUPS.map((g) => (
          <section className="menu-group" key={g.title} aria-label={g.title}>
            <h2>{g.title}</h2>
            <div className="menu-grid">
              {g.items.map((v) => (
                <button key={v.id} className="menu-item" aria-current={view === v.id ? "page" : undefined} onClick={() => onPick(v.id)}>
                  <Icon name={v.icon} size={22} />
                  <span><b>{v.label}</b><small>{v.hint}</small></span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {(onRefresh || onChooseTeams) && (
          <section className="menu-group" aria-label="Application">
            <h2>Application</h2>
            <div className="menu-grid">
              {onChooseTeams && (
                <button className="menu-item" onClick={() => { onChooseTeams(); onClose(); }}>
                  <Icon name="preferences" size={22} />
                  <span><b>My teams</b><small>Choose the teams you follow</small></span>
                </button>
              )}
              {onRefresh && (
                <button className="menu-item" onClick={() => { onRefresh(); onClose(); }}>
                  <Icon name="refresh" size={22} />
                  <span><b>Refresh data</b><small>Check the NHL for new results</small></span>
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
