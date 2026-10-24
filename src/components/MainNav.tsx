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
}

const V = (id: string, label: string, icon: IconName, short = label): ViewDef => ({ id, label, short, icon });
const SCORES = V("scoreboard", "Scoreboard", "games", "Scores");
const SCHEDULE = V("games", "Schedule", "calendar");
const PICKS = V("picks", "Picks", "picks");
const TEAMSCHED = V("teamschedule", "Team schedule", "team", "Team schedule");
const STANDINGS = V("standings", "Standings", "standings");
const TRENDS = V("trends", "Team trends", "trends", "Trends");
const PLAYERS = V("players", "Players", "players");
const NHLPLUS = V("nhlplus", "NHL+", "nhlplus");
const EDGE = V("edge", "NHL EDGE", "edge");
const ODDS = V("odds", "Playoff odds", "odds");
const MAP = V("map", "Imperialism map", "map");

/** Phones: four views in the tab bar, the rest behind More (the HIG caps a tab bar at five). */
const PRIMARY = [SCORES, STANDINGS, TRENDS, PLAYERS];
const MORE = [SCHEDULE, TEAMSCHED, PICKS, NHLPLUS, EDGE, ODDS, MAP];
export const VIEW_IDS = [...PRIMARY, ...MORE].map((v) => v.id);
/** Desktop: every view, grouped, in a sidebar. */
const GROUPS: [string, ViewDef[]][] = [
  ["Dashboard", [SCORES, SCHEDULE, TEAMSCHED, PICKS, STANDINGS, ODDS]],
  ["Analytics", [NHLPLUS, TRENDS, EDGE, PLAYERS]],
  ["Explore", [MAP]],
];

export function MainNav({ view, setView, liveCount = 0, onRefresh }: { view: string; setView: (id: string) => void; liveCount?: number; onRefresh?: () => void }) {
  const wide = useMedia("(min-width: 1100px)");
  const [more, setMore] = useState(false);
  const bar = useRef<HTMLElement>(null);
  useSlidingUnderline(bar, MORE.some((v) => v.id === view) ? "more" : view);
  if (wide) {
    return (
      <nav className="side-nav" aria-label="Dashboard views">
        {GROUPS.map(([title, items]) => (
          <div className="side-group" key={title}>
            <p className="side-title">{title}</p>
            {items.map((v) => (
              <button key={v.id} className="nav-item" aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
                <Icon name={v.icon} size={20} />
                {v.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
    );
  }
  const inMore = MORE.some((v) => v.id === view);
  return (
    <>
      <nav ref={bar} className="tab-bar" aria-label="Dashboard views">
        {PRIMARY.map((v) => (
          <button key={v.id} className="tab-item" aria-label={v.label} aria-current={view === v.id ? "page" : undefined} onClick={() => { setMore(false); setView(v.id); }}>
            <Icon name={v.icon} />
            {v.id === "scoreboard" && liveCount > 0 && <i className="tab-dot" data-testid="live-dot" aria-hidden="true" />}
            <span aria-hidden="true">{v.short}</span>
          </button>
        ))}
        <button className="tab-item" aria-label="More" aria-haspopup="dialog" aria-expanded={more} aria-current={inMore ? "page" : undefined} onClick={() => setMore((open) => !open)}>
          <Icon name="more" />
          <span aria-hidden="true">More</span>
        </button>
      </nav>
      {more && <MoreMenu view={view} onPick={(id) => { setView(id); setMore(false); }} onRefresh={onRefresh} onClose={() => setMore(false)} />}
    </>
  );
}

/** The More menu: a two-column icon menu that floats above the tab bar. Tapping outside or pressing Escape closes it. */
function MoreMenu({ view, onPick, onRefresh, onClose }: { view: string; onPick: (id: string) => void; onRefresh?: () => void; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current?.querySelector("button")?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <>
      <div className="menu-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={menu} className="more-menu" role="dialog" aria-label="More">
        {MORE.map((v) => (
          <button key={v.id} className="menu-item" aria-current={view === v.id ? "page" : undefined} onClick={() => onPick(v.id)}>
            <Icon name={v.icon} size={22} />
            {v.label}
          </button>
        ))}
        {onRefresh && (
          <button className="menu-item" onClick={() => { onRefresh(); onClose(); }}>
            <Icon name="refresh" size={22} />
            Refresh data
          </button>
        )}
      </div>
    </>
  );
}
