import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { GcTab } from "./GameCenterUi";

export const GC_TAB_LIST: { id: GcTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "pbp", label: "Play-by-Play" },
  { id: "stats", label: "Team Stats" },
  { id: "players", label: "Players" },
  { id: "intel", label: "Matchup Intelligence" },
];

/**
 * The Game Center's sticky section tabs (WAI-ARIA tabs, automatic activation: arrows, Home, End move focus and select).
 * Every pane stays mounted; inactive ones carry `hidden`, so lazy sections and selectors keep working and no state is lost.
 * The bar scrolls sideways on its own when the labels do not fit; the page never does.
 */
export function GameTabs({ tab, onTab, panes }: { tab: GcTab; onTab: (tab: GcTab) => void; panes: Record<GcTab, ReactNode> }) {
  const refs = useRef<Partial<Record<GcTab, HTMLButtonElement | null>>>({});
  const onKey = (event: KeyboardEvent) => {
    const i = GC_TAB_LIST.findIndex((t) => t.id === tab);
    const to = event.key === "ArrowRight" ? i + 1 : event.key === "ArrowLeft" ? i - 1 : event.key === "Home" ? 0 : event.key === "End" ? GC_TAB_LIST.length - 1 : null;
    if (to == null) return;
    event.preventDefault();
    const next = GC_TAB_LIST[(to + GC_TAB_LIST.length) % GC_TAB_LIST.length].id;
    onTab(next);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div className="gc-tabs" role="tablist" aria-label="Game sections" onKeyDown={onKey} data-testid="gc-tabs">
        {GC_TAB_LIST.map((t) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`gc-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`gc-pane-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {GC_TAB_LIST.map((t) => (
        <div key={t.id} className="gc-pane" role="tabpanel" id={`gc-pane-${t.id}`} aria-labelledby={`gc-tab-${t.id}`} data-pane={t.id} hidden={tab !== t.id} tabIndex={-1}>
          {panes[t.id]}
        </div>
      ))}
    </>
  );
}
