import { Icon } from "../icons";
import { HomeSection } from "./HomeSection";

export type IntelLink = { view: string; label: string; hint: string };

/** Real links into the app's other screens; each is passed in only when it has data behind it. A plain click navigates in place, others open the address. */
export function LeagueIntel({ links, onNavigate, onBrowse, chips }: { links: IntelLink[]; onNavigate: (view: string) => void; onBrowse?: () => void; chips?: boolean }) {
  if (!links.length && !onBrowse) return null;
  return (
    <HomeSection id="intel" label="League intelligence" className="intel">
      {links.length > 0 && (
        <ul className={`home-intel${chips ? " chips" : ""}`}>
          {links.map((l) => (
            <li key={l.view}>
              <a href={`/?view=${l.view}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); onNavigate(l.view); }}>
                <b>{l.label}</b>
                <span>{l.hint}</span>
                <Icon name="chevron" size={16} />
              </a>
            </li>
          ))}
        </ul>
      )}
      {onBrowse && <button type="button" className="sb-browse" onClick={onBrowse}>All games, filters &amp; search <Icon name="chevron" size={16} /></button>}
    </HomeSection>
  );
}
