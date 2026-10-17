import { useEffect, useRef, useState } from "react";
import { useMedia } from "../hooks/useMedia";
import { useSheetDrag } from "../hooks/useSheetDrag";
import { Icon, type IconName } from "./icons";

interface ViewDef {
  id: string;
  label: string;
  /** The shorter name under the icon in the phone tab bar. */
  short: string;
  icon: IconName;
}

const V = (id: string, label: string, icon: IconName, short = label): ViewDef => ({ id, label, short, icon });
const GAMES = V("games", "Game center", "games", "Games");
const STANDINGS = V("standings", "Standings", "standings");
const TRENDS = V("trends", "Team trends", "trends", "Trends");
const PLAYERS = V("players", "Players", "players");
const NHLPLUS = V("nhlplus", "NHL+", "nhlplus");
const EDGE = V("edge", "NHL EDGE", "edge");
const ODDS = V("odds", "Playoff odds", "odds");
const MAP = V("map", "Imperialism map", "map");

/** Phones: four views in the tab bar, the rest behind More (the HIG caps a tab bar at five). */
const PRIMARY = [GAMES, STANDINGS, TRENDS, PLAYERS];
const MORE = [NHLPLUS, EDGE, ODDS, MAP];
/** Desktop: every view, grouped, in a sidebar. */
const GROUPS: [string, ViewDef[]][] = [
  ["Dashboard", [GAMES, STANDINGS, ODDS]],
  ["Analytics", [NHLPLUS, TRENDS, EDGE, PLAYERS]],
  ["Explore", [MAP]],
];

export function MainNav({ view, setView }: { view: string; setView: (id: string) => void }) {
  const wide = useMedia("(min-width: 1100px)");
  const [more, setMore] = useState(false);
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
      <nav className="tab-bar" aria-label="Dashboard views">
        {PRIMARY.map((v) => (
          <button key={v.id} className="tab-item" aria-label={v.label} aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
            <Icon name={v.icon} />
            <span aria-hidden="true">{v.short}</span>
          </button>
        ))}
        <button className="tab-item" aria-label="More" aria-haspopup="dialog" aria-current={inMore ? "page" : undefined} onClick={() => setMore(true)}>
          <Icon name="more" />
          <span aria-hidden="true">More</span>
        </button>
      </nav>
      {more && <MoreSheet view={view} onPick={(id) => { setView(id); setMore(false); }} onClose={() => setMore(false)} />}
    </>
  );
}

function MoreSheet({ view, onPick, onClose }: { view: string; onPick: (id: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useSheetDrag(dialog, onClose);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="sheet more-sheet"
      aria-label="More"
      onClose={onClose}
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}
    >
      <div className="sheet-bar" {...drag}>
        <span className="sheet-grabber" aria-hidden="true" />
        <h2>More</h2>
        <button className="sheet-done" onClick={onClose}>Done</button>
      </div>
      <ul className="sheet-list">
        {MORE.map((v) => (
          <li key={v.id}>
            <button className="sheet-row" aria-current={view === v.id ? "page" : undefined} onClick={() => onPick(v.id)}>
              <Icon name={v.icon} size={22} />
              <span>{v.label}</span>
              <Icon name="chevron" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
